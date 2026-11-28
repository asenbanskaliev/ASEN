/* Synthetic objects only. This probe neither reads file data nor mutates an open store. */
#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winternl.h>
#include <aclapi.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

/* Native dispositions/options (not Win32 CreateFile flags). */
enum { nt_open = 1, nt_create = 2, nt_directory = 1, nt_file = 0x40,
       nt_sync = 0x20, nt_open_reparse_point = 0x00200000, obj_case_insensitive = 0x40 };
typedef NTSTATUS (NTAPI *CreateRelative)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES,
    PIO_STATUS_BLOCK, PLARGE_INTEGER, ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
static CreateRelative create_relative;
static const DWORD share_all = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;

static BOOL load_native(void)
{
    HMODULE dll = GetModuleHandleW(L"ntdll.dll");
    FARPROC address = dll ? GetProcAddress(dll, "NtCreateFile") : NULL;
    _Static_assert(sizeof address == sizeof create_relative, "native function pointer size");
    memcpy(&create_relative, &address, sizeof address); /* Avoid an untyped call. */
    return create_relative != NULL;
}

static HANDLE child(HANDLE parent, PCWSTR name, ULONG kind, PSECURITY_DESCRIPTOR sd)
{
    USHORT bytes = (USHORT)(wcslen(name) * sizeof(WCHAR)); /* Fixed single components only. */
    UNICODE_STRING component = {bytes, bytes, (PWSTR)name};
    OBJECT_ATTRIBUTES attrs = {(ULONG)sizeof attrs, parent, &component, obj_case_insensitive, sd, NULL};
    IO_STATUS_BLOCK io;
    HANDLE result = INVALID_HANDLE_VALUE;
    ACCESS_MASK access = READ_CONTROL | FILE_READ_ATTRIBUTES | FILE_TRAVERSE | SYNCHRONIZE;
    if (sd && kind == nt_directory) access |= FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY;
    NTSTATUS status = create_relative(&result, access, &attrs, &io, NULL, FILE_ATTRIBUTE_NORMAL, share_all,
        sd ? nt_create : nt_open, nt_sync | nt_open_reparse_point | kind, NULL, 0);
    return status >= 0 ? result : INVALID_HANDLE_VALUE;
}

static BOOL local_ntfs(HANDLE work)
{
    WCHAR fs[16], path[MAX_PATH];
    /* A remote share cannot resolve to a local volume GUID. No fallback to a drive letter. */
    DWORD length = GetFinalPathNameByHandleW(work, path, ARRAYSIZE(path),
        VOLUME_NAME_GUID | FILE_NAME_OPENED);
    return length && length < ARRAYSIZE(path) && wcsncmp(path, L"\\\\?\\Volume{", 11) == 0 &&
        GetVolumeInformationByHandleW(work, NULL, 0, NULL, NULL, NULL, fs, ARRAYSIZE(fs)) &&
        wcscmp(fs, L"NTFS") == 0;
}

static BOOL private_descriptor(PSECURITY_DESCRIPTOR sd, PACL acl, DWORD size, PSID user, BOOL broad)
{
    DWORD world[SECURITY_MAX_SID_SIZE / sizeof(DWORD)];
    DWORD world_size = sizeof world;
    return InitializeAcl(acl, size, ACL_REVISION) &&
        AddAccessAllowedAce(acl, ACL_REVISION, FILE_ALL_ACCESS, user) &&
        (!broad || (CreateWellKnownSid(WinWorldSid, NULL, world, &world_size) &&
            AddAccessAllowedAce(acl, ACL_REVISION, FILE_READ_DATA, world))) &&
        InitializeSecurityDescriptor(sd, SECURITY_DESCRIPTOR_REVISION) &&
        SetSecurityDescriptorOwner(sd, user, FALSE) &&
        SetSecurityDescriptorDacl(sd, TRUE, acl, FALSE) &&
        SetSecurityDescriptorControl(sd, SE_DACL_PROTECTED, SE_DACL_PROTECTED);
}

static BOOL exact_dacl(PSECURITY_DESCRIPTOR sd, PACL acl, PSID user)
{
    SECURITY_DESCRIPTOR_CONTROL control;
    DWORD revision;
    PVOID entry;
    if (!GetSecurityDescriptorControl(sd, &control, &revision) ||
        (control & (SE_DACL_PROTECTED | SE_DACL_PRESENT)) != (SE_DACL_PROTECTED | SE_DACL_PRESENT) ||
        !acl || acl->AceCount != 1 || !GetAce(acl, 0, &entry)) {
        return FALSE;
    }
    const ACCESS_ALLOWED_ACE *ace = entry;
    return ace->Header.AceType == ACCESS_ALLOWED_ACE_TYPE && ace->Header.AceFlags == 0 &&
        ace->Mask == FILE_ALL_ACCESS && EqualSid((PSID)&ace->SidStart, user);
}

static const char *inspect(HANDLE handle, PSID user, BOOL directory)
{
    BY_HANDLE_FILE_INFORMATION info;
    if (handle == INVALID_HANDLE_VALUE) return "open";
    if (!GetFileInformationByHandle(handle, &info)) return "attributes";
    if (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) return "reparse";
    if (GetFileType(handle) != FILE_TYPE_DISK ||
        ((info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) != directory) return "type";
    if (!directory && info.nNumberOfLinks != 1) return "links";

    PSID owner = NULL;
    PACL acl = NULL;
    PSECURITY_DESCRIPTOR sd = NULL;
    const char *failure = "security";
    if (GetSecurityInfo(handle, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &owner, NULL, &acl, NULL, &sd) == ERROR_SUCCESS) {
        failure = !owner || !EqualSid(owner, user) ? "owner" :
            exact_dacl(sd, acl, user) ? NULL : "dacl";
    }
    if (sd) LocalFree(sd);
    return failure;
}

static int probe(HANDLE work, PSID user)
{
    const PCWSTR names[] = {L"root", L"origin", L"state"};
    const char *labels[] = {"root", "origin", "state"};
    HANDLE parent = work;
    for (DWORD i = 0; i < ARRAYSIZE(names); ++i) {
        HANDLE current = child(parent, names[i], 0, NULL);
        if (parent != work) CloseHandle(parent);
        const char *failure = inspect(current, user, i < 2);
        if (failure) {
            if (current != INVALID_HANDLE_VALUE) CloseHandle(current);
            fprintf(stderr, "%s:%s\n", labels[i], failure);
            return 1;
        }
        parent = current;
    }
    CloseHandle(parent);
    return 0;
}

static BOOL setup(HANDLE work, PSID user, BOOL broad, BOOL wrong_type)
{
    SECURITY_DESCRIPTOR sd;
    DWORD storage[64];
    PACL acl = (PACL)storage;
    if (!private_descriptor(&sd, acl, sizeof storage, user, FALSE)) return FALSE;
    HANDLE root = child(work, L"root", nt_directory, &sd);
    if (root == INVALID_HANDLE_VALUE) return FALSE;
    HANDLE origin = child(root, L"origin", nt_directory, &sd);
    CloseHandle(root);
    if (origin == INVALID_HANDLE_VALUE) return FALSE;
    HANDLE state = INVALID_HANDLE_VALUE;
    if (!broad || private_descriptor(&sd, acl, sizeof storage, user, TRUE)) {
        state = child(origin, L"state", wrong_type ? nt_directory : nt_file, &sd);
    }
    CloseHandle(origin);
    if (state == INVALID_HANDLE_VALUE) return FALSE;
    CloseHandle(state);
    return TRUE;
}

int main(int argc, char **argv)
{
    if (argc != 2) return 2;
    BOOL broad = strcmp(argv[1], "broad") == 0;
    BOOL wrong_type = strcmp(argv[1], "type") == 0;
    BOOL reading = strcmp(argv[1], "probe") == 0;
    if (!broad && !wrong_type && !reading && strcmp(argv[1], "setup") != 0) return 2;
    DWORD access = FILE_READ_ATTRIBUTES | FILE_TRAVERSE;
    if (!reading) access |= FILE_ADD_SUBDIRECTORY;
    HANDLE work = CreateFileW(L".", access, share_all, NULL,
        OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
    if (work == INVALID_HANDLE_VALUE) {
        fprintf(stderr, "test workspace open failed\n");
        return 2;
    }
    BY_HANDLE_FILE_INFORMATION info;
    int result = 2;
    struct { TOKEN_USER user; BYTE sid[SECURITY_MAX_SID_SIZE]; } token_user;
    DWORD size;
    HANDLE token;
    if (!GetFileInformationByHandle(work, &info) ||
        !(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
        (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
        fprintf(stderr, "test workspace is not a plain directory\n");
    } else if (!local_ntfs(work)) {
        fprintf(stderr, "local NTFS unavailable\n");
        result = 77;
    } else if (load_native() && OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
        BOOL got_sid = GetTokenInformation(token, TokenUser, &token_user, sizeof token_user, &size);
        CloseHandle(token);
        if (got_sid && reading) result = probe(work, token_user.user.User.Sid);
        else if (got_sid && setup(work, token_user.user.User.Sid, broad, wrong_type)) result = 0;
        if (result == 2) fprintf(stderr, "synthetic object setup failed\n");
    } else {
        fprintf(stderr, "native API or process token unavailable\n");
    }
    CloseHandle(work);
    return result;
}

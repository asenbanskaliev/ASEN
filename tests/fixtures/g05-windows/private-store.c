/* Synthetic objects only. No production store, and no power-loss durability claim. */
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
       nt_sync = 0x20, nt_open_reparse_point = 0x00200000, obj_case_insensitive = 0x40,
       nt_rename_information = 10 };
typedef NTSTATUS (NTAPI *CreateRelative)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES,
    PIO_STATUS_BLOCK, PLARGE_INTEGER, ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
typedef NTSTATUS (NTAPI *SetNativeInfo)(HANDLE, PIO_STATUS_BLOCK, PVOID, ULONG, FILE_INFORMATION_CLASS);
static CreateRelative create_relative;
static SetNativeInfo set_native_info;
static const DWORD share_pinned = FILE_SHARE_READ | FILE_SHARE_WRITE;
static const DWORD share_all = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;

static BOOL load_native(void)
{
    HMODULE dll = GetModuleHandleW(L"ntdll.dll");
    FARPROC address = dll ? GetProcAddress(dll, "NtCreateFile") : NULL;
    _Static_assert(sizeof address == sizeof create_relative && sizeof address == sizeof set_native_info,
        "native function pointer sizes");
    memcpy(&create_relative, &address, sizeof address); /* Avoid an untyped call. */
    address = dll ? GetProcAddress(dll, "NtSetInformationFile") : NULL;
    memcpy(&set_native_info, &address, sizeof address);
    return create_relative != NULL;
}

static HANDLE open_child(HANDLE parent, PCWSTR name, ULONG kind, PSECURITY_DESCRIPTOR sd,
    ACCESS_MASK access, DWORD sharing, NTSTATUS *out_status)
{
    USHORT bytes = (USHORT)(wcslen(name) * sizeof(WCHAR)); /* Fixed single components only. */
    UNICODE_STRING component = {bytes, bytes, (PWSTR)name};
    OBJECT_ATTRIBUTES attrs = {(ULONG)sizeof attrs, parent, &component, obj_case_insensitive, sd, NULL};
    IO_STATUS_BLOCK io;
    HANDLE result = INVALID_HANDLE_VALUE;
    NTSTATUS status = create_relative(&result, access, &attrs, &io, NULL, FILE_ATTRIBUTE_NORMAL, sharing,
        sd ? nt_create : nt_open, nt_sync | nt_open_reparse_point | kind, NULL, 0);
    if (out_status) *out_status = status;
    return status >= 0 ? result : INVALID_HANDLE_VALUE;
}

static HANDLE child(HANDLE parent, PCWSTR name, ULONG kind, PSECURITY_DESCRIPTOR sd)
{
    ACCESS_MASK access = READ_CONTROL | FILE_READ_ATTRIBUTES | FILE_TRAVERSE | SYNCHRONIZE;
    if (sd && kind == nt_directory) access |= FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY;
    return open_child(parent, name, kind, sd, access, share_all, NULL);
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

static BOOL put_byte(HANDLE handle, char value)
{
    DWORD written;
    return WriteFile(handle, &value, 1, &written, NULL) && written == 1 && FlushFileBuffers(handle);
}

static BOOL setup(HANDLE work, PSID user, BOOL broad, BOOL wrong_type, BOOL seed)
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
        state = seed ? open_child(origin, L"state", nt_file, &sd,
            FILE_GENERIC_WRITE, share_pinned, NULL) :
            child(origin, L"state", wrong_type ? nt_directory : nt_file, &sd);
    }
    BOOL ok = state != INVALID_HANDLE_VALUE;
    if (ok && seed) {
        HANDLE lock = child(origin, L"lock", nt_file, &sd);
        ok = lock != INVALID_HANDLE_VALUE && put_byte(state, '0');
        if (lock != INVALID_HANDLE_VALUE) CloseHandle(lock);
    }
    if (state != INVALID_HANDLE_VALUE) CloseHandle(state);
    CloseHandle(origin);
    return ok;
}

static HANDLE checked_child(HANDLE parent, PCWSTR name, const char *label, PSID user,
    BOOL directory, ACCESS_MASK access)
{
    HANDLE handle = open_child(parent, name, directory ? nt_directory : nt_file, NULL,
        access | READ_CONTROL | FILE_READ_ATTRIBUTES | SYNCHRONIZE, share_pinned, NULL);
    const char *failure = inspect(handle, user, directory);
    if (!failure) return handle;
    fprintf(stderr, "%s:%s\n", label, failure);
    if (handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
    return INVALID_HANDLE_VALUE;
}

static BOOL acquire(HANDLE lock, BOOL announce_contention)
{
    OVERLAPPED range = {0}; /* Same first byte in the same pinned lock file, not in replaceable state. */
    if (LockFileEx(lock, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &range)) return TRUE;
    if (GetLastError() != ERROR_LOCK_VIOLATION) return FALSE;
    if (announce_contention && (puts("blocked") == EOF || fflush(stdout) != 0)) return FALSE;
    OVERLAPPED wait_range = {0};
    return LockFileEx(lock, LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, &wait_range);
}

static BOOL publish(HANDLE pending, HANDLE origin)
{
    /* Native FileRenameInformation: relative to the checked directory, never to a path. */
    struct {
        ULONG flags; /* Native union: BOOLEAN ReplaceIfExists / ULONG Flags. */
        HANDLE root;
        ULONG bytes;
        WCHAR name[ARRAYSIZE(L"state")];
    } rename_info = {1, origin, (ULONG)(sizeof L"state" - sizeof(WCHAR)), L"state"};
    IO_STATUS_BLOCK io;
    return set_native_info && set_native_info(pending, &io, &rename_info,
        (ULONG)sizeof rename_info, (FILE_INFORMATION_CLASS)nt_rename_information) >= 0;
}

static void print_state(char value, const BY_HANDLE_FILE_INFORMATION *id)
{
    printf("state %c %08lX:%08lX:%08lX\n", value, id->dwVolumeSerialNumber,
        id->nFileIndexHigh, id->nFileIndexLow);
}

/* One synthetic transition: byte '0' is the expected version, A/B are alternate successors. */
static const char *compare_and_swap(HANDLE origin, PSID user, char next)
{
    HANDLE state = checked_child(origin, L"state", "state", user, FALSE, FILE_READ_DATA);
    if (state == INVALID_HANDLE_VALUE) return "state rejected";
    LARGE_INTEGER length;
    BY_HANDLE_FILE_INFORMATION id;
    char current = '\0';
    DWORD read;
    BOOL ok = GetFileSizeEx(state, &length) && length.QuadPart == 1 &&
        ReadFile(state, &current, 1, &read, NULL) && read == 1 && GetFileInformationByHandle(state, &id);
    /* Classic replacement requires closing the old handle. The stable lock protects
       cooperating writers, not a separate process mutating names under the same SID. */
    CloseHandle(state);
    if (!ok) return "state read";
    if (!next) {
        print_state(current, &id);
        return NULL;
    }
    if (current != '0') return "stale";

    SECURITY_DESCRIPTOR sd;
    DWORD storage[64];
    if (!private_descriptor(&sd, (PACL)storage, sizeof storage, user, FALSE)) return "temp descriptor";
    NTSTATUS status;
    HANDLE pending = open_child(origin, L"pending", nt_file, &sd,
        FILE_GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE, share_pinned, &status);
    if (pending == INVALID_HANDLE_VALUE) {
        /* STATUS_OBJECT_NAME_COLLISION. Never open, delete or replace an existing orphan. */
        return (ULONG)status == 0xC0000035UL ? "orphan" : "temp create";
    }
    const char *failure = inspect(pending, user, FALSE);
    if (!failure && (!put_byte(pending, next) || !GetFileInformationByHandle(pending, &id))) failure = "temp flush";
    if (!failure && next == 'A' && (puts("flushed") == EOF || fflush(stdout) != 0 || getchar() != 'g')) {
        failure = "writer gate";
    }
    if (!failure && !publish(pending, origin)) failure = "publish";
    CloseHandle(pending);
    if (!failure) print_state(next, &id);
    return failure;
}

static int transaction(HANDLE work, PSID user, char next)
{
    HANDLE root = checked_child(work, L"root", "root", user, TRUE, FILE_TRAVERSE);
    if (root == INVALID_HANDLE_VALUE) return 1;
    HANDLE origin = checked_child(root, L"origin", "origin", user, TRUE,
        FILE_TRAVERSE | (next ? FILE_ADD_FILE : 0));
    int result = 1;
    if (origin != INVALID_HANDLE_VALUE) {
        HANDLE lock = checked_child(origin, L"lock", "lock", user, FALSE, FILE_GENERIC_READ | FILE_GENERIC_WRITE);
        if (lock != INVALID_HANDLE_VALUE) {
            const char *failure = "lock acquire";
            if (acquire(lock, next == 'B')) {
                failure = compare_and_swap(origin, user, next);
                OVERLAPPED range = {0};
                if (!UnlockFileEx(lock, 0, 1, 0, &range) && !failure) failure = "lock release";
            }
            if (failure) fprintf(stderr, "%s\n", failure);
            else result = 0;
            CloseHandle(lock); /* Windows also releases the range on process termination. */
        }
        CloseHandle(origin);
    }
    CloseHandle(root);
    return result;
}

int main(int argc, char **argv)
{
    if (argc != 2) return 2;
    BOOL broad = strcmp(argv[1], "broad") == 0;
    BOOL wrong_type = strcmp(argv[1], "type") == 0;
    BOOL reading = strcmp(argv[1], "probe") == 0;
    BOOL seed = strcmp(argv[1], "seed") == 0;
    char next = (char)(strcmp(argv[1], "write-a") == 0 ? 'A' : strcmp(argv[1], "write-b") == 0 ? 'B' : 0);
    BOOL cas = next != 0 || strcmp(argv[1], "snapshot") == 0;
    if (!broad && !wrong_type && !reading && !seed && !cas && strcmp(argv[1], "setup") != 0) return 2;
    DWORD access = FILE_READ_ATTRIBUTES | FILE_TRAVERSE;
    if (!reading && !cas) access |= FILE_ADD_SUBDIRECTORY;
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
        else if (got_sid && cas) result = transaction(work, token_user.user.User.Sid, next);
        else if (got_sid && setup(work, token_user.user.User.Sid, broad, wrong_type, seed)) result = 0;
        if (result == 2) fprintf(stderr, "synthetic object setup failed\n");
    } else {
        fprintf(stderr, "native API or process token unavailable\n");
    }
    CloseHandle(work);
    return result;
}

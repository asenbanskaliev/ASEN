/* Synthetic fixture only: fd 3 is a trusted, preopened root; one fixed origin.
 * The tree is provisioned by the test. Writers must cooperate with this lock;
 * this is not isolation from another process running as the same UID. */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>

enum {
    PRIVATE_DIR = S_IRWXU,
    PRIVATE_FILE = S_IRUSR | S_IWUSR,
    MODE_BITS = S_IRWXU | S_IRWXG | S_IRWXO | S_ISUID | S_ISGID | S_ISVTX,
};

static int verified(int fd, int directory) {
    struct stat st;
    return fd >= 0 && fstat(fd, &st) == 0 && st.st_uid == geteuid() &&
        (directory ? S_ISDIR(st.st_mode) && (st.st_mode & MODE_BITS) == PRIVATE_DIR
                   : S_ISREG(st.st_mode) && (st.st_mode & MODE_BITS) == PRIVATE_FILE && st.st_nlink == 1);
}

static int token(char byte) {
    return byte == '0' || byte == '1' || byte == '2';
}

static int argument(const char *value) {
    return token(value[0]) && value[1] == '\0';
}

static int reject(const char *stage) {
    fprintf(stderr, "%s\n", stage);
    return 1;
}

int main(int argc, char **argv) {
    const int read_only = argc == 2 && strcmp(argv[1], "read") == 0;
    const int hold = argc == 4 && strcmp(argv[1], "hold") == 0;
    if (!read_only && (argc != 4 || (!hold && strcmp(argv[1], "cas") != 0) ||
                      !argument(argv[2]) || !argument(argv[3])))
        return reject("input");

    const int root = 3;
    if (!verified(root, 1)) return reject("root");
    const int dir = openat(root, "origin", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (!verified(dir, 1)) return reject("origin");

    /* Never replace or truncate the preprovisioned lock inode. All paths below
     * are relative to this verified directory, not to the caller's cwd. */
    const int leaf_flags = O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC;
    const int lock = openat(dir, "lock", O_RDWR | leaf_flags);
    if (!verified(lock, 0)) return reject("lock");
    if (flock(lock, LOCK_EX | LOCK_NB) != 0) {
        if (errno != EWOULDBLOCK) return reject("flock");
        if (fputs("blocked\n", stderr) == EOF || fflush(stderr) != 0 || flock(lock, LOCK_EX) != 0)
            return reject("flock");
    }

    const int state = openat(dir, "state", O_RDONLY | leaf_flags);
    char current, extra;
    if (!verified(state, 0) || read(state, &current, 1) != 1 || !token(current) ||
        read(state, &extra, 1) != 0 || close(state) != 0)
        return reject("state");
    if (read_only) return write(STDOUT_FILENO, &current, 1) == 1 ? 0 : reject("stdout");
    if (current != argv[2][0]) return 2; /* Stale, no state or temp writes. */

    const int temp = openat(dir, "pending", O_WRONLY | O_CREAT | O_EXCL | leaf_flags, PRIVATE_FILE);
    if (!verified(temp, 0) || write(temp, argv[3], 1) != 1 || fsync(temp) != 0 || close(temp) != 0)
        return reject("pending"); /* No replacement; never recover an orphan implicitly. */

    if (hold) {
        char gate;
        if (fputs("ready\n", stderr) == EOF || fflush(stderr) != 0 ||
            read(STDIN_FILENO, &gate, 1) != 1 || gate != 'g')
            return reject("barrier");
    }
    if (renameat(dir, "pending", dir, "state") != 0) return reject("rename");
    /* A directory sync failure is not CAS success. After rename the outcome
     * may be visible already; no rollback or power-loss guarantee is made. */
    if (fsync(dir) != 0) return reject("directory sync after rename");
    return 0; /* Exit closes descriptors and releases the stable flock. */
}

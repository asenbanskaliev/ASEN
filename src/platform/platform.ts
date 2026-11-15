export function isWindows(): boolean {
 return process.platform === "win32";
}

export function platformSeparator(): string {
 return isWindows() ? "\\" : "/";
}

export function supportsSymlinks(): boolean {
 // POSIX tests can create symlinks directly. Windows requires elevation or developer mode.
 return !isWindows();
}

export function supportsPosixModeBits(): boolean {
 // POSIX directory mode checks are only meaningful on Unix-like hosts.
 return !isWindows();
}

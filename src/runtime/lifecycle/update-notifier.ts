/**
 * Passive Non-Blocking Update Notifier for ASEN.
 * Checks for signed upstream releases with a strict 24-hour throttle,
 * producing an unobtrusive single-line reminder without prompts or blocking.
 */

export interface UpdateNotifierOptions {
  readonly currentVersion: string;
  readonly fetchLatestVersion?: (() => Promise<string | null>) | undefined;
  readonly clock?: (() => number) | undefined;
  readonly intervalMs?: number | undefined;
}

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, "").split(".").map((part) => parseInt(part, 10) || 0);

  const [cMajor = 0, cMinor = 0, cPatch = 0] = parse(current);
  const [lMajor = 0, lMinor = 0, lPatch = 0] = parse(latest);

  if (lMajor > cMajor) return true;
  if (lMajor < cMajor) return false;
  if (lMinor > cMinor) return true;
  if (lMinor < cMinor) return false;
  return lPatch > cPatch;
}

export function formatUpdateNotice(currentVersion: string, latestVersion: string): string {
  const normCurrent = currentVersion.startsWith("v") ? currentVersion : `v${currentVersion}`;
  const normLatest = latestVersion.startsWith("v") ? latestVersion : `v${latestVersion}`;
  return `ℹ Actualización disponible: ${normLatest} (actual: ${normCurrent}). Ejecutá 'asen update' para instalar.\n`;
}

export class UpdateNotifier {
  private readonly currentVersion: string;
  private readonly fetchLatestVersion: () => Promise<string | null>;
  private readonly clock: () => number;
  private readonly intervalMs: number;
  private lastCheckTimestamp: number = 0;

  constructor(options: UpdateNotifierOptions) {
    this.currentVersion = options.currentVersion;
    this.fetchLatestVersion = options.fetchLatestVersion ?? (async () => null);
    this.clock = options.clock ?? (() => Date.now());
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /**
   * Check if an update is available. Respects the rate limit interval.
   * Returns formatted notice string if newer version is found, or null otherwise.
   */
  public async checkUpdate(): Promise<string | null> {
    const now = this.clock();
    if (this.lastCheckTimestamp > 0 && now - this.lastCheckTimestamp < this.intervalMs) {
      return null;
    }

    this.lastCheckTimestamp = now;

    try {
      const latest = await this.fetchLatestVersion();
      if (latest && isNewerVersion(this.currentVersion, latest)) {
        return formatUpdateNotice(this.currentVersion, latest);
      }
    } catch {
      // Passive check fails silently without throwing
    }

    return null;
  }
}

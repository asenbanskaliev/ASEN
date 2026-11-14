/**
 * Lightweight Single-Line Activity Stream Formatter for ASEN.
 * Formats subagent progress with ANSI clear-line sequences without breaking multiplexers or narrow terminals.
 */

export interface ActivityEvent {
  readonly agentId: string;
  readonly action: string;
  readonly step?: string | undefined;
}

export interface ActivityFinishReport {
  readonly status: "success" | "error";
  readonly summary: string;
}

export interface ActivityStreamOptions {
  readonly width?: number | undefined;
  readonly enableAnsi?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}

export class ActivityStreamFormatter {
  private readonly width: number;
  private readonly enableAnsi: boolean;
  private readonly signal: AbortSignal | undefined;

  constructor(options: ActivityStreamOptions = {}) {
    this.width = options.width && options.width > 10 ? options.width : 80;
    this.enableAnsi = options.enableAnsi ?? true;
    this.signal = options.signal;
  }

  public isCancelled(): boolean {
    return this.signal?.aborted ?? false;
  }

  public format(event: ActivityEvent): string {
    const isCancelled = this.isCancelled();
    const prefix = isCancelled ? `[CANCELLED] ` : ``;
    const stepPart = event.step ? ` (${event.step})` : "";
    const raw = `${prefix}[${event.agentId}] ⚡ ${event.action}${stepPart}`;

    let bounded = raw;
    if (bounded.length > this.width) {
      bounded = bounded.slice(0, Math.max(1, this.width - 1)) + "…";
    }

    if (this.enableAnsi) {
      return `\r\x1b[K${bounded}`;
    }
    return bounded;
  }

  public finish(agentId: string, report: ActivityFinishReport): string {
    const symbol = report.status === "success" ? "✔" : "✖";
    const raw = `[${agentId}] ${symbol} ${report.summary}`;
    let bounded = raw;
    if (bounded.length > this.width) {
      bounded = bounded.slice(0, Math.max(1, this.width - 1)) + "…";
    }
    return `${bounded}\n`;
  }
}

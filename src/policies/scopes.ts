export interface WriteGrant {
  agentId: string;
  repository: string;
  surfaces: string[];
  isolationKey?: string;
}

function overlaps(a: string, b: string): boolean {
  const norm = (v: string) => v.replace(/\\/g, "/").replace(/\*\*?$/, "").replace(/\/$/, "");
  const x = norm(a), y = norm(b);
  return x === y || x.startsWith(y + "/") || y.startsWith(x + "/");
}

export function validateWriteGrant(next: WriteGrant, active: readonly WriteGrant[]): void {
  if (!next.surfaces.length || next.surfaces.some((s) => s === "." || s === "/" || s === "**")) {
    throw new Error("Write grant requires bounded edit surfaces");
  }
  for (const grant of active) {
    if (grant.repository !== next.repository) continue;
    if (grant.isolationKey && next.isolationKey && grant.isolationKey !== next.isolationKey) continue;
    if (grant.surfaces.some((a) => next.surfaces.some((b) => overlaps(a, b)))) {
      throw new Error(`Overlapping writer authority: ${grant.agentId} and ${next.agentId}`);
    }
  }
}

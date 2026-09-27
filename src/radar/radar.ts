export interface UpstreamBaseline { sourceId: string; repository: string; commit: string; }
export interface UpstreamHead { repository: string; commit: string; changedPaths: string[]; }
export interface RadarFinding { sourceId: string; from: string; to: string; categories: string[]; changedPaths: string[]; }

export function classify(paths: readonly string[]): string[] {
  const out=new Set<string>();
  for(const p of paths) {
    if (/test|fixture/i.test(p)) out.add("TEST");
    if (/security|auth|permission|consent/i.test(p)) out.add("SECURITY");
    if (/memory|store|session/i.test(p)) out.add("MEMORY");
    if (/agent|delegat|dispatch/i.test(p)) out.add("AGENTS");
    if (/review|verify|evidence/i.test(p)) out.add("QUALITY");
    if (/package|install|update|migration/i.test(p)) out.add("LIFECYCLE");
    if (/skill|prompt|instruction/i.test(p)) out.add("SKILLS");
  }
  if (!out.size) out.add("INTERNAL");
  return [...out];
}
export function detectChange(base: UpstreamBaseline, head: UpstreamHead): RadarFinding | undefined {
  if (base.repository!==head.repository || base.commit===head.commit) return undefined;
  return {sourceId:base.sourceId,from:base.commit,to:head.commit,categories:classify(head.changedPaths),changedPaths:[...head.changedPaths]};
}

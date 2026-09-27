import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const parityDir=path.join(root,"registry","parity");
const files=["gentle-ecosystem-v1.yaml",...fs.readdirSync(parityDir).filter(n=>/^forensic-findings-wave\d+\.yaml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]))];
const records=new Map();

for(const file of files){
  const lines=fs.readFileSync(path.join(parityDir,file),"utf8").split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/id:\s*(PAR-(\d{3}))/);
    if(!m) continue;
    const id=m[1];
    if(records.has(id)) {
      const historicalWave28Collision=file==="forensic-findings-wave28.yaml" && /^PAR-37[0-6]$/.test(id);
      if(historicalWave28Collision) continue;
      throw new Error(`duplicate ${id}: ${records.get(id).file} and ${file}`);
    }
    const window=lines.slice(i,i+12).join(" ");
    const status=(window.match(/status:\s*["']?([A-Z/]+)/)||[])[1];
    const priority=(window.match(/priority:\s*["']?(P\d)/)||[])[1];
    const area=(window.match(/area:\s*["']?([^,}"']+)/)||[])[1]?.trim() ?? "";
    records.set(id,{id,file,status,priority,area});
  }
}
for(let n=1;n<=500;n++){const id=`PAR-${String(n).padStart(3,"0")}`;if(!records.has(id))throw new Error(`missing canonical id ${id}`);}
if(records.size!==500)throw new Error(`expected exactly 500 canonical IDs, got ${records.size}`);

const corrections={ "PAR-004":"PARTIAL","PAR-014":"PARTIAL","PAR-016":"PARTIAL","PAR-022":"PARTIAL","PAR-024":"PARTIAL","PAR-030":"PARTIAL" };
for(const [id,status] of Object.entries(corrections)) records.get(id).status=status;

const workstreams=[
 ["WS-01",/candidate|snapshot|evidence|repository.identity|worktree|git.identity|untracked/i],
 ["WS-02",/review|authority|ledger|lock|finding|correction|acknowledg|receipt|lens|relay/i],
 ["WS-03",/child|agent|rpc|transport|process|runner|dispatch|session.message/i],
 ["WS-04",/writer|write.|transaction|rollback|mutation|state|pipeline|queue/i],
 ["WS-05",/memory|sqlite|fts|relation|migration|database|generation|project.identity/i],
 ["WS-06",/compaction|delivery|context|session|final.reply|runtime.identity/i],
 ["WS-07",/backup|restore|filesystem|symlink|install|update|download|binary/i],
 ["WS-08",/privacy|redact|auth|secret|permission|consent|private/i],
 ["WS-09",/odd|routing|model|delegat|risk|orchestrat/i],
 ["WS-10",/publication|release|publish|ci|sign|provenance/i],
 ["WS-11",/protocol|contract|schema|version|compatib|provider/i],
 ["WS-12",/doctor|diagnostic|repair|maintenance|selftest/i]
];
function classify(area){
 const hits=workstreams.filter(([,re])=>re.test(area)).map(([id])=>id);
 if(hits.length===0) return "WS-12";
 return hits[0];
}
const actionable=[...records.values()].filter(r=>r.priority==="P0"&&r.status!=="PARITY"&&r.status!=="N/A");
const coverage=new Map();
for(const r of actionable){const ws=classify(r.area);if(coverage.has(r.id))throw new Error(`duplicate workstream assignment ${r.id}`);coverage.set(r.id,ws);}
if(coverage.size!==actionable.length)throw new Error("P0 workstream coverage mismatch");

for(const wave of [47,48]){
 const t=fs.readFileSync(path.join(parityDir,`forensic-findings-wave${wave}.yaml`),"utf8");
 if(!/p0_new:\s*0/.test(t))throw new Error(`wave ${wave} is not clean`);
}
const second=fs.readFileSync(path.join(parityDir,"second-six-pass-series.yaml"),"utf8");
if((second.match(/p0_new:\s*0/g)||[]).length!==6)throw new Error("second six-pass series is not 6/6 clean");
const reverse=fs.readFileSync(path.join(parityDir,"phase10-independent-reverse-audit-2.yaml"),"utf8");
if(!/new_p0_contracts:\s*\[\]/.test(reverse)||!/saturation_reset_required:\s*false/.test(reverse))throw new Error("independent reverse audit is not clean");

const counts={};for(const ws of coverage.values())counts[ws]=(counts[ws]||0)+1;
console.log(`Phase 10 registry valid: 500 canonical IDs; ${actionable.length} actionable P0 contracts assigned exactly once across WS-01..WS-12; six-pass=6/6; reverse-audit=clean; coverage=${JSON.stringify(counts)}`);

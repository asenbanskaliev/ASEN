import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
// @ts-expect-error The receipt scaffold is deliberately dependency-free JavaScript.
import {buildObservationScaffold,writeObservationScaffold} from '../scripts/agent-observable-scaffold.mjs';
// @ts-expect-error F7 parity comparator is JavaScript only.
import {compareAgentObservations} from '../scripts/agent-observable-parity.mjs';

const sha='a'.repeat(40);
test('EF-701 scaffold makes 40 A/B and 20 ASEN STATIC placeholders only',()=>{
 const {reference,candidate}=buildObservationScaffold(sha);
 assert.equal(reference.cases.length,40);
 assert.equal(candidate.cases.length,20);
 assert.deepEqual(reference.cases.slice(0,4).map((v:{source:string;id:string})=>[v.source,v.id]),
  [['A','C01'],['B','C01'],['A','C02'],['B','C02']]);
 assert.ok([...reference.cases,...candidate.cases].every((v:{execution:string;receipt:string})=>
  v.execution==='static'&&v.receipt==='NOT_CAPTURED'));
 const report=compareAgentObservations({reference,candidate,candidateSha:sha});
 assert.equal(report.counts.blocked,20);
 assert.equal(report.globalFull,false);
});
test('EF-701 scaffold refuses malformed revisions and overwriting an existing directory',async t=>{
 for(const bad of ['','abc','A'.repeat(40),'a'.repeat(39),'../not-a-sha'])
  assert.throws(()=>buildObservationScaffold(bad),/exact current ASEN SHA/);
 const home=await mkdtemp(join(tmpdir(),'asen-observable-template-'));
 t.after(()=>rm(home,{recursive:true,force:true}));
 const dir=join(home,'capture');
 const record=await writeObservationScaffold({candidateSha:sha,directory:dir});
 assert.equal(record.referenceCount,40);assert.equal(record.candidateCount,20);
 assert.equal(record.globalFull,false);
 const existing=await readFile(join(dir,'reference.json'),'utf8');
 await assert.rejects(()=>writeObservationScaffold({candidateSha:sha,directory:dir}),/EEXIST/);
 assert.equal(await readFile(join(dir,'reference.json'),'utf8'),existing);
});
test('EF-701 scaffold CLI writes only static evidence and rejects an old directory',async t=>{
 const home=await mkdtemp(join(tmpdir(),'asen-observable-cli-'));
 t.after(()=>rm(home,{recursive:true,force:true}));
 const dir=join(home,'new');
 const command=[process.execPath,'scripts/agent-observable-scaffold.mjs',sha,dir] as const;
 const run=spawnSync(command[0],command.slice(1),{cwd:process.cwd(),encoding:'utf8',timeout:15000});
 assert.equal(run.status,0,run.stderr);
 const refs=JSON.parse(await readFile(join(dir,'reference.json'),'utf8'));
 const local=JSON.parse(await readFile(join(dir,'asen.json'),'utf8'));
 assert.equal(compareAgentObservations({reference:refs,candidate:local,candidateSha:sha}).counts.blocked,20);
 const repeated=spawnSync(command[0],command.slice(1),{cwd:process.cwd(),encoding:'utf8',timeout:15000});
 assert.equal(repeated.status,1);
 assert.match(repeated.stderr,/EEXIST/);
});

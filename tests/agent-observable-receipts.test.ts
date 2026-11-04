import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {link,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error Offline evidence audit is deliberately standalone ESM.
import {auditObservableReceipts,sameObservableReceiptIdentity} from '../scripts/agent-observable-receipts.mjs';
// @ts-expect-error Pure evidence scaffold is ESM.
import {buildObservationScaffold} from '../scripts/agent-observable-scaffold.mjs';
const sha='a'.repeat(40);
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function fixture(t:import('node:test').TestContext){
 const root=await mkdtemp(join(tmpdir(),'asen-a-b-evidence-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const raw=buildObservationScaffold(sha);
 return {root,reference:structuredClone(raw.reference),candidate:structuredClone(raw.candidate)};
}
async function addEvidence(f:Awaited<ReturnType<typeof fixture>>,source:'A'|'B'|'ASEN',id='C01'){
 const entry=(source==='ASEN'?f.candidate:f.reference).cases.find((x:{id:string;source:string})=>x.id===id&&x.source===source);
 assert.ok(entry);
 const file=join(f.root,'receipts',source,`${id}.json`);
 await mkdir(join(f.root,'receipts',source),{recursive:true});
 entry.execution='real';entry.environment='isolated-test';entry.model='none';
 const data=Buffer.from(JSON.stringify({schema:'asen-agent-observable-receipt-v1',
  id,source,sha:entry.sha,execution:'real',environment:entry.environment,model:entry.model,trace:entry.trace}));
 await writeFile(file,data);
 entry.receipt=`receipts/${source}/${id}.json#sha256=${digest(data)}`;
 return file;
}
test('EF-701 all 60 empty or simulated captures remain blocked with zero attestation',async t=>{
 const f=await fixture(t);
 const report=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(report.expected,60);
 assert.deepEqual(report.counts,{integrityOnly:0,blocked:60,fail:0});
 assert.equal(report.globalFull,false);
});
test('EF-701 A+B+ASEN receipts validate bytes but NEVER assert authentic execution',async t=>{
 const f=await fixture(t);
 await addEvidence(f,'A');await addEvidence(f,'B');await addEvidence(f,'ASEN');
 const result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.deepEqual(result.counts,{integrityOnly:3,blocked:57,fail:0});
 assert.ok(result.rows.filter((r:{status:string})=>r.status==='INTEGRITY_ONLY')
  .every((r:{reason:string})=>r.reason==='INDEPENDENT_EXECUTION_NOT_ATTESTED'));
 assert.equal(result.globalFull,false);
});
test('EF-701 tampered file fails, no fallback to an unverified JSON claim',async t=>{
 const f=await fixture(t);
 const file=await addEvidence(f,'B');
 await writeFile(file,'{"forged":true}');
 const report=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(report.rows.find((r:{id:string;source:string})=>r.id==='C01'&&r.source==='B')?.reason,
  'RECEIPT_DIGEST_MISMATCH');
 assert.equal(report.counts.fail,1);
});
test('EF-701 incorrect source hash or source path cannot alias another reference',async t=>{
 const f=await fixture(t);
 await addEvidence(f,'A');
 const a=f.reference.cases.find((x:{id:string;source:string})=>x.id==='C01'&&x.source==='A');
 a.receipt=a.receipt.replace('/A/','/B/');
 let result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(result.rows[0].reason,'RECEIPT_DIGEST_BINDING_MISSING');
 a.receipt='receipts/A/C01.json#sha256='+'0'.repeat(64);
 result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(result.rows[0].reason,'RECEIPT_DIGEST_MISMATCH');
});
test('EF-701 receipt payload cannot substitute a different environment, model or trace',async t=>{
 const f=await fixture(t);
 await addEvidence(f,'ASEN');
 const c=f.candidate.cases.find((x:{id:string})=>x.id==='C01');
 c.model='not-what-receipt-claims';
 const result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(result.rows.find((x:{source:string;id:string})=>x.source==='ASEN'&&x.id==='C01')?.reason,
 'RECEIPT_CONTENT_MISMATCH');
});

test('EF-701 physical identity rejects reused bytes, missing inodes and metadata changes',()=>{
 const old={dev:1n,ino:13n,mode:0o100600n,size:42n,nlink:1n,
  birthtimeNs:100n,ctimeNs:101n,mtimeNs:102n};
 assert.equal(sameObservableReceiptIdentity(old,{...old}),true);
 for(const key of ['dev','ino','mode','size','nlink','birthtimeNs','ctimeNs','mtimeNs']){
  assert.equal(sameObservableReceiptIdentity(old,{...old,[key]:old[key as keyof typeof old]+1n}),false,key);
 }
 assert.equal(sameObservableReceiptIdentity(old,{...old,ino:0n}),false);
 assert.equal(sameObservableReceiptIdentity({...old,nlink:2n},{...old,nlink:2n}),false);
 assert.equal(sameObservableReceiptIdentity(null,old),false);
});
test('EF-701 hardlinked receipts are not accepted as private single-owner evidence',async t=>{
 const f=await fixture(t);
 const file=await addEvidence(f,'A');
 await link(file,join(f.root,'outside-alias.json'));
 const result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(result.rows.find((r:{id:string;source:string})=>r.id==='C01'&&r.source==='A')?.reason,
  'RECEIPT_FILE_UNAVAILABLE_OR_UNSAFE');
 assert.equal(result.globalFull,false);
});
test('EF-701 receipt size is bounded at the descriptor and never grants attestation',async t=>{
 const f=await fixture(t);
 const file=await addEvidence(f,'ASEN');
 const entry=f.candidate.cases.find((x:{id:string})=>x.id==='C01');
 const original=await readFile(file);
 const bounded=Buffer.concat([original,Buffer.alloc(256*1024-original.length,0x20)]);
 await writeFile(file,bounded);
 entry.receipt='receipts/ASEN/C01.json#sha256='+digest(bounded);
 let result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(result.rows.find((r:{id:string;source:string})=>r.id==='C01'&&r.source==='ASEN')?.status,'INTEGRITY_ONLY');
 assert.equal(result.globalFull,false);
 await writeFile(file,Buffer.concat([bounded,Buffer.from(' ')]));
 result=await auditObservableReceipts({...f,candidateSha:sha});
 assert.equal(result.rows.find((r:{id:string;source:string})=>r.id==='C01'&&r.source==='ASEN')?.reason,
  'RECEIPT_FILE_UNAVAILABLE_OR_UNSAFE');
 assert.equal(result.globalFull,false);
});

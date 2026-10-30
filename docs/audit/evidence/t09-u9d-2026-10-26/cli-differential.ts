import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runAsen as before} from './audit-baseline/src/cli.js';
import {runAsen as after} from '../../src/cli.js';
const root=await fs.mkdtemp(path.resolve('.cache/remote-t09/differential-'));
const home=path.join(root,'home'),pkg=path.join(root,'pkg'),record=path.join(root,'record');
await fs.mkdir(home);await fs.mkdir(pkg);
const file='inert';await fs.writeFile(path.join(pkg,'file'),file);
const manifest=path.join(root,'manifest.json');
await fs.writeFile(manifest,JSON.stringify({schema:'asen.managed-acquisition/v1',version:'2.0.0',files:[{sourcePath:'file',destinationPath:'file',size:file.length,sha256:createHash('sha256').update(file).digest('hex')}]}));
const environment={HOME:home,USERPROFILE:home,PATH:path.dirname(process.execPath),TMPDIR:root,TEMP:root,TMP:root,TSX_DISABLE_CACHE:'1'};
const call=async(run:typeof after,args:string[])=>{let stdout='',stderr='';const code=await run(args,environment,{homeDirectory:()=>home,stdout:s=>{stdout+=s;},stderr:s=>{stderr+=s;}});return{code,stdout,stderr};};
const cases=[
 ['version',['--version']],['home',['home']],['explicit-home-setup',['--package-root',pkg,'--home',path.join(root,'custom'),'setup','--dry-run']],
 ['selector-conflict',['--link','--isolated']],['setup-preview',['--package-root',pkg,'setup','--dry-run']],
 ['setup-refusal',['setup','--yes']],['update-preview',['managed','update','--manifest',manifest,'--package-root',pkg,'--dry-run']],
 ['invalid-update',['managed','update']],['invalid-select',['managed','select']],['invalid-run',['managed','run']],
 ['invalid-doctor',['doctor','extra']],['invalid-backup',['backup','project-memory']],
] as const;
const results=[];
for(const [name,args] of cases){const old=await call(before,[...args]),current=await call(after,[...args]);assert.deepEqual(current,old,name);results.push({name,before:old,after:current});}
const oldHelp=await call(before,['--help']),newHelp=await call(after,['--help']);
const added='       asen [--link|--isolated|--home PATH] managed update --manifest <absolute-json> --package-root <absolute-dir> --stage --yes  Stage local bytes only; no selection or execution\n';
assert.equal(newHelp.stdout.split(added).length,2);assert.deepEqual({...newHelp,stdout:newHelp.stdout.replace(added,'')},oldHelp);results.push({name:'help-one-exact-added-line',before:oldHelp,after:newHelp});
const dist=path.join(pkg,'node_modules/@earendil-works/pi-coding-agent/dist');await fs.mkdir(dist,{recursive:true});
await fs.writeFile(path.join(dist,'cli.cjs'),'');
await fs.writeFile(path.join(path.dirname(dist),'package.json'),JSON.stringify({type:'commonjs'}));
await fs.writeFile(path.join(dist,'cli.js'),`require('node:fs').writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));`);
const stage=['managed','update','--manifest',manifest,'--package-root',pkg,'--stage','--yes'];
for(const tokens of [['--',...stage],['update',...stage]]){
 const args=['--package-root',pkg,...tokens];const old=await call(before,args),oldRecord=await fs.readFile(record,'utf8');
 await fs.unlink(record);const current=await call(after,args),currentRecord=await fs.readFile(record,'utf8');
 assert.deepEqual(current,old);assert.equal(currentRecord,oldRecord);results.push({name:'literal-'+tokens[0],before:old,after:current,args:JSON.parse(currentRecord)});
}
await fs.writeFile('.cache/remote-t09/cli-differential-results.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} exact checkpoint/candidate CLI comparisons; only the single declared help line normalized.`);

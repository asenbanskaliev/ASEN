/** F7: create an EMPTY-EVIDENCE matrix for actual A/B/ASEN captures.
 * Scaffolds are explicitly STATIC, never synthetic proof of live execution. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {REFERENCE_SHA,CASE_IDS} from './agent-observable-parity.mjs';
const fullSha=/^[0-9a-f]{40}$/u;
const trace=()=>({route:'blocked',roles:[],guards:['evidence:missing'],
 checks:[],notifications:[],effects:[]});
function observation(id,source,sha){
 return {id,source,sha,execution:'static',environment:'not-executed',
  model:'none',receipt:'NOT_CAPTURED',trace:trace()};
}
/** An absent receipt always blocks EF-701; never mark a template as real. */
export function buildObservationScaffold(candidateSha){
 if(typeof candidateSha!=='string'||!fullSha.test(candidateSha))
  throw new Error('Scaffold requires the exact current ASEN SHA');
 return Object.freeze({
  reference:{schema:'asen-agent-observable-v1',subject:'reference',
   cases:CASE_IDS.flatMap(id=>[
    observation(id,'A',REFERENCE_SHA.A),observation(id,'B',REFERENCE_SHA.B)])},
  candidate:{schema:'asen-agent-observable-v1',subject:'asen',
   cases:CASE_IDS.map(id=>observation(id,'ASEN',candidateSha))},
 });
}
export async function writeObservationScaffold({candidateSha,directory}){
 if(typeof directory!=='string'||!directory.trim()||directory!==directory.trim())
  throw new Error('An explicit new output directory is required');
 const root=resolve(directory),docs=buildObservationScaffold(candidateSha);
 // Strict create-only protects prior evidence from accidental replacement.
 await mkdir(root,{recursive:false,mode:0o700});
 await writeFile(join(root,'reference.json'),JSON.stringify(docs.reference,null,2)+'\n',{flag:'wx',mode:0o600});
 await writeFile(join(root,'asen.json'),JSON.stringify(docs.candidate,null,2)+'\n',{flag:'wx',mode:0o600});
 const help=[
  '# EF-701 evidence capture (not completed by this scaffold)',
  'This directory contains 20 ASEN and 40 A/B STATIC placeholders.',
  'Run identical C01-C20 scenarios on both frozen references and this ASEN SHA.',
  'Replace each placeholder only after the corresponding independent live run.',
  'Include the exact source SHA, environment, model, execution trace and durable receipt.',
  'Claiming execution=real is NOT itself proof: receipts need independent audit.',
  'A matching observable matrix does NOT authorize a Writer, merge or FULL.',
  '',
 ].join('\n');
 await writeFile(join(root,'README.md'),help,{flag:'wx',mode:0o600});
 return Object.freeze({root,referenceCount:40,candidateCount:20,globalFull:false});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length!==4)throw new Error('Usage: node scripts/agent-observable-scaffold.mjs <ASEN_SHA> <new-directory>');
  const result=await writeObservationScaffold({candidateSha:process.argv[2],directory:process.argv[3]});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){console.error(error);process.exitCode=1;}
}

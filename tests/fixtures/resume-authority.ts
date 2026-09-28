import {loadLifecycle} from "../../src/lifecycle/skill-lifecycle.js";
import {isIssuedSkillContext} from "../../src/skills/context.js";
import {recoveryKeyFromEnvironment} from "../../src/session/recovery-key.js";
import {Dispatcher} from "../../src/agents/dispatcher.js";
import {EvidenceStore} from "../../src/evidence/store.js";

const [path,repository,revision]=process.argv.slice(2);
if(!path||!repository||!revision)throw new Error("Recovery fixture identity missing");
const candidate={id:"candidate",repository,revision,createdAt:"now"};
const flow=await loadLifecycle(path,"task",candidate,recoveryKeyFromEnvironment());
const {context,skillPaths}=flow.reissuePendingAuthority();
if(!isIssuedSkillContext(context))throw new Error("Recovered context was not reissued");
const runner={run:async(request:{id:string})=>({id:request.id,ok:true,output:JSON.stringify({kind:"design",content:"resumed design",repository,candidateId:candidate.id,revision})})};
await flow.runPhase(new Dispatcher(runner,new EvidenceStore()),{phase:"design",context,skillPaths,prompt:"design",evidence:new EvidenceStore(),risk:"low"});
process.stdout.write(JSON.stringify({phase:flow.state.nextPhase,records:flow.state.records.length,skills:skillPaths,issued:isIssuedSkillContext(context)}));

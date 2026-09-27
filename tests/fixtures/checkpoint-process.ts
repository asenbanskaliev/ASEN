import {createCheckpoint,loadCheckpoint,saveCheckpoint} from "../../src/session/checkpoint.js";

const [mode,path,projectId,sessionId,repository,revision]=process.argv.slice(2);
if(!mode||!path||!projectId||!sessionId||!repository||!revision)throw new Error("Missing fixture arguments");
if(mode==="write"){
 const task={id:"task-1",title:"Recover task",phase:"VERIFYING" as const,candidateId:"candidate-1",blockers:["review pending"]};
 const candidate={id:"candidate-1",repository,revision,createdAt:"now"};
 await saveCheckpoint(path,createCheckpoint(projectId,sessionId,task,candidate));
}else if(mode==="read"){
 const state=await loadCheckpoint(path,{projectId,sessionId,repository,revision});
 process.stdout.write(JSON.stringify(state));
}else throw new Error(`Unknown mode ${mode}`);

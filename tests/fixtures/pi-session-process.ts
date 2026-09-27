import {SessionManager} from "@earendil-works/pi-coding-agent";
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createCheckpoint,saveCheckpoint} from "../../src/session/checkpoint.js";
import {resumePiSession} from "../../src/session/pi-resume.js";

const [mode,dir,project,repository,revision]=process.argv.slice(2);
if(!mode||!dir||!project||!repository||!revision)throw new Error("Missing fixture arguments");
const metadata=join(dir,"metadata.json"),checkpoint=join(dir,"checkpoint.json");
if(mode==="write"){
 const session=SessionManager.create(repository,dir);
 session.appendSessionInfo("ASEN recovery fixture");
 // A local fixture entry forces Pi's real SessionManager to flush JSONL without a provider.
 // It is not evidence of an authenticated model run.
 session.appendMessage({role:"assistant",content:[{type:"text",text:"fixture only"}],api:"fixture",provider:"fixture",model:"fixture",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:Date.now()});
 const sessionFile=session.getSessionFile();if(!sessionFile)throw new Error("Pi session file missing");
 const task={id:"task",title:"Pi recovery",phase:"VERIFYING" as const,candidateId:"candidate",blockers:["needs review"]};
 const candidate={id:"candidate",repository,revision,createdAt:"now"};
 await saveCheckpoint(checkpoint,createCheckpoint(project,session.getSessionId(),task,candidate,sessionFile));
 writeFileSync(metadata,JSON.stringify({sessionFile,sessionId:session.getSessionId()}));
}else if(mode==="resume"){
 const expected=JSON.parse(readFileSync(metadata,"utf8"));
 const piMain=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
 const cli=join(dirname(piMain),"bundle","cli.js");
 const rpc=spawnSync(process.execPath,[cli,"--mode","rpc","--session",expected.sessionFile,"--no-extensions","--no-skills"],{input:JSON.stringify({id:"state-request",type:"get_state"})+"\n",encoding:"utf8",timeout:15000});
 if(rpc.status!==0)throw new Error(`Pi CLI failed: ${rpc.stderr}`);
 const responses=rpc.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
 const response=responses.find(record=>record.type==="response"&&record.id==="state-request"&&record.command==="get_state");
 if(!response?.success)throw new Error("Pi RPC state response missing");
 const recovered=await resumePiSession(checkpoint,{projectId:project,repository,revision,sessionId:expected.sessionId,sessionFile:expected.sessionFile},response.data);
 process.stdout.write(JSON.stringify({task:recovered.task,candidate:recovered.candidate,piSessionId:response.data.sessionId,piSessionFile:response.data.sessionFile}));
}else throw new Error(`Unknown mode ${mode}`);

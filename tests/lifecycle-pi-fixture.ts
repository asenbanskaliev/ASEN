import type {AgentRequest,AgentRunner} from "../src/agents/dispatcher.js";
import {PiArtifactRunner} from "../src/agents/pi-artifact-runner.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";

/** Fixture transcript for lifecycle tests; this does not demonstrate a real Pi model turn. */
export function fixtureArtifactRunner(build:(request:AgentRequest)=>unknown):AgentRunner{
 class TranscriptFixture extends PiProcessRunner{
  override run(request:AgentRequest){
   const records=[
    {type:"response",id:request.id,success:true},
    {type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:JSON.stringify(build(request))}]}},
    {type:"agent_end"}
   ];
   return Promise.resolve({id:request.id,ok:true,output:records.map(x=>JSON.stringify(x)).join("\n")});
  }
 }
 return new PiArtifactRunner(new TranscriptFixture());
}

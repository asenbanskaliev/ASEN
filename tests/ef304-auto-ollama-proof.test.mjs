import test from "node:test";
import assert from "node:assert/strict";
import {parseBeamProposal,mayApplyFixtureDecision,readPiWitness} from "../scripts/ef304-auto-ollama-proof.mjs";
const valid='{"path":"README.md","marker":"EF304_BEAM_PROPOSAL_READY"}';
test("EF-304 model proposal parser admits only exact bounded no-tool intent",()=>{
 assert.deepEqual(parseBeamProposal(valid),{path:"README.md",marker:"EF304_BEAM_PROPOSAL_READY"});
 assert.deepEqual(parseBeamProposal(String.fromCharCode(96).repeat(3)+"json\n"+valid+"\n"+String.fromCharCode(96).repeat(3)),{path:"README.md",marker:"EF304_BEAM_PROPOSAL_READY"});
 for(const payload of ['{"path":"outside.txt","marker":"EF304_BEAM_PROPOSAL_READY"}',
  '{"path":"README.md","marker":"UNSAFE"}',
  '{"path":"README.md","marker":"EF304_BEAM_PROPOSAL_READY","approved":true}',
  "sure, I approve",valid+valid]){
  assert.throws(()=>parseBeamProposal(payload));
 }
});
test("EF-304 simulated decisions never default to allow or convert revocation into consent",()=>{
 const proposal=parseBeamProposal(valid),allowed=["README.md"];
 assert.equal(mayApplyFixtureDecision({decision:"SIMULATED_ALLOW",revoked:false,scope:allowed,proposal}),true);
 for(const state of [
  {decision:"SIMULATED_DENY",revoked:false,scope:allowed,proposal},
  {decision:"SIMULATED_ALLOW",revoked:true,scope:allowed,proposal},
  {decision:"SIMULATED_ALLOW",revoked:false,scope:["outside.txt"],proposal},
  {decision:"SIMULATED_ALLOW",revoked:false,scope:allowed,proposal:{...proposal,path:"../README.md"}},
  {decision:"SIMULATED_ALLOW",revoked:false,scope:allowed,proposal:{...proposal,marker:"OTHER"}},
  {decision:"APPROVED_BY_AI",revoked:false,scope:allowed,proposal}]){
  assert.equal(mayApplyFixtureDecision(state),false);
 }
});
test("EF-304 Pi witness requires real agent end plus assistant message",()=>{
 const event={type:"message_end",message:{role:"assistant",content:[{type:"text",text:valid}]}};
 assert.equal(readPiWitness([JSON.stringify(event),JSON.stringify({type:"agent_end"})].join("\n")).answer,valid);
 assert.throws(()=>readPiWitness(JSON.stringify(event)),/agent_end/u);
 assert.throws(()=>readPiWitness(JSON.stringify({type:"agent_end"})),/assistant message/u);
});

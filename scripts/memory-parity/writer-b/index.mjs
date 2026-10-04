import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {isDeepStrictEqual} from "node:util";

const fixturePath="registry/parity/memory-observation-pin-contracts-v1.json";
const expected={
 schemaVersion:1,
 scope:"reference_only",
 status:"SOURCE_INSPECTED",
 proofKind:"source_inspection",
 limitations:[
  "Source inspection does not prove driver no-op RowsAffected behavior.",
  "Source inspection does not prove execHook runtime or SQLite behavior.",
  "Source inspection does not prove concurrency behavior.",
  "Source inspection does not prove authorization, ownership, or project scoping.",
  "Source inspection does not prove transaction or timestamp behavior.",
  "Source inspection does not prove sync or downstream effects.",
  "Source inspection does not prove Cloud behavior.",
  "Source inspection does not prove runtime, FULL, or family parity."
 ],
 sources:[{
  id:"SRC-PIN-001",path:"internal/store/store.go",mode:"100644",blob:"a396d5d8eb91b956a12c23cd5e936a2b74dd7760",sha256:"6c52f5e8f71e8d00e1ff5c5f10361142b89b500786b181c825e1d69ad31ee15e",bytes:488121,lf:13200,cr:0,utf8:true,bom:false,finalLf:true,commit:"15a2f78885d7ad8ced23b2d1d88383e9bb472c17"
 }],
 cases:[{
  id:"PIN-01",
  summary:"Pin and unpin delegate to one soft-delete-aware pinned-column update with direct error propagation.",
  evidence:[
   {sourceId:"SRC-PIN-001",startLine:63,endLine:63,symbols:["ErrObservationNotFound"],neighbors:{beforeLine:62,before:"ErrSessionDeleteBlocked",afterLine:64,after:"ErrPromptNotFound"}},
   {sourceId:"SRC-PIN-001",startLine:3932,endLine:3957,symbols:["PinObservation","UnpinObservation","setObservationPinned"],neighbors:{beforeLine:3930,before:"previous function closing brace",afterLine:3959,after:"recentUnpinnedObservations"}}
  ],
  facts:[
   "PinObservation delegates to setObservationPinned(id, true).",
   "UnpinObservation delegates to setObservationPinned(id, false).",
   "The helper maps false to 0 and true to 1.",
   "The exact SQL is UPDATE observations SET pinned = ? WHERE id = ? AND deleted_at IS NULL.",
   "The SQL arguments are value, then id, and execution uses s.execHook(s.db, ...).",
   "Execution and RowsAffected errors are returned unchanged.",
   "Zero affected rows returns ErrObservationNotFound directly; nonzero returns nil.",
   "Only pinned changes, and soft-deleted rows are excluded."
  ],
  criticalValues:{
   pinDelegates:{helper:"setObservationPinned",pinned:true},
   unpinDelegates:{helper:"setObservationPinned",pinned:false},
   integerMapping:[{pinned:false,value:0},{pinned:true,value:1}],
   sql:"UPDATE observations SET pinned = ? WHERE id = ? AND deleted_at IS NULL",
   arguments:["value","id"],
   execution:{receiver:"s",method:"execHook",database:"s.db"},
   errors:{execution:"returned_unchanged",rowsAffected:"returned_unchanged",zeroRows:"ErrObservationNotFound_direct",nonzeroRows:"nil"},
   mutation:{changedColumns:["pinned"],predicates:["id = ?","deleted_at IS NULL"]}
  }
 }]
};

const deepFreeze=value=>{
 if(value&&typeof value==="object"&&!Object.isFrozen(value)){
  for(const child of Object.values(value))deepFreeze(child);
  Object.freeze(value);
 }
 return value;
};

export function validateMemoryObservationPin(value){
 try{return isDeepStrictEqual(value,expected)?[]:["fixture must exactly match the canonical observation pin contract, ordering, and limitations"];}catch{return ["fixture must be a plain canonical observation pin contract"];}
}

export function loadCheckedInMemoryObservationPin(root){
 try{return deepFreeze(JSON.parse(readFileSync(resolve(root,fixturePath),"utf8")));}
 catch(error){throw new Error(`cannot load ${fixturePath}`,{cause:error});}
}

const descriptor=Object.freeze({
 id:"memory-observation-pin-contracts-v1",
 fixturePath,
 load:loadCheckedInMemoryObservationPin,
 validate:validateMemoryObservationPin,
 successLabel:"1 observation-pin source-inspected contract"
});

export const writerBParitySlices=Object.freeze([descriptor]);

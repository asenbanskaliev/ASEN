export interface WriteGrant{agentId:string;repository:string;surfaces:string[];isolationKey?:string;}
function normalize(v:string):string{
 if(typeof v!=="string"||!v||v!==v.trim()||/[\u0000-\u001f\u007f-\u009f]/u.test(v))throw new Error("Invalid write surface");
 const n=v.replace(/\\/g,"/").replace(/\/+/g,"/").replace(/\*\*?$/ ,"").replace(/\/$/,"");
 if(n.startsWith("/")||/^[a-z]:/iu.test(n)||n.split("/").some(segment=>segment==="."||segment===".."))throw new Error("Invalid write surface");
 return n;
}
function overlaps(a:string,b:string):boolean{const x=normalize(a),y=normalize(b);return x===y||x.startsWith(y+"/")||y.startsWith(x+"/");}
export function validateWriteGrant(next:WriteGrant,active:readonly WriteGrant[]):void{
 if(!next||typeof next!=="object"||typeof next.agentId!=="string"||!next.agentId.trim()||next.agentId!==next.agentId.trim()||typeof next.repository!=="string"||!next.repository.trim()||next.repository!==next.repository.trim()||!Array.isArray(next.surfaces)||next.surfaces.length>256||!Array.isArray(active))throw new Error("Invalid write grant");
 const activeGrants=active as readonly WriteGrant[];
 if(!next.surfaces.length||next.surfaces.some(s=>{const n=normalize(s);return n==="."||n==="/"||n===""||n==="**"}))throw new Error("Write grant requires bounded edit surfaces");
 // A session identifier does not imply a separate filesystem. Only a different
 // repository/worktree root isolates the same relative write surface.
 for(const grant of activeGrants){
  if(!grant||typeof grant!=="object"||typeof grant.agentId!=="string"||!grant.agentId.trim()||grant.agentId!==grant.agentId.trim()||typeof grant.repository!=="string"||!grant.repository.trim()||grant.repository!==grant.repository.trim()||!Array.isArray(grant.surfaces)||!grant.surfaces.length||grant.surfaces.length>256)throw new Error("Invalid active write grant");
  for(const surface of grant.surfaces){const normalized=normalize(surface);if(!normalized||normalized==="."||normalized==="/"||normalized==="**")throw new Error("Invalid active write grant");}
  if(grant.repository!==next.repository)continue;
  if(grant.surfaces.some(a=>next.surfaces.some(b=>overlaps(a,b))))throw new Error(`Overlapping writer authority: ${grant.agentId} and ${next.agentId}`);
 }
}

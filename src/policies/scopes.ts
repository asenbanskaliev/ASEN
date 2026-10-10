export interface WriteGrant{agentId:string;repository:string;surfaces:string[];isolationKey?:string;}
function normalize(v:string):string{const n=v.replace(/\\/g,"/").replace(/\/+/g,"/").replace(/\*\*?$/,"").replace(/\/$/,"");if(n.includes("\0")||n.split("/").includes(".."))throw new Error("Invalid write surface");return n;}
function overlaps(a:string,b:string):boolean{const x=normalize(a),y=normalize(b);return x===y||x.startsWith(y+"/")||y.startsWith(x+"/");}
export function validateWriteGrant(next:WriteGrant,active:readonly WriteGrant[]):void{
 if(!next.surfaces.length||next.surfaces.some(s=>{const n=normalize(s);return n==="."||n==="/"||n===""||n==="**"}))throw new Error("Write grant requires bounded edit surfaces");
 // A session identifier does not imply a separate filesystem. Only a different
 // repository/worktree root isolates the same relative write surface.
 for(const grant of active){if(grant.repository!==next.repository)continue;if(grant.surfaces.some(a=>next.surfaces.some(b=>overlaps(a,b))))throw new Error(`Overlapping writer authority: ${grant.agentId} and ${next.agentId}`);}
}

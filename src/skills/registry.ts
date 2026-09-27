export type SkillId =
  | "asen-context-init" | "asen-explore" | "asen-proposal" | "asen-specification" | "asen-design"
  | "asen-tasks" | "asen-apply" | "asen-verify" | "asen-archive" | "asen-skill-registry"
  | "asen-adversarial-review" | "asen-skill-authoring" | "asen-skill-audit" | "asen-defect-workflow" | "asen-go-testing"
  | "asen-delivery-branch" | "asen-delivery-chain" | "asen-issue-workflow" | "asen-doc-design" | "asen-collaboration-message"
  | "asen-safe-change" | "asen-tdd" | "asen-odd" | "asen-review" | "asen-work-unit";

export type SkillPhase="context-init"|"explore"|"proposal"|"specification"|"design"|"tasks"|"apply"|"verify"|"archive"|"skill-registry"
 |"adversarial-review"|"skill-authoring"|"skill-audit"|"defect"|"go-testing"|"delivery-branch"|"delivery-chain"|"issue"|"docs"|"collaboration-message";
export type SkillTrigger =
  | SkillPhase | "code-change" | "behavior-change" | "high-risk" | "unknown-risk" | "multi-file" | "verification";

export interface SkillContract {
  id:SkillId;
  path:`skills/${SkillId}/SKILL.md`;
  triggers:readonly SkillTrigger[];
  requires:readonly SkillId[];
  evidence:readonly string[];
  blocks:readonly ("mutation"|"verification"|"release")[];
}
export interface SkillSelectionContext {
  phase?:SkillPhase;
  codeChange?:boolean;
  behaviorChange?:boolean;
  risk?:"low"|"medium"|"high"|"unknown";
  filesTouched?:number;
  verification?:boolean;
}
const contracts:readonly SkillContract[]=[
 {id:"asen-context-init",path:"skills/asen-context-init/SKILL.md",triggers:["context-init"],requires:["asen-skill-registry"],evidence:["project-context"],blocks:[]},
 {id:"asen-explore",path:"skills/asen-explore/SKILL.md",triggers:["explore"],requires:[],evidence:["exploration"],blocks:[]},
 {id:"asen-proposal",path:"skills/asen-proposal/SKILL.md",triggers:["proposal"],requires:[],evidence:["proposal"],blocks:[]},
 {id:"asen-specification",path:"skills/asen-specification/SKILL.md",triggers:["specification"],requires:[],evidence:["specification"],blocks:[]},
 {id:"asen-design",path:"skills/asen-design/SKILL.md",triggers:["design"],requires:[],evidence:["design"],blocks:[]},
 {id:"asen-tasks",path:"skills/asen-tasks/SKILL.md",triggers:["tasks"],requires:["asen-work-unit"],evidence:["task-plan"],blocks:[]},
 {id:"asen-apply",path:"skills/asen-apply/SKILL.md",triggers:["apply"],requires:["asen-safe-change"],evidence:["apply-result"],blocks:[]},
 {id:"asen-verify",path:"skills/asen-verify/SKILL.md",triggers:["verify"],requires:[],evidence:["verification-report"],blocks:[]},
 {id:"asen-archive",path:"skills/asen-archive/SKILL.md",triggers:["archive"],requires:["asen-verify"],evidence:["archive-report"],blocks:[]},
 {id:"asen-skill-registry",path:"skills/asen-skill-registry/SKILL.md",triggers:["skill-registry"],requires:[],evidence:["skill-index"],blocks:[]},
 {id:"asen-adversarial-review",path:"skills/asen-adversarial-review/SKILL.md",triggers:["adversarial-review"],requires:["asen-review"],evidence:["adversarial-review"],blocks:[]},
 {id:"asen-skill-authoring",path:"skills/asen-skill-authoring/SKILL.md",triggers:["skill-authoring"],requires:["asen-skill-registry"],evidence:["skill-contract"],blocks:[]},
 {id:"asen-skill-audit",path:"skills/asen-skill-audit/SKILL.md",triggers:["skill-audit"],requires:["asen-skill-registry"],evidence:["skill-audit"],blocks:[]},
 {id:"asen-defect-workflow",path:"skills/asen-defect-workflow/SKILL.md",triggers:["defect"],requires:["asen-work-unit"],evidence:["defect-reproduction"],blocks:[]},
 {id:"asen-go-testing",path:"skills/asen-go-testing/SKILL.md",triggers:["go-testing"],requires:[],evidence:["go-test"],blocks:[]},
 {id:"asen-delivery-branch",path:"skills/asen-delivery-branch/SKILL.md",triggers:["delivery-branch"],requires:["asen-work-unit"],evidence:["delivery-state"],blocks:[]},
 {id:"asen-delivery-chain",path:"skills/asen-delivery-chain/SKILL.md",triggers:["delivery-chain"],requires:["asen-work-unit"],evidence:["delivery-plan"],blocks:[]},
 {id:"asen-issue-workflow",path:"skills/asen-issue-workflow/SKILL.md",triggers:["issue"],requires:[],evidence:["issue-evidence"],blocks:[]},
 {id:"asen-doc-design",path:"skills/asen-doc-design/SKILL.md",triggers:["docs"],requires:[],evidence:["doc-validation"],blocks:[]},
 {id:"asen-collaboration-message",path:"skills/asen-collaboration-message/SKILL.md",triggers:["collaboration-message"],requires:[],evidence:["message-evidence"],blocks:[]},
 {id:"asen-odd",path:"skills/asen-odd/SKILL.md",triggers:["high-risk","unknown-risk","multi-file"],requires:[],evidence:["route-decision"],blocks:["mutation"]},
 {id:"asen-work-unit",path:"skills/asen-work-unit/SKILL.md",triggers:["code-change","behavior-change","multi-file"],requires:[],evidence:["work-unit"],blocks:["mutation"]},
 {id:"asen-safe-change",path:"skills/asen-safe-change/SKILL.md",triggers:["code-change"],requires:["asen-work-unit"],evidence:["scope","rollback"],blocks:["mutation","release"]},
 {id:"asen-tdd",path:"skills/asen-tdd/SKILL.md",triggers:["behavior-change"],requires:["asen-work-unit"],evidence:["tdd"],blocks:["verification"]},
 {id:"asen-review",path:"skills/asen-review/SKILL.md",triggers:["high-risk","unknown-risk","verification"],requires:["asen-work-unit"],evidence:["review"],blocks:["verification","release"]}
] as const;
export function listSkillContracts():readonly SkillContract[]{return contracts;}
export function getSkillContract(id:SkillId):SkillContract{
 const contract=contracts.find(item=>item.id===id);
 if(!contract) throw new Error(`Unknown ASEN skill: ${id}`);
 return contract;
}
function directTriggers(context:SkillSelectionContext):Set<SkillTrigger>{
 const triggers=new Set<SkillTrigger>();
 if(context.phase) triggers.add(context.phase);
 if(context.codeChange) triggers.add("code-change");
 if(context.behaviorChange) triggers.add("behavior-change");
 if(context.risk==="high") triggers.add("high-risk");
 if(context.risk==="unknown") triggers.add("unknown-risk");
 if((context.filesTouched??0)>1) triggers.add("multi-file");
 if(context.verification) triggers.add("verification");
 return triggers;
}
export function selectSkills(context:SkillSelectionContext):SkillContract[]{
 const triggers=directTriggers(context),selected=new Set<SkillId>();
 const add=(id:SkillId):void=>{if(selected.has(id))return;const c=getSkillContract(id);for(const d of c.requires)add(d);selected.add(id);};
 for(const contract of contracts)if(contract.triggers.some(trigger=>triggers.has(trigger)))add(contract.id);
 return [...selected].map(getSkillContract);
}

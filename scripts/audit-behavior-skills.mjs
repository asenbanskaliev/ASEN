import {readFile,readdir} from "node:fs/promises";
const root=new URL("../skills/",import.meta.url);
const dirs=await readdir(root,{withFileTypes:true});
const required=[
 "asen-context-init","asen-explore","asen-proposal","asen-specification","asen-design",
 "asen-tasks","asen-apply","asen-verify","asen-archive","asen-skill-registry",
 "asen-adversarial-review","asen-skill-authoring","asen-skill-audit","asen-defect-workflow","asen-go-testing",
 "asen-delivery-branch","asen-delivery-chain","asen-issue-workflow","asen-doc-design","asen-collaboration-message",
 "asen-safe-change","asen-tdd","asen-odd","asen-review","asen-work-unit"
];
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const bad=[];
for(const name of required){
 if(!dirs.some(d=>d.isDirectory()&&d.name===name)){bad.push(`missing skill ${name}`);continue;}
 const raw=await readFile(new URL(`../skills/${name}/SKILL.md`,import.meta.url),"utf8");
 const text=raw.replace(/\r\n?/g,"\n");
 const frontmatter=text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
 if(!frontmatter||!new RegExp(`^name:\\s*${name}\\s*$`,"m").test(frontmatter)||!/^description:\s*\S.+$/m.test(frontmatter)) bad.push(`invalid frontmatter ${name}`);
 for(const section of sections) if(!text.includes(`## ${section}`)) bad.push(`missing ${section} in ${name}`);
}
if(bad.length){console.error(bad.join("\n"));process.exit(1);}
console.log(`behavior skills: ${required.length} PASS`);

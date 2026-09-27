import {readFile,readdir} from "node:fs/promises";import {join} from "node:path";
const root=new URL("../skills/",import.meta.url);const dirs=await readdir(root,{withFileTypes:true});const required=["asen-safe-change","asen-tdd","asen-odd","asen-review","asen-work-unit"];let bad=[];
for(const name of required){if(!dirs.some(d=>d.isDirectory()&&d.name===name)){bad.push(`missing skill ${name}`);continue;}const text=await readFile(new URL(`../skills/${name}/SKILL.md`,import.meta.url),"utf8");if(!text.startsWith("---\n")||!text.includes(`name: ${name}`)||!text.includes("description:"))bad.push(`invalid frontmatter ${name}`);}
if(bad.length){console.error(bad.join("\n"));process.exit(1);}console.log(`behavior skills: ${required.length} PASS`);

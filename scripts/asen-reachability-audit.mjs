#!/usr/bin/env node
// UFC-M1-06: deterministic entry-point reachability audit (R21 answer tool).
// Resolves the real ESM import graph from production entry points and classifies every tracked
// src/ module outside that graph as test-only fixture, scripts-only consumer, dynamic reference,
// or genuinely unwired. Read-only static analysis: it never deletes, never treats absence from
// the graph as proof of dead code, and fails closed on unresolvable specifiers. Markdown and
// other documentation are never parsed as modules.
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const AUDIT_SCHEMA="asen-reachability-audit/v1";
/** Production entry points: the CLI bin source and the Pi extension composition root. */
export const PRODUCTION_ENTRIES=["src/cli.ts","extensions/asen.ts"];
/** Only these trees are parsed; documentation anywhere and other files are never modules. */
const PARSE_PREFIXES=["src/","extensions/","tests/","scripts/"];
const PARSE_EXTENSIONS=[".ts",".mts",".js",".mjs"];

const staticSpecifiers=(content)=>{
	const found=new Set();
	for(const match of content.matchAll(/\bfrom\s+["']([^"'\n]+)["']/gu))found.add(match[1]);
	for(const match of content.matchAll(/^[ \t]*import\s+["']([^"'\n]+)["']/gmu))found.add(match[1]);
	return [...found];
};
const dynamicSpecifiers=(content)=>{
	const found=new Set();
	for(const match of content.matchAll(/\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/gu))found.add(match[1]);
	for(const match of content.matchAll(/\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/gu))found.add(match[1]);
	return [...found];
};
const isRelative=(specifier)=>specifier.startsWith("./")||specifier.startsWith("../");
const normalise=(filePath)=>filePath.split(path.sep).join("/");
const parseable=(filePath)=>PARSE_PREFIXES.some((prefix)=>filePath.startsWith(prefix))&&PARSE_EXTENSIONS.some((extension)=>filePath.endsWith(extension));
const moduleUnderTest=(filePath)=>filePath.startsWith("src/")&&filePath.endsWith(".ts")&&!filePath.endsWith(".d.ts");

/** Candidate targets for a relative specifier under the tracked-file convention (.js maps to .ts). */
function candidates(fromFile,specifier){
	const joined=path.posix.normalize(path.posix.join(path.posix.dirname(fromFile),specifier));
	const out=[joined];
	if(joined.endsWith(".js"))out.push(`${joined.slice(0,-3)}.ts`,`${joined.slice(0,-3)}.mts`);
	else if(joined.endsWith(".mjs"))out.push(`${joined.slice(0,-4)}.ts`);
	else if(!/\.[A-Za-z0-9]+$/u.test(joined))out.push(`${joined}.ts`,`${joined}.mts`,`${joined}.js`,`${joined}/index.ts`,`${joined}/index.js`);
	return out;
}

/**
 * @param {{root:string,entries:readonly string[],tracked:readonly string[],sha?:string|null}} input
 * @returns {{ok:boolean,report:Record<string,unknown>}}
 */
export function auditReachability({root,entries,tracked,sha=null}){
	const trackedSet=new Set(tracked.map(normalise));
	for(const entry of entries)if(!trackedSet.has(entry))throw new Error(`Audit entry point is not tracked: ${entry}`);
	const read=(file)=>{
		try{return readFileSync(path.join(root,file),"utf8");}
		catch{return "";}
	};
	/** @type {Map<string,{static:string[],dynamic:string[]}>} */
	const edgesOf=new Map();
	/** @type {{from:string,specifier:string}[]} */
	const unresolvable=[];
	const resolveSpecifier=(fromFile,specifier)=>{
		for(const candidate of candidates(fromFile,specifier))if(trackedSet.has(candidate))return candidate;
		return undefined;
	};
	for(const file of [...trackedSet]){
		if(!parseable(file))continue;
		const content=read(file);
		const staticEdges=[],dynamicEdges=[];
		for(const specifier of staticSpecifiers(content)){
			if(!isRelative(specifier))continue;
			const target=resolveSpecifier(file,specifier);
			if(target===undefined){
				// Fail-closed applies only where typecheck guarantees declaration resolution
				// (the production trees). Tests and scripts legitimately embed fixture strings
				// and runtime-generated paths; their edges are used for classification only.
				if(file.startsWith("src/")||file.startsWith("extensions/"))unresolvable.push({from:file,specifier});
			}
			else staticEdges.push(target);
		}
		for(const specifier of dynamicSpecifiers(content)){
			if(!isRelative(specifier))continue;
			const target=resolveSpecifier(file,specifier);
			if(target===undefined){
				if(file.startsWith("src/")||file.startsWith("extensions/"))unresolvable.push({from:file,specifier});
			}
			else dynamicEdges.push(target);
		}
		edgesOf.set(file,{static:[...new Set(staticEdges)],dynamic:[...new Set(dynamicEdges)]});
	}
	const closure=(seeds,useDynamic)=>{
		const seen=new Set(seeds),queue=[...seeds];
		while(queue.length){
			const current=queue.shift();
			const edges=edgesOf.get(current);
			if(!edges)continue;
			for(const target of useDynamic?[...edges.static,...edges.dynamic]:edges.static)
				if(!seen.has(target)){seen.add(target);queue.push(target);}
		}
		return seen;
	};
	const staticReach=closure(entries,false);
	const dynamicReach=closure([...staticReach],true);
	const testSeeds=entriesInTree(trackedSet,"tests/");
	const scriptSeeds=entriesInTree(trackedSet,"scripts/");
	const fromTests=closure(testSeeds,true);
	const fromScripts=closure(scriptSeeds,true);
	const bucketOf=(module)=>{
		if(!moduleUnderTest(module))return undefined;
		if(staticReach.has(module))return "wired";
		if(dynamicReach.has(module))return "dynamicReference";
		if(fromTests.has(module))return "testOnly";
		if(fromScripts.has(module))return "scriptsOnly";
		return "unwired";
	};
	const report={
		schema:AUDIT_SCHEMA,
		sha,
		entryPoints:[...entries].sort(),
		wired:[],dynamicReference:[],testOnly:[],scriptsOnly:[],unwired:[],
		unresolvable:unresolvable.sort((a,b)=>`${a.from}\u0000${a.specifier}`<`${b.from}\u0000${b.specifier}`?-1:1),
	};
	for(const module of [...trackedSet]){
		const bucket=bucketOf(module);
		if(bucket!==undefined)report[bucket].push(module);
	}
	for(const list of ["wired","dynamicReference","testOnly","scriptsOnly","unwired"])report[list].sort();
	report.counts={wired:report.wired.length,dynamicReference:report.dynamicReference.length,testOnly:report.testOnly.length,scriptsOnly:report.scriptsOnly.length,unwired:report.unwired.length,unresolvable:report.unresolvable.length};
	return {ok:report.unresolvable.length===0,report};
}

const entriesInTree=(trackedSet,prefix)=>[...trackedSet].filter((file)=>file.startsWith(prefix)&&parseable(file));

const invokedDirectly=(importedPath)=>{
	const entry=process.argv[1];
	return entry!==undefined&&normalise(path.resolve(entry))===normalise(path.resolve(fileURLToPath(importedPath)));
};
if(invokedDirectly(import.meta.url)){
	const shaIndex=process.argv.indexOf("--sha");
	const sha=shaIndex>0?process.argv[shaIndex+1]??null:null;
	const listing=spawnSync("git",["ls-files"],{cwd:process.cwd(),encoding:"utf8"});
	if(listing.status!==0)throw new Error(`git ls-files failed: ${listing.stderr}`);
	const tracked=listing.stdout.split(/\r?\n/u).filter(Boolean);
	const {ok,report}=auditReachability({root:process.cwd(),entries:PRODUCTION_ENTRIES,tracked,sha});
	// Deterministic stdout: tabs, fixed key order, sorted lists, platform-independent paths.
	console.log(JSON.stringify(report,null,"\t"));
	process.exit(ok?0:1);
}

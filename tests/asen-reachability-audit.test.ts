// UFC-M1-06: the R21 answer must come from ONE deterministic reachability tool over the real
// ESM graph — never from naive basename grep (the phantom six names at runbook L113).
// RED (per plan field 13): these fixture-driven assertions fail against shipped code because no
// shipped component produces any of the five classifications.
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";
// @ts-expect-error The reachability auditor is a standalone provider-free ESM script without a declaration file.
import {auditReachability} from "../scripts/asen-reachability-audit.mjs";

function fixtureRoot():string{
	const base=path.resolve(".cache");
	mkdirSync(base,{recursive:true});
	return mkdtempSync(path.join(base,"asen-reachability-"));
}
function writeFiles(root:string,files:Record<string,string>):string[]{
	for(const [rel,content] of Object.entries(files)){
		const target=path.join(root,rel);
		mkdirSync(path.dirname(target),{recursive:true});
		writeFileSync(target,content);
	}
	return Object.keys(files);
}

test("UFC-M1-06 one audit classifies a known five-module graph correctly",()=>{
	const root=fixtureRoot();
	try{
		const tracked=writeFiles(root,{
			"src/entry.ts":`import {wired} from "./wired.js";\nconst load=()=>import("./dynclass.js");\nexport default {wired,load};\n`,
			"src/wired.ts":`import {shared} from "./shared.js";\nexport const wired=shared+1;\n`,
			"src/shared.ts":`export const shared=1;\n`,
			"src/dynclass.ts":`export const dynamicOnly=2;\n`,
			"src/testonly.ts":`export const fixtureOnly=3;\n`,
			"src/scriptsonly.ts":`export const scriptOnly=4;\n`,
			"src/unwired.ts":`export const neverImported=5;\n`,
			"tests/fixture.test.ts":`import {fixtureOnly} from "../src/testonly.js";\nexport default fixtureOnly;\n`,
			"scripts/tool.mjs":`import {scriptOnly} from "../src/scriptsonly.js";\nconsole.log(scriptOnly);\n`,
			"README.md":`The module src/unwired.ts is only mentioned in this document.\n`,
		});
		const result=auditReachability({root,entries:["src/entry.ts"],tracked});
		assert.equal(result.ok,true,"a fully resolvable fixture graph passes");
		const report=result.report;
		assert.ok(report.wired.includes("src/wired.ts")&&report.wired.includes("src/shared.ts"),"statically reached modules are wired");
		assert.ok(report.dynamicReference.includes("src/dynclass.ts"),"a dynamically imported module is classified dynamic");
		assert.ok(!report.unwired.includes("src/dynclass.ts"),"a dynamic reference is never listed as unwired");
		assert.ok(report.testOnly.includes("src/testonly.ts"),"modules reached only from tests are test-only fixtures");
		assert.ok(report.scriptsOnly.includes("src/scriptsonly.ts"),"modules reached only from scripts are scripts-only");
		assert.ok(report.unwired.includes("src/unwired.ts"),"a module with no resolved importer is unwired");
		for(const list of [...report.wired,...report.dynamicReference,...report.testOnly,...report.scriptsOnly,...report.unwired])
			assert.ok(!/\.md$/u.test(list),`documentation never appears as a module: ${list}`);
		assert.equal(report.unresolvable.length,0,"the known graph has no dangling specifier");
	}finally{
		rmSync(root,{recursive:true,force:true});
	}
});

test("UFC-M1-06 an unresolvable specifier fails the audit closed instead of silently passing",()=>{
	const root=fixtureRoot();
	try{
		const tracked=writeFiles(root,{
			"src/entry.ts":`import {missing} from "./ghost.js";\nexport default missing;\n`,
			"src/present.ts":`export const present=1;\n`,
		});
		const result=auditReachability({root,entries:["src/entry.ts"],tracked});
		assert.equal(result.ok,false,"an unresolvable graph cannot pass");
		assert.deepEqual(result.report.unresolvable,[{from:"src/entry.ts",specifier:"./ghost.js"}],"the dangling edge is reported exactly");
		assert.ok(result.report.unwired.includes("src/present.ts"),"the rest of the classification still completes");
	}finally{
		rmSync(root,{recursive:true,force:true});
	}
});

test("UFC-M1-06 the audit is deterministic and reports production entries for the real repository",()=>{
	const root=path.resolve(".");
	const tracked=(()=>{const out=spawnSync("git",["ls-files"],{cwd:root,encoding:"utf8"});assert.equal(out.status,0,out.stderr);return out.stdout.split(/\r?\n/u).filter(Boolean);})();
	const first=auditReachability({root,entries:["src/cli.ts","extensions/asen.ts"],tracked});
	const second=auditReachability({root,entries:["src/cli.ts","extensions/asen.ts"],tracked});
	assert.equal(first.ok,true,"typecheck exit 0 guarantees every real import resolves (plan field 4)");
	assert.equal(JSON.stringify(first),JSON.stringify(second),"two runs are byte-identical");
	const classes=[...first.report.wired,...first.report.dynamicReference,...first.report.testOnly,...first.report.scriptsOnly,...first.report.unwired];
	for(const module of classes)assert.match(module,/^src\//u,"only tracked src/ modules are classified");
	assert.deepEqual([...new Set(classes)].length,classes.length,"a module never lands in two classes");
});

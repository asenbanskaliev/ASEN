import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import assert from "node:assert/strict";

const script=fileURLToPath(import.meta.url);
const root=resolve(dirname(script),"..");
const sha256=value=>createHash("sha256").update(value).digest("hex");
const git=(...args)=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
const fail=message=>{throw new Error(message);};

function projectAt(base){
  const project=join(base,"project");
  mkdirSync(project);
  writeFileSync(join(project,"sample.js"),'export function greet(name) { return `hello ${name}`; }\n');
  for(const args of [
    ["init","-q","-b","main"],
    ["config","user.name","T07 disposable fixture"],
    ["config","user.email","t07@example.invalid"],
    ["add","sample.js"],
    ["commit","-q","-m","fixture"],
  ]){
    execFileSync("git",args,{cwd:project,stdio:"ignore"});
  }
  return project;
}

function indexHash(project){
  const database=join(project,".codegraph","codegraph.db");
  return existsSync(database)?sha256(readFileSync(database)):null;
}

function filesUnder(directory,prefix=""){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const relativePath=join(prefix,entry.name);
    if(entry.isSymbolicLink())fail(`Unexpected symlink in pinned runtime archive: ${relativePath}`);
    return entry.isDirectory()?filesUnder(join(directory,entry.name),relativePath):[relativePath];
  }).sort();
}

function verifyArchive(archive,installedRoot,expected){
  const bytes=readFileSync(archive);
  const observed={
    integrity:`sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum:createHash("sha1").update(bytes).digest("hex"),
  };
  assert.deepEqual(observed,expected,"npm archive digest must match pinned registry metadata");
  const temporary=mkdtempSync(join(tmpdir(),"asen-t07-archive-"));
  const extracted=join(temporary,"contents");
  mkdirSync(extracted);
  try{
    execFileSync("tar",["-xzf",resolve(archive),"-C",extracted],{stdio:"ignore"});
    const archiveRoot=join(extracted,"package");
    const archiveFiles=filesUnder(archiveRoot);
    const installedFiles=filesUnder(installedRoot);
    assert.deepEqual(installedFiles,archiveFiles,"installed runtime file inventory must match the verified npm archive");
    for(const path of archiveFiles){
      assert.deepEqual(
        sha256(readFileSync(join(installedRoot,path))),
        sha256(readFileSync(join(archiveRoot,path))),
        `installed runtime file differs from verified archive: ${path}`,
      );
    }
    return {...observed,fileCount:archiveFiles.length};
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
}

function normalizeResult(result,project){
  return {
    status:result.details?.status??"completed",
    operation:result.details?.operation,
    args:result.details?.args?.map(arg=>arg===project?"<project>":arg),
    content:result.content.map(item=>item.type==="text"?item.text.split(project).join("<project>"):item),
  };
}

async function publicToolCall(tool,input,project,confirm){
  return tool.execute("t07-live",input,undefined,undefined,{
    cwd:project,
    hasUI:typeof confirm==="boolean",
    ...(typeof confirm==="boolean"?{ui:{confirm:async()=>confirm}}:{}),
  });
}

async function restartQuery(project){
  const {createCodeGraphTool}=await import("../src/interaction/code-intelligence.ts");
  const tool=createCodeGraphTool();
  const query=await publicToolCall(tool,{operation:"query",query:"greet",limit:5},project);
  const explore=await publicToolCall(tool,{operation:"explore",query:"greet",limit:5},project);
  process.stdout.write(JSON.stringify({
    query:normalizeResult(query,project),
    explore:normalizeResult(explore,project),
  })+"\n");
}

async function liveRun(binDir,mainArchive,bundleArchive,evidencePath){
  if(process.env.ASEN_T07_OFFLINE_NET_NAMESPACE!=="1")fail("Run this gate inside an isolated Linux network namespace.");
  if(process.platform!=="linux")fail("This live evidence gate currently supports Linux network-namespace isolation only.");
  binDir=realpathSync(binDir);
  const entry=realpathSync(join(binDir,"codegraph"));
  const packageRoot=dirname(entry);
  const packageJson=JSON.parse(readFileSync(join(packageRoot,"package.json"),"utf8"));
  const bundleJson=JSON.parse(readFileSync(join(packageRoot,"..","codegraph-linux-x64","package.json"),"utf8"));
  if(packageJson.name!=="@colbymchenry/codegraph"||packageJson.version!=="1.6.2")fail("Expected pinned CodeGraph 1.6.2.");
  if(bundleJson.name!=="@colbymchenry/codegraph-linux-x64"||bundleJson.version!=="1.6.2")fail("Expected pinned Linux x64 CodeGraph bundle 1.6.2.");

  const {createCodeGraphTool}=await import("../src/interaction/code-intelligence.ts");
  const base=mkdtempSync(join(tmpdir(),"asen-t07-live-"));
  try{
    const mainExpected={
      integrity:"sha512-hODH/mGnCf3IUMs6rzktv/zbecJIKJfdZAYHZ9mqecb0G7ZkHaA8CZafDVnswANFEL1YFcG+lfAwc5SIXzUH6Q==",
      shasum:"372b7b4f0190197b07d444116d6692240883a2d5",
    };
    const bundleExpected={
      integrity:"sha512-DJWizz1qHNr1MsbK6fz1mjVUQjeTH3T+L0D2BGaLkygWzBnNMG30MvLq1ae0m6cUV414U8aEow5Eb/kIORA8+w==",
      shasum:"7fca3d49db06571846ca98bca778c4ee6e83553c",
    };
    const verifiedMain=verifyArchive(mainArchive,packageRoot,mainExpected);
    const verifiedBundle=verifyArchive(bundleArchive,join(packageRoot,"..","codegraph-linux-x64"),bundleExpected);
    const project=projectAt(base);
    const home=join(base,"home");
    mkdirSync(home);
    process.env.PATH=`${binDir}${process.env.PATH?`:${process.env.PATH}`:""}`;
    process.env.HOME=home;
    process.env.CODEGRAPH_NO_DOWNLOAD="1";
    process.env.CODEGRAPH_TELEMETRY="0";
    process.env.DO_NOT_TRACK="1";

    const tool=createCodeGraphTool();
    const beforeInit=normalizeResult(await publicToolCall(tool,{operation:"query",query:"greet",limit:5},project),project);
    assert.equal(existsSync(join(project,".codegraph")),false,"a query before init must not create an index");

    const denied=normalizeResult(await publicToolCall(tool,{operation:"init"},project,false),project);
    assert.equal(denied.status,"denied");
    assert.equal(existsSync(join(project,".codegraph")),false,"denied initialization must have no filesystem effect");

    const approved=normalizeResult(await publicToolCall(tool,{operation:"init"},project,true),project);
    assert.equal(approved.operation,"init");
    assert.equal(existsSync(join(project,".codegraph","codegraph.db")),true,"approved real initialization must create the local database");
    assert.equal(approved.content.join("\n").includes("collects anonymous usage stats"),false,"telemetry must be disabled in the real CLI");

    const initializedIndexHash=indexHash(project);
    assert.ok(initializedIndexHash,"the initialized SQLite index must be present");
    const query=normalizeResult(await publicToolCall(tool,{operation:"query",query:"greet",limit:5},project),project);
    const explore=normalizeResult(await publicToolCall(tool,{operation:"explore",query:"greet",limit:5},project),project);
    assert.match(query.content.join("\n"),/\bgreet\b/);
    assert.match(explore.content.join("\n"),/hello \$\{name\}/);
    assert.equal(indexHash(project),initializedIndexHash,"read-only queries must preserve the index bytes");

    writeFileSync(join(project,"sample.js"),'export function greet(name) { return `updated ${name}`; }\n');
    const updatedExplore=normalizeResult(await publicToolCall(tool,{operation:"explore",query:"greet",limit:5},project),project);
    assert.match(updatedExplore.content.join("\n"),/updated \$\{name\}/,"explore must return current on-disk source");
    assert.equal(indexHash(project),initializedIndexHash,"explore must not rewrite the index");

    const child=spawnSync(process.execPath,["--import","tsx",script,"--restart-query",project],{
      cwd:root,
      env:{...process.env},
      encoding:"utf8",
      timeout:30_000,
      maxBuffer:1_000_000,
      windowsHide:true,
    });
    if(child.error||child.status!==0)fail(`Fresh-process CodeGraph query failed: ${child.stderr||child.error?.message||child.status}`);
    const restarted=JSON.parse(child.stdout);
    assert.match(restarted.query.content.join("\n"),/\bgreet\b/);
    assert.match(restarted.explore.content.join("\n"),/updated \$\{name\}/);
    assert.equal(indexHash(project),initializedIndexHash,"restart queries must preserve the index bytes");

    const sourceFile=join(root,"src/interaction/code-intelligence.ts");
    const testFile=join(root,"tests/code-intelligence.test.ts");
    const report={
      schema:"asen.t07.codegraph-live.v1",
      candidate:{commit:git("rev-parse","HEAD"),branch:git("branch","--show-current"),workingTreeStatus:git("status","--short").split("\n").filter(Boolean)},
      implementation:{
        source:{path:"src/interaction/code-intelligence.ts",sha256:sha256(readFileSync(sourceFile))},
        focusedTests:{path:"tests/code-intelligence.test.ts",sha256:sha256(readFileSync(testFile))},
        liveGate:{path:"scripts/t07-codegraph-live.mjs",sha256:sha256(readFileSync(script))},
      },
      runtime:{
        package:packageJson.name,
        version:packageJson.version,
        integrity:verifiedMain.integrity,
        shasum:verifiedMain.shasum,
        verifiedArchiveFileCount:verifiedMain.fileCount,
        platformBundle:bundleJson.name,
        platformBundleVersion:bundleJson.version,
        platformBundleIntegrity:verifiedBundle.integrity,
        platformBundleShasum:verifiedBundle.shasum,
        platformBundleVerifiedArchiveFileCount:verifiedBundle.fileCount,
        platform:process.platform,
        architecture:process.arch,
        nodeVersion:process.version,
      },
      isolation:{networkNamespace:"unshare --net",networkFallbackDisabled:true,telemetryDisabled:true,projectHome:"temporary isolated HOME"},
      scenarios:{
        queryBeforeInit:beforeInit,
        initializationDenied:denied,
        approvedInitialization:approved,
        query:query,
        explore:explore,
        changedSourceExplore:updatedExplore,
        freshProcessAfterRestart:restarted,
      },
      assertions:{
        queryDidNotInitialize:true,
        deniedInitHadNoIndex:true,
        approvedInitCreatedIndex:true,
        telemetryNoticeAbsent:true,
        queryAndExplorePreservedIndexBytes:true,
        exploreReturnedChangedOnDiskSource:true,
        freshProcessQueriedPersistedIndex:true,
        restartQueriesPreservedIndexBytes:true,
      },
      limitations:[
        "Linux x64 only; no Pi host UI/RPC lifecycle or Windows/macOS evidence.",
        "Optional documentation integration was not exercised; it is not required for this bounded CodeGraph contract.",
        "The updated source is read from disk by explore; index rebuild/reconciliation after source changes is not claimed.",
      ],
    };
    mkdirSync(dirname(resolve(evidencePath)),{recursive:true});
    writeFileSync(resolve(evidencePath),JSON.stringify(report,null,2)+"\n");
    process.stdout.write(JSON.stringify({evidence:resolve(evidencePath),candidate:report.candidate.commit,scenarios:Object.keys(report.scenarios),assertions:report.assertions})+"\n");
  }finally{
    rmSync(base,{recursive:true,force:true});
  }
}

if(process.argv[2]==="--restart-query")await restartQuery(resolve(process.argv[3]));
else if(process.argv.length===6)await liveRun(process.argv[2],process.argv[3],process.argv[4],process.argv[5]);
else fail("Usage: unshare --net env ASEN_T07_OFFLINE_NET_NAMESPACE=1 node --import tsx scripts/t07-codegraph-live.mjs <codegraph-bin-dir> <codegraph.tgz> <codegraph-linux-x64.tgz> <evidence.json>");

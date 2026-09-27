import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const extensionPath=process.argv[2];
if(!extensionPath) throw new Error("extension path required");

const module=await import(pathToFileURL(extensionPath).href);
const commands=new Map();
const pi={
  registerCommand(name,command){commands.set(name,command);}
};
module.default(pi);
const command=commands.get("asen");
if(!command) throw new Error("ASEN command was not registered");
const result=await command.handler();
if(result?.product!=="ASEN" || result?.mode!=="pi-native" || result?.status!=="ready") {
  throw new Error("ASEN command returned an invalid runtime contract");
}
console.log(JSON.stringify({loaded:true,command:"asen",result}));

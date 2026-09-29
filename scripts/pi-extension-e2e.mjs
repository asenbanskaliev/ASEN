import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const extensionPath=process.argv[2];
if(!extensionPath) throw new Error("extension path required");

const module=await tsImport(pathToFileURL(resolve(extensionPath)).href,import.meta.url);
const commands=new Map();
const pi={
  registerCommand(name,command){commands.set(name,command);}
};
module.default(pi);
const command=commands.get("asen"),registryCommand=commands.get("asen-skill-registry");
if(!command) throw new Error("ASEN command was not registered");
if(!registryCommand) throw new Error("ASEN skill registry command was not registered");
const result=await command.handler();
if(result?.product!=="ASEN" || result?.mode!=="pi-native" || result?.status!=="ready") {
  throw new Error("ASEN command returned an invalid runtime contract");
}
console.log(JSON.stringify({loaded:true,commands:["asen","asen-skill-registry"],result}));

import assert from "node:assert/strict";
import test from "node:test";
import {createAsenExtension} from "../extensions/asen.js";

test("Pi extension registers the ASEN command",async()=>{
  const commands=new Map<string,{description:string;handler:(...args:unknown[])=>unknown}>();
  createAsenExtension()({registerCommand:(name,command)=>commands.set(name,command)});
  assert.ok(commands.has("asen"));
  const result=await commands.get("asen")!.handler();
  assert.deepEqual(result,{product:"ASEN",mode:"pi-native",status:"ready",principle:"ASEN extends Pi; it does not replace Pi."});
});

import assert from "node:assert/strict";
import test from "node:test";
import {authorizeRepositoryOperation} from "../src/repository/operation-policy.ts";
const binding=sessionId=>({host:"github.com",owner:"asenbanskaliev",repository:"ASEN",sessionId,actor:"sonda-local",action:"remote_read"});
test("RDD: rechazar proxy antes de emitir autoridad o ejecutar traps",()=>{
 let llamadas=0;
 const proxy=new Proxy(binding("d3-proxy"),{getPrototypeOf(target){llamadas++;return Reflect.getPrototypeOf(target);}});
 let emitida=false;try{authorizeRepositoryOperation(proxy);emitida=true;}catch{}
 assert.deepEqual({emitida,llamadas},{emitida:false,llamadas:0});
});
test("RDD: control de binding plano válido e inmutable",()=>{
 const authority=authorizeRepositoryOperation(binding("d3-control"));
 assert.equal(authority.action,"remote_read");assert.equal(Object.isFrozen(authority),true);
});

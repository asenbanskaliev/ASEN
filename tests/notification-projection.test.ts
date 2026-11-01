import test from "node:test";
import assert from "node:assert/strict";
import {PiNotificationProjection} from "../src/runtime/notification-projection.js";

function widget(){
 const calls:Array<{key:string;content:string[]|undefined}>=[];
 const ui={setWidget(key:string,content:string[]|undefined){calls.push({key,content});}};
 return {ui,calls,visible:()=>calls.at(-1)?.content?.join("\n")??""};
}
const A={sessionId:"session-1",projectId:"/project-a"};
const B={sessionId:"session-1",projectId:"/project-b"};
const C={sessionId:"session-2",projectId:"/project-a"};

test("production projection uses the identity bus without becoming a Pi delivery receipt",()=>{
 const v=widget(),p=new PiNotificationProjection({capacity:4});
 p.activate(A,v.ui);
 assert.equal(p.publish(A,v.ui,"job","job-a","Job A: Succeeded"),true);
 assert.match(v.visible(),/Job A: Succeeded/u);
 assert.match(v.visible(),/unconfirmed/u);
 assert.equal(p.publish(A,v.ui,"job","job-a","Job A: Succeeded"),true);
 assert.equal(v.visible().match(/Job A: Succeeded/gu)?.length,1,"same source id cannot duplicate the UI status");
 assert.equal(p.publish(A,v.ui,"job","job-b","Job A: Succeeded"),true);
 assert.equal(v.visible().match(/Job A: Succeeded/gu)?.length,2,"distinct identities with same message remain separate");
 assert.equal(p.publish(A,v.ui,"agent","agent-1","Agent finished"),true);
 assert.match(v.visible(),/Agent finished/u);
 assert.doesNotMatch(v.visible(),/delivered: true|read: true/u);
});

test("session and project switches cannot show foreign events",()=>{
 const v=widget(),p=new PiNotificationProjection(),other=widget();
 p.activate(A,v.ui);
 assert.equal(p.publish(A,v.ui,"job","first","private A outcome"),true);
 p.activate(B,v.ui);
 assert.doesNotMatch(v.visible(),/private A outcome/u);
 assert.equal(p.publish(A,v.ui,"job","late","late stale event"),false);
 assert.equal(p.publish(B,v.ui,"job","second","project B outcome"),true);
 assert.doesNotMatch(v.visible(),/private A outcome/u);
 p.activate(C,other.ui);
 assert.equal(p.publish(B,v.ui,"agent","stale","should not appear"),false);
 assert.doesNotMatch(other.visible(),/project B outcome/u);
 assert.equal(p.publish(C,other.ui,"job","third","new session outcome"),true);
 assert.match(other.visible(),/new session outcome/u);
 p.deactivate(B);
 assert.match(other.visible(),/new session outcome/u,"stale shutdown cannot clear active session");
 p.deactivate(C);
 assert.equal(other.visible(),"","shutdown clears the session-specific widget");
});

test("untrusted source identifiers and control text cannot escape into widget",()=>{
 const v=widget(),p=new PiNotificationProjection();
 p.activate(A,v.ui);
 assert.equal(p.publish(A,v.ui,"job","secret-source-raw","visible\u001b]0;HIDDEN\u0007\u202e outcome\nfinished"),true);
 assert.match(v.visible(),/terminal control sequence omitted/u);
 assert.doesNotMatch(v.visible(),/secret-source-raw|HIDDEN|\u001b|\u202e/u);
});

test("widget errors and bus saturation do not break ongoing delivery",()=>{
 const fail={setWidget(){throw new Error("renderer failure");}};
 const p=new PiNotificationProjection({capacity:1});
 p.activate(A,fail);
 assert.equal(p.publish(A,fail,"job","one","first"),true,"optional renderer failures do not throw");
 assert.equal(p.publish(A,fail,"job","two","second"),false,"capacity fails closed inside projection only");
 assert.equal(p.publish(C,fail,"job","foreign","other"),false);
 p.deactivate(A);
 const q=new PiNotificationProjection({capacity:1});
 const v=widget();q.activate(A,v.ui);
 assert.equal(v.visible(),"","the projection is intentionally non-durable; the background journal handles restart");
});

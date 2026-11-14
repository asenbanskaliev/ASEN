import test from "node:test";
import assert from "node:assert/strict";
import {implementedCommands} from "../src/runtime/command-catalog.js";
import {
 ASEN_GUIDE_STEPS,EDITOR_OFFSET_ROWS,GUIDE_POPOVER_WIDTH,MIN_POPOVER_WIDTH,GuideTour,filterGuideSteps,guidePlacement,guideStepText,guideTryLine,
 type GuideStep,
} from "../src/runtime/guide-tour.js";
import {ASEN_KEYMAP_ACTIONS} from "../src/runtime/keymaps.js";

const welcome:GuideStep={id:"welcome",title:"Welcome to ASEN",body:"A short tour of the workbench.",region:"center"};
const palette:GuideStep={id:"palette",title:"Command palette",body:"Every command from one filter.",region:"center",command:"asen-palette",keymap:"commands",requires:"asen-palette"};
const end:GuideStep={id:"end",title:"That's the tour",body:"The palette lists everything shown here.",region:"editor"};
const steps:readonly GuideStep[]=[welcome,palette,end];
const tour=():GuideTour=>new GuideTour(steps);

test("an empty tour is refused before a step could be shown",()=>{
 assert.throws(()=>new GuideTour([]),/^Error: A tour needs at least one step\.$/u);
 const single=new GuideTour([welcome]);
 assert.deepEqual(single.current(),welcome);
 assert.equal(single.position(),1);
 assert.equal(single.isLast(),true);
 assert.equal(single.next(),false);
});

test("current, position and isLast follow the index without other state",()=>{
 const t=tour();
 assert.deepEqual(t.getSteps(),steps);
 assert.equal(t.getSteps().length,3);
 assert.deepEqual(t.current(),welcome);
 assert.equal(t.position(),1);
 assert.equal(t.isLast(),false);
 t.next();
 assert.deepEqual(t.current(),palette);
 assert.equal(t.position(),2);
 assert.equal(t.isLast(),false);
 t.next();
 t.next();
 assert.deepEqual(t.current(),end);
 assert.equal(t.position(),3);
 assert.equal(t.isLast(),true);
 assert.deepEqual(t.getSteps(),steps,"navigation never reorders or drops steps");
});

test("next stops at the last step and previous stops at the first without moving",()=>{
 const t=tour();
 assert.equal(t.previous(),false);
 assert.equal(t.position(),1);
 assert.deepEqual(t.current(),welcome);
 assert.equal(t.next(),true);
 assert.equal(t.next(),true);
 assert.equal(t.isLast(),true);
 assert.equal(t.next(),false);
 assert.equal(t.position(),3);
 assert.deepEqual(t.current(),end);
 assert.equal(t.previous(),true);
 assert.equal(t.position(),2);
 assert.deepEqual(t.current(),palette);
});

test("show jumps to a known id and refuses an unknown one where it stands",()=>{
 const t=tour();
 t.next();
 assert.equal(t.show("welcome"),true);
 assert.equal(t.position(),1);
 assert.equal(t.show("end"),true);
 assert.equal(t.position(),3);
 assert.equal(t.show("no-such-step"),false);
 assert.equal(t.position(),3,"a rejected show does not send the user back to the start");
 assert.equal(t.show("palette"),true);
 assert.equal(t.position(),2);
});

test("filterGuideSteps keeps only steps whose requirement is available",()=>{
 const withPalette=new Set(["asen-palette"]);
 assert.deepEqual(filterGuideSteps(withPalette,steps),[welcome,palette,end],"a step whose command exists stays, in tour order");
 assert.deepEqual(filterGuideSteps(new Set(),steps),[welcome,end],"steps without requires always stay");
 assert.deepEqual(filterGuideSteps(new Set(["asen-other"]),steps),[welcome,end],"an unrelated availability changes nothing");
 const doctor:GuideStep={...end,id:"doctor",requires:"asen-doctor"};
 assert.deepEqual(filterGuideSteps(new Set(["asen-palette","asen-doctor"]),[welcome,palette,doctor]),[welcome,palette,doctor],"every satisfied requirement keeps its step");
 assert.deepEqual(filterGuideSteps(new Set(["asen-palette"]),[welcome,palette,doctor]),[welcome,palette],"an unsatisfied requirement drops only its own step");
 const input=[welcome,palette];
 assert.deepEqual(filterGuideSteps(new Set(),input),[welcome]);
 assert.deepEqual(input,[welcome,palette],"filtering never mutates the caller's steps");
 assert.deepEqual(filterGuideSteps(withPalette),[]);
});

test("guidePlacement picks the region anchor and the agent mode never captures keys",()=>{
 assert.deepEqual(guidePlacement("center",100,undefined,"local"),{anchor:"center",width:56,nonCapturing:false});
 assert.deepEqual(guidePlacement("center",100,12,"agent"),{anchor:"center",width:56,nonCapturing:true});
 assert.deepEqual(guidePlacement("sidebar",100,20,"local"),{anchor:"right-center",width:56,offsetX:-21,nonCapturing:false});
 assert.deepEqual(guidePlacement("sidebar",100,20,"agent"),{anchor:"right-center",width:56,offsetX:-21,nonCapturing:true});
 assert.deepEqual(guidePlacement("sidebar",100,undefined,"local"),{anchor:"center",width:56,nonCapturing:false},"a rail-less sidebar falls back to center");
 assert.deepEqual(guidePlacement("editor",100,20,"local"),{anchor:"bottom-center",width:56,offsetY:-EDITOR_OFFSET_ROWS,nonCapturing:false},"a rail never moves an editor step");
 assert.deepEqual(guidePlacement("editor",100,undefined,"agent"),{anchor:"bottom-center",width:56,offsetY:-6,nonCapturing:true});
 assert.equal(EDITOR_OFFSET_ROWS,6);
});

test("popover width is clamped between the minimum and the reference width",()=>{
 assert.equal(GUIDE_POPOVER_WIDTH,56);
 assert.equal(MIN_POPOVER_WIDTH,40);
 for(const [columns,width] of [[1,40],[44,40],[45,41],[50,46],[59,55],[60,56],[120,56],[300,56]] as const){
  assert.equal(guidePlacement("center",columns,undefined,"local").width,width,`${columns} columns`);
 }
 for(const columns of [0,1,7,40,43,44,57,80,240,4000]){
  const {width}=guidePlacement("center",columns,undefined,"local");
  assert.ok(width>=MIN_POPOVER_WIDTH&&width<=GUIDE_POPOVER_WIDTH,`${columns} columns stays inside the clamp`);
 }
});

test("guideStepText narrates the step, the live key and what comes next",()=>{
 assert.equal(guideStepText(tour(),{}),[
  "Step 1/3 · Welcome to ASEN",
  "A short tour of the workbench.",
  "Next: Command palette",
 ].join("\n"),"a step with nothing to try prints no try line");
 const t=tour();
 t.next();
 assert.equal(guideStepText(t,{}),[
  "Step 2/3 · Command palette",
  "Every command from one filter.",
  "Try: /asen-palette · alt+k",
  "Next: That's the tour",
 ].join("\n"));
 t.next();
 assert.equal(guideStepText(t,{}),[
  "Step 3/3 · That's the tour",
  "The palette lists everything shown here.",
  "This is the last step",
 ].join("\n"),"a step with no command and no keymap prints no try line");
});

test("the try line follows the live keymap and disappears when nothing can be tried",()=>{
 const t=tour();
 t.next();
 assert.equal(guideStepText(t,{ASEN_PALETTE_KEY:"ctrl+j"}).split("\n")[2],"Try: /asen-palette · ctrl+j");
 assert.equal(guideStepText(t,{ASEN_PALETTE_KEY:""}).split("\n")[2],"Try: /asen-palette");
 assert.equal(guideStepText(t,{ASEN_PALETTE_KEY:"off"}).split("\n")[2],"Try: /asen-palette");
 assert.equal(guideStepText(t,{ASEN_PALETTE_KEY:"OFF"}).split("\n")[2],"Try: /asen-palette");
 assert.equal(guideTryLine({...palette,keymap:"no-such-action"},{}),"Try: /asen-palette","an unknown keymap id never invents a key");
 assert.equal(guideTryLine({id:"k",title:"K",body:"B",region:"center",keymap:"changes"},{}),"Try: alt+g");
 assert.equal(guideTryLine(welcome,{}),"");
 const keymapOnly=new GuideTour([{id:"k",title:"Key only",body:"B",region:"center",keymap:"commands"}]);
 assert.equal(guideStepText(keymapOnly,{}),"Step 1/1 · Key only\nB\nTry: alt+k\nThis is the last step");
 const bare=new GuideTour([{id:"n",title:"Nothing",body:"B",region:"center",keymap:"no-such-action"}]);
 assert.equal(guideStepText(bare,{}),"Step 1/1 · Nothing\nB\nThis is the last step");
 assert.equal(guideStepText(bare,{}).includes("Try:"),false,"no command and no live key prints no try line");
});

test("the default ASEN tour runs from welcome to end with real commands and keymaps",()=>{
 assert.equal(ASEN_GUIDE_STEPS[0]?.id,"welcome");
 assert.equal(ASEN_GUIDE_STEPS.at(-1)?.id,"end");
 assert.equal(ASEN_GUIDE_STEPS.length,13);
 const ids=ASEN_GUIDE_STEPS.map(step=>step.id);
 assert.equal(new Set(ids).size,ids.length,"step ids are unique");
 const known=new Set(ASEN_KEYMAP_ACTIONS.map(action=>action.id));
 const commands=new Set(implementedCommands());
 for(const step of ASEN_GUIDE_STEPS){
  assert.ok(step.id&&step.title&&step.body,`${step.id} is complete`);
  assert.ok(["center","editor","sidebar"].includes(step.region),`${step.id} anchors a real region`);
  if(step.command!==undefined)assert.ok(commands.has(step.command),`${step.id} targets implemented command /${step.command}`);
  if(step.keymap!==undefined)assert.ok(known.has(step.keymap),`${step.id} shows the live key of a real keymap action`);
  if(step.requires!==undefined)assert.ok(commands.has(step.requires),`${step.id} requires the command it offers: ${step.requires}`);
  if(step.command!==undefined&&step.requires!==undefined)assert.equal(step.requires,step.command,`${step.id} shows its step exactly when its command exists`);
 }
 assert.deepEqual(ASEN_GUIDE_STEPS.filter(step=>!step.requires).map(step=>step.id),["welcome","prompt","end"]);
 assert.deepEqual(new Set(ASEN_GUIDE_STEPS.filter(step=>step.keymap).map(step=>step.keymap)).size,4);
 const t=new GuideTour(filterGuideSteps(new Set(),ASEN_GUIDE_STEPS));
 assert.equal(t.getSteps().length,3);
 assert.equal(t.isLast(),false);
 const full=new GuideTour(filterGuideSteps(commands,ASEN_GUIDE_STEPS));
 assert.equal(full.getSteps().length,13);
 assert.ok(guideStepText(full,{}).startsWith("Step 1/13 · Welcome to ASEN"));
});

import test,{type TestContext} from "node:test";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {ASEN_COMMAND_CATALOG,implementedCommands} from "../src/runtime/command-catalog.js";
import {createAsenExtension} from "../extensions/asen.js";
import {
	ASEN_KEYMAP_ACTIONS,KEYMAPS_FILE,KEYMAPS_SCHEMA,KEYMAP_RELOAD_NOTICE,RESERVED_PI_KEYBINDINGS,
	assignKeymap,checkKeymap,commandKeymapId,effectiveKey,keyFromInput,keymapAction,keymapCommand,
	keymapEnvLock,keymapLabel,keymapOwner,keymapSavedNotice,keymapSource,keymapsUnwritable,normalizeKeyId,
	prepareKeymapChange,readKeymaps,resetKeymap,writeKeymaps,type KeymapBindings,type KeymapFile,type PiKeybindings,
} from "../src/runtime/keymaps.js";

function fixtureHome():{home:string,dispose:()=>void}{
	const base=path.resolve(".cache");
	mkdirSync(base,{recursive:true});
	const home=mkdtempSync(path.join(base,"asen-keymaps-"));
	return {home,dispose:()=>rmSync(home,{recursive:true,force:true})};
}

test("the keymap registry names real implemented commands and the pinned reserved Pi bindings",()=>{
	const ids=ASEN_KEYMAP_ACTIONS.map(action=>action.id);
	assert.equal(new Set(ids).size,ids.length,"action ids are unique");
	assert.equal(new Set(ASEN_KEYMAP_ACTIONS.map(action=>action.env)).size,ASEN_KEYMAP_ACTIONS.length,"each action owns one env var");
	for(const action of ASEN_KEYMAP_ACTIONS){
		assert.match(action.env,/^[A-Z][A-Z0-9_]*$/u,`${action.id} uses a SCREAMING env var`);
		if(action.command!==undefined)assert.ok(implementedCommands().includes(action.command),`${action.id} targets implemented command /${action.command}`);
		if(action.defaultKey!==undefined)assert.equal(normalizeKeyId(action.defaultKey),action.defaultKey,`${action.id} default is already canonical`);
	}
	assert.deepEqual(RESERVED_PI_KEYBINDINGS,[
		"app.interrupt","app.clear","app.exit","app.suspend","app.thinking.cycle",
		"app.model.cycleForward","app.model.cycleBackward","app.model.select","app.tools.expand",
		"app.thinking.toggle","app.editor.external","app.message.copy","app.message.followUp",
		"tui.input.submit","tui.select.confirm","tui.select.cancel","tui.input.copy","tui.editor.deleteToLineEnd",
	],"the pinned Pi 1.2.0 RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS list");
	const byId=new Map(ASEN_KEYMAP_ACTIONS.map(action=>[action.id,action]));
	for(const id of ["commands","changes","usage","agents.view"])assert.ok(byId.get(id),`action ${id} is registered`);
	assert.equal(byId.get("commands")?.defaultKey,"alt+k");
	assert.equal(byId.get("changes")?.defaultKey,"alt+g");
	assert.equal(byId.get("usage")?.defaultKey,"alt+u");
	assert.equal(byId.get("agents.view")?.defaultKey,"alt+a");
});

test("normalizeKeyId lowercases, orders modifiers ctrl,shift,alt,super and rejects unknown modifiers",()=>{
	assert.equal(normalizeKeyId("ALT+K"),"alt+k");
	assert.equal(normalizeKeyId("shift+ctrl+t"),"ctrl+shift+t");
	assert.equal(normalizeKeyId("ctrl+shift+alt+super+p"),"ctrl+shift+alt+super+p");
	assert.equal(normalizeKeyId("cmd+a"),undefined,"unknown modifier rejected");
	assert.equal(normalizeKeyId("ctrl+"),undefined,"missing base key rejected");
	assert.equal(normalizeKeyId(""),undefined,"empty key rejected");
});

test("effectiveKey and keymapSource follow env > saved > default, and both can disable",()=>{
	const env={ASEN_PALETTE_KEY:"ctrl+b"};
	const saved:KeymapBindings={commands:"alt+j"};
	assert.equal(effectiveKey("commands",env,saved),"ctrl+b");
	assert.equal(keymapSource("commands",env,saved),"env");
	assert.equal(effectiveKey("commands",{},saved),"alt+j");
	assert.equal(keymapSource("commands",{},saved),"saved");
	assert.equal(effectiveKey("commands",{}),"alt+k");
	assert.equal(keymapSource("commands",{}),"default");
	assert.equal(effectiveKey("commands",{ASEN_PALETTE_KEY:""},{}),undefined,"empty env disables");
	assert.equal(effectiveKey("commands",{ASEN_PALETTE_KEY:"OFF"},{}),undefined,"off env disables, case-insensitive");
	assert.equal(effectiveKey("commands",{},{commands:null}),undefined,"saved null disables");
	assert.equal(keymapSource("commands",{ASEN_PALETTE_KEY:""},{}),"env","a disabling env is still the source");
	assert.equal(effectiveKey("history",{}),undefined,"a defaultless action resolves to none");
	assert.equal(keymapSource("history",{}),"none");
});

test("command keymap ids map built-ins and wrap the rest as command:<name>",()=>{
	assert.equal(commandKeymapId("asen-changes-view"),"changes");
	assert.equal(commandKeymapId("asen-changes"),"command:asen-changes","explicit legacy command remains separately configurable");
	assert.equal(commandKeymapId("asen-usage"),"usage");
	assert.equal(commandKeymapId("asen-palette"),"commands");
	assert.equal(commandKeymapId("asen-agents"),"agents.view");
	assert.equal(commandKeymapId("asen-doctor"),"command:asen-doctor");
	assert.equal(keymapCommand("command:asen-doctor"),"asen-doctor");
	assert.equal(keymapCommand("command:"),undefined,"the bare prefix is not a command");
	assert.equal(keymapCommand("changes"),undefined,"built-in ids carry no command");
	assert.equal(keymapLabel("command:asen-doctor"),"/asen-doctor");
	assert.equal(keymapLabel("commands"),"Command palette");
	assert.equal(keymapAction("absent"),undefined);
});

test("keyFromInput accepts modified keys and f1-f12 but never keys needed for typing",()=>{
	assert.deepEqual(keyFromInput("\x01"),{key:"ctrl+a"});
	assert.deepEqual(keyFromInput("\x1Bk"),{key:"alt+k"});
	const typing=keyFromInput("a");
	assert.ok("error" in typing && /needed for typing/u.test(typing.error),`plain letters stay typable: ${JSON.stringify(typing)}`);
	const shift=keyFromInput("A");
	assert.ok("error" in shift,"shift alone is still typing");
	assert.ok("key" in keyFromInput("\x1B[15~"),`f5 is assignable: ${JSON.stringify(keyFromInput("\x1B[15~"))}`);
	assert.ok("error" in keyFromInput("garbage-not-a-key"),"unparsed input is refused");
});

test("keymapOwner finds the other action on a key and keymapEnvLock reports the env owner",()=>{
	assert.equal(keymapOwner("alt+g",{},{},undefined),"changes");
	assert.equal(keymapOwner("alt+g",{ASEN_CHANGES_KEY:"alt+g"},{}),"changes","the owner is found even when env-held");
	assert.equal(keymapOwner("alt+j",{},{commands:"alt+j"},"commands"),undefined,"ownId is excluded");
	assert.equal(keymapOwner("f7",{},{commands:"alt+k"}),undefined);
	assert.match(keymapEnvLock("commands",{ASEN_PALETTE_KEY:"ctrl+b"})!,/ASEN_PALETTE_KEY/u);
	assert.equal(keymapEnvLock("commands",{}),undefined);
	assert.equal(keymapEnvLock("command:asen-doctor",{ASEN_PALETTE_KEY:"x"}),undefined,"pseudo actions have no env lock");
});

test("checkKeymap blocks env-locked and Pi-reserved keys, confirms displacements, and otherwise accepts",()=>{
	const reserved:PiKeybindings={getKeys:(binding)=>binding==="app.interrupt"?["escape"]:[]};
	assert.deepEqual(checkKeymap("commands","alt+k",{},{},undefined),{kind:"ok"},"its own default stays ok");
	assert.deepEqual(
		checkKeymap("commands","ctrl+b",{ASEN_PALETTE_KEY:"ctrl+j"},{},{getKeys:()=>[]}),
		{kind:"blocked",message:keymapEnvLock("commands",{ASEN_PALETTE_KEY:"ctrl+j"})!},
	);
	assert.deepEqual(checkKeymap("commands","escape",{},{},reserved),{kind:"blocked",message:"escape is reserved by Pi (app.interrupt); choose another key."});
	assert.deepEqual(checkKeymap("commands","alt+g",{},{},{getKeys:()=>[]}),{kind:"confirm",message:"alt+g is used by Browse changes. Move it to Command palette?",displaces:"changes"});
	assert.deepEqual(checkKeymap("commands","alt+g",{ASEN_CHANGES_KEY:"alt+g"},{},{getKeys:()=>[]}),{kind:"blocked",message:"alt+g is used by Browse changes through ASEN_CHANGES_KEY."});
	const builtin:PiKeybindings={getKeys:()=>[],getResolvedBindings:()=>({"editor.paste":["ctrl+v"]})};
	assert.deepEqual(
		checkKeymap("command:asen-doctor","ctrl+v",{},{},builtin),
		{kind:"confirm",message:"ctrl+v is Pi's editor.paste. Use it for /asen-doctor instead?"},
		"a non-reserved Pi binding needs a confirmation",
	);
});

test("keymaps file persistence: read tolerates missing and malformed files, write stays atomic under schema 1",()=>{
	const {home,dispose}=fixtureHome();
	try{
		const missing=readKeymaps(home);
		assert.deepEqual(missing,{bindings:{},path:path.join(home,KEYMAPS_FILE),malformed:false},"a missing file is not malformed");
		assert.equal(keymapsUnwritable(missing),undefined);
		const written=writeKeymaps(home,{commands:"alt+j",history:null});
		assert.equal(written,path.join(home,KEYMAPS_FILE));
		const file=readKeymaps(home);
		assert.equal(file.malformed,false);
		assert.deepEqual(file.bindings,{commands:"alt+j",history:null});
		const raw=readFileSync(path.join(home,KEYMAPS_FILE),"utf8");
		assert.deepEqual(JSON.parse(raw),{schema:KEYMAPS_SCHEMA,bindings:{commands:"alt+j",history:null}});
		assert.ok(raw.endsWith("\n"));
		assert.deepEqual(readdirSync(home).filter(name=>name.endsWith(".tmp")),[],"the atomic rename leaves no temporary behind");
		writeFileSync(path.join(home,KEYMAPS_FILE),"{not json");
		const broken=readKeymaps(home);
		assert.equal(broken.malformed,true);
		assert.deepEqual(broken.bindings,{},"malformed bindings are ignored");
		assert.match(keymapsUnwritable(broken)!,/unreadable or malformed/u);
		writeFileSync(path.join(home,KEYMAPS_FILE),JSON.stringify({schema:999,bindings:{commands:"alt+j"}}));
		assert.equal(readKeymaps(home).malformed,true,"a foreign schema is malformed");
		writeFileSync(path.join(home,KEYMAPS_FILE),JSON.stringify({schema:KEYMAPS_SCHEMA,bindings:{commands:"ctrl+cmd+a"}}));
		assert.equal(readKeymaps(home).malformed,true,"an unnormalizable key is malformed");
		writeFileSync(path.join(home,KEYMAPS_FILE),JSON.stringify({schema:KEYMAPS_SCHEMA,bindings:[]}));
		assert.equal(readKeymaps(home).malformed,true,"array bindings are malformed");
		mkdirSync(path.join(home,"nested"),{recursive:true});
		const nested=writeKeymaps(path.join(home,"nested"),{commands:"alt+j"});
		assert.deepEqual(JSON.parse(readFileSync(nested,"utf8")).bindings,{commands:"alt+j"});
	}finally{dispose();}
});

test("assignKeymap normalizes and vacates displaced actions; resetKeymap restores the default",()=>{
	const next=assignKeymap({changes:"alt+g"},"commands","ALT+K",undefined);
	assert.deepEqual(next,{changes:"alt+g",commands:"alt+k"});
	const displaced=assignKeymap({changes:"alt+g",usage:"alt+u"},"commands","alt+g","changes");
	assert.deepEqual(displaced,{changes:null,usage:"alt+u",commands:"alt+g"},"the displaced action is disabled explicitly");
	assert.equal(assignKeymap({commands:"alt+k"},"commands",null).commands,null);
	const reset=resetKeymap({commands:"alt+j",usage:"alt+u"},"commands");
	assert.deepEqual(reset,{usage:"alt+u"});
	assert.equal(effectiveKey("commands",{},reset),"alt+k","reset falls back to the default");
});

test("prepareKeymapChange refuses locked, unwritable, typing and reserved keys, then confirms displacement",()=>{
	const {home,dispose}=fixtureHome();
	try{
		const file=readKeymaps(home);
		assert.deepEqual(prepareKeymapChange("commands","\x02",{ASEN_PALETTE_KEY:"ctrl+j"},file),{kind:"refused",message:keymapEnvLock("commands",{ASEN_PALETTE_KEY:"ctrl+j"}),type:"warning"});
		const dirty:KeymapFile={bindings:{},path:path.join(home,KEYMAPS_FILE),malformed:true};
		const dirtyResult=prepareKeymapChange("commands","\x01",{},dirty);
		assert.ok(dirtyResult.kind==="refused"&&dirtyResult.type==="error","a malformed file blocks with an error");
		const typing=prepareKeymapChange("commands","a",{},file);
		assert.ok(typing.kind==="refused"&&/needed for typing/u.test(typing.message));
		const reservedKeys:PiKeybindings={getKeys:(binding)=>binding==="app.clear"?["ctrl+c"]:[]};
		const blocked=prepareKeymapChange("commands","\x03",{},file,reservedKeys);
		assert.ok(blocked.kind==="refused"&&/reserved by Pi \(app.clear\)/u.test(blocked.message));
		const moved=prepareKeymapChange("commands","\x1Bg",{},file,{getKeys:()=>[]});
		assert.ok(moved.kind==="ready");
		if(moved.kind==="ready"){
			assert.equal(moved.key,"alt+g");
			assert.equal(moved.confirm,"alt+g is used by Browse changes. Move it to Command palette?");
			assert.deepEqual(moved.bindings,{commands:"alt+g",changes:null});
		}
		const plain=prepareKeymapChange("commands","\x1Bj",{},file,{getKeys:()=>[]});
		assert.ok(plain.kind==="ready"&&plain.confirm===undefined&&plain.key==="alt+j");
		assert.equal(keymapSavedNotice("commands","Command palette",{},{commands:"alt+j"}),`Command palette: alt+j. ${KEYMAP_RELOAD_NOTICE}`);
		assert.equal(keymapSavedNotice("commands","Command palette",{},{commands:null}),`Command palette: none. ${KEYMAP_RELOAD_NOTICE}`);
	}finally{dispose();}
});

test("every ASEN keymap env slot is honoured before saved bindings and targets registered commands",()=>{
	const implemented=new Set(implementedCommands());
	for(const row of ASEN_COMMAND_CATALOG)if(row.implemented)implemented.add(row.name);
	for(const action of ASEN_KEYMAP_ACTIONS){
		if(action.command!==undefined)assert.ok(implemented.has(action.command),`${action.command} is in the implemented catalog`);
		const disabled=effectiveKey(action.id,{[action.env]:""},{[action.id]:"alt+m"});
		assert.equal(disabled,undefined,`${action.env}="" still wins over saved bindings`);
	}
});

// UFC-M1-04 (functional RED against the shipped code): the registry has no consumer today.
// Only the history seam may call pi.registerShortcut; no startup path registers the effective
// keys of ASEN_KEYMAP_ACTIONS, so these registration tests fail until the wiring ships.
const KEYMAP_ENV_SLOTS=["ASEN_PALETTE_KEY","ASEN_CHANGES_KEY","ASEN_USAGE_KEY","ASEN_AGENTS_VIEW_KEY","ASEN_HISTORY_SHORTCUT"] as const;
function isolateKeymapEnv(t:TestContext){
	for(const name of KEYMAP_ENV_SLOTS){
		const prior=process.env[name];
		delete process.env[name];
		t.after(()=>{if(prior===undefined)delete process.env[name];else process.env[name]=prior;});
	}
}
function keymapHostPi(refuse?:string){
	const shortcuts:{key:string;description?:string;handler:(ctx:unknown)=>unknown}[]=[];
	const events:Function[]=[];
	const notices:string[]=[];
	const pi={
		registerCommand(_name:string,_command:{description:string;handler:(...args:unknown[])=>unknown}){},
		registerTool(){},
		on(_name:string,fn:Function){events.push(fn);},
		getCommands:()=>[],
		getAllTools:()=>[],
		getFlag:()=>false,
		registerShortcut(key:string,options:{description?:string;handler:(ctx:unknown)=>unknown}){
			if(key===refuse)throw new Error("host refused the binding");
			shortcuts.push({key,...options});
		},
	};
	return {pi,shortcuts,notices,emitSessionStart(){
		for(const fn of events){try{void fn({},{cwd:process.cwd(),mode:"print",hasUI:true,sessionManager:{getSessionId:()=>"keymaps-wiring"},ui:{notify(m:string){notices.push(String(m));},setStatus(){}}});}catch{/* unrelated startup listeners are not the subject */}}
	}};
}
function wiringExtensions(home:string){
	return createAsenExtension({homeDir:()=>home,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false});
}

test("UFC-M1-04 startup registers the effective default keys through the public shortcut API",async t=>{
	isolateKeymapEnv(t);
	const {home,dispose}=fixtureHome();
	t.after(dispose);
	const host=keymapHostPi();
	wiringExtensions(home)(host.pi as never);
	const keys=host.shortcuts.map(row=>row.key);
	for(const key of ["alt+k","alt+g","alt+u","alt+a"])assert.ok(keys.includes(key),`${key} registers at startup`);
	assert.ok(!host.shortcuts.some(row=>/history/iu.test(row.description??"")),"history stays on its dedicated opt-in seam");
	// Recorded target decision (plan UFC-M1-04): `changes` keeps the shipped registry command.
	assert.equal(keymapAction("changes")?.command,"asen-changes-view","Browse changes routes to the existing guarded viewer");
	const row=host.shortcuts.find(candidate=>candidate.key==="alt+g")!;
	assert.equal(typeof row.handler,"function","the registered shortcut carries an invocation handler");
});


test("M3 G2: Browse changes shortcut opens a guarded Git file picker, not legacy resolve",async t=>{
 isolateKeymapEnv(t);
 const {home,dispose}=fixtureHome();t.after(dispose);
 execFileSync("git",["init","-q",home]);
 execFileSync("git",["-C",home,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","--allow-empty","-qm","initial"]);
 writeFileSync(path.join(home,"inspect-me.txt"),"safe untracked content");
 const host=keymapHostPi();wiringExtensions(home)(host.pi as never);
 const shortcut=host.shortcuts.find(row=>row.key==="alt+g");
 assert.ok(shortcut,"default Changes shortcut is registered");
 let selected=0;const messages:string[]=[];
 await shortcut.handler({cwd:home,mode:"tui",hasUI:true,
  sessionManager:{getSessionId:()=>"keymap-changes-test"},
  ui:{notify(message:string){messages.push(message);},select:async(_title:string,choices:string[])=>{selected++;return choices[0];}},
 });
 assert.equal(selected,1,"the key must launch the read-only Git file selector");
 assert.ok(messages.some(message=>message.includes("inspect-me.txt")),JSON.stringify(messages));
 assert.equal(commandKeymapId("asen-changes"),"command:asen-changes","legacy command stays independent");
});

test("UFC-M1-04 env-locked, disabled and saved bindings drive registration without conflicts",t=>{
	isolateKeymapEnv(t);
	const {home,dispose}=fixtureHome();
	t.after(dispose);
	process.env.ASEN_PALETTE_KEY="alt+j";
	process.env.ASEN_USAGE_KEY="";
	writeKeymaps(home,{changes:null});
	const host=keymapHostPi();
	wiringExtensions(home)(host.pi as never);
	const keys=host.shortcuts.map(row=>row.key);
	assert.ok(keys.includes("alt+j"),"the env slot replaces the default key");
	assert.ok(!keys.includes("alt+k"),"the default never registers while the env slot owns the action");
	assert.ok(!keys.includes("alt+u"),"an explicitly disabled action registers nothing");
	assert.ok(!keys.includes("alt+g"),"a saved null binding disables the action");
});

test("UFC-M1-04 a refused registration surfaces visibly and never silently drops",t=>{
	isolateKeymapEnv(t);
	const {home,dispose}=fixtureHome();
	t.after(dispose);
	const host=keymapHostPi("alt+k");
	wiringExtensions(home)(host.pi as never); // startup must not throw on a host refusal
	assert.ok(host.shortcuts.some(row=>row.key==="alt+g"),"other actions keep registering after a refusal");
	host.emitSessionStart();
	assert.ok(host.notices.some(row=>row.includes("alt+k")),`the refusal becomes a visible notice: ${JSON.stringify(host.notices)}`);
});

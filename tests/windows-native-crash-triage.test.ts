import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {join,resolve} from "node:path";

const script=resolve(join("scripts","diagnose-asen-pi-native-windows.ps1"));

test("Windows Pi crash triage is a read-only, bounded, privacy-limited event inspection",()=>{
 const code=readFileSync(script,"utf8");
 assert.match(code,/Get-WinEvent\s+-FilterHashtable/u);
 assert.match(code,/ValidateRange\(1, 300\)/u);
 assert.match(code,/0xC0000409/u);
 for(const forbidden of [/Start-Process\b/u,/Invoke-WebRequest\b/u,/Invoke-RestMethod\b/u,/\bRemove-Item\b/u,/\bSet-Content\b/u,/\bAdd-Content\b/u,/\bWrite-EventLog\b/u,/\bExport-Clixml\b/u])
  assert.doesNotMatch(code,forbidden,"native triage must not mutate or export host data");
 assert.match(code,/moduleFileName/u);
 assert.match(code,/Matching events are clues only/u);
});

test("Windows PowerShell parses the native crash triage without executing it",{
 skip:process.platform!=="win32"
},()=>{
 const file=script.replace(/'/gu,"''");
 const command=`$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count -ne 0){exit 1}`;
 const result=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],
  {encoding:"utf8",timeout:10000,windowsHide:true});
 assert.equal(result.error,undefined,"PowerShell parser process must start");
 assert.equal(result.status,0,"PowerShell must parse the script with no error");
});

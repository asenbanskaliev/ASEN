import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error CI-only matrix planner.
import {planPiSupportMatrix,validateCellObservation,supplementalPiVersions} from "../scripts/pi-support-matrix.mjs";

test("La matriz normal conserva Pi 1.2.0 y prueba la versión de desarrollo 1.6.0",()=>{
 const cells=planPiSupportMatrix();
 assert.equal(cells.length,24);
 assert.deepEqual([...new Set(cells.map((c:{version:string})=>c.version))],["1.2.0","1.6.0"]);
 assert.equal(new Set(cells.map((c:{id:string})=>c.id)).size,24);
 for(const platform of ["linux","win32","darwin"])assert.equal(cells.filter((c:{platform:string})=>c.platform===platform).length,8);
});

test("support matrix derives its floor and development witnesses from the uncapped package contract",()=>{
 const metadata={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.0"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^2.0.0"},
 };
 const cells=planPiSupportMatrix(metadata as any);
 assert.deepEqual([...new Set(cells.map((c:{version:string})=>c.version))],["1.2.0","2.0.0"]);
 assert.equal(cells.length,24);
});

test("support matrix deduplicates a peer floor that matches the development version",()=>{
 const metadata={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.3"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^1.2.3"},
 };
 const cells=planPiSupportMatrix(metadata as any);
 assert.equal(new Set(cells.map((c:{version:string})=>c.version)).size,1);
 assert.equal(cells.length,12);
 for(const platform of ["linux","win32","darwin"])assert.equal(cells.filter((c:{platform:string})=>c.platform===platform).length,4);
});

test("support matrix rejects malformed or below-floor Pi version contracts",()=>{
 const base={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.0"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^1.2.3"},
 };
 assert.throws(()=>planPiSupportMatrix({...base,peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2"}}),/exact minimum/);
 assert.throws(()=>planPiSupportMatrix({...base,devDependencies:{"@earendil-works/pi-coding-agent":"^1.1.0"}}),/at or above the declared peer dependency floor/);
});

test("matrix admission rejects forced exit, model calls and missing host inventory",()=>{
 const cell=planPiSupportMatrix()[0];
 const valid={mode:cell.mode,hasUI:true,commands:["asen"],tools:["asen_ask_choice","ask_user_choice","ask_user_question"],modelCalls:0,shutdownObserved:true,exitCode:0,signal:null,timedOut:false,keyboardCommandObserved:true};
 assert.doesNotThrow(()=>validateCellObservation(cell,valid));
 for(const patch of [{mode:"unknown"},{commands:[]},{tools:[]},{tools:["asen_ask_choice"]},{modelCalls:1},{shutdownObserved:false},{exitCode:1},{signal:"SIGTERM"},{timedOut:true},{keyboardCommandObserved:false}])
  assert.throws(()=>validateCellObservation(cell,{...valid,...patch}));
});

test("Pi 1.5.2 se añade solo bajo petición y no reemplaza la línea base",()=>{
 const metadata={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.0"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^1.2.0"}
 };
 const normal=planPiSupportMatrix(metadata);
 const extended=planPiSupportMatrix(metadata,["1.5.2"]);
 assert.equal(normal.length,12);
 assert.equal(extended.length,24);
 assert.equal(extended.filter((cell:{version:string})=>cell.version==="1.5.2").length,12);
 assert.equal(new Set(extended.map((cell:{id:string})=>cell.id)).size,24);
});
test("La prueba de Pi adicional rechaza versiones ambiguas o inferiores",()=>{
 const metadata={
  peerDependencies:{"@earendil-works/pi-coding-agent":">=1.2.0"},
  devDependencies:{"@earendil-works/pi-coding-agent":"^1.2.0"}
 };
 for(const invalid of [["1.1.0"],["latest"],["1.5.x"],["1.5.2","1.5.3","1.5.4"]])
  assert.throws(()=>planPiSupportMatrix(metadata,invalid),/Supplemental Pi version/u);
});

test("G01 conserva Pi 1.2 y añade 1.5.2 y 1.6.0 en los tres sistemas y cuatro modos",()=>{
 const versions=supplementalPiVersions({ASEN_PI_MATRIX_EXTRA_VERSIONS:"1.5.2,1.6.0"});
 const cells=planPiSupportMatrix(undefined,versions);
 assert.deepEqual([...new Set(cells.map((cell:{version:string})=>cell.version))].sort(),["1.2.0","1.5.2","1.6.0"]);
 assert.equal(cells.length,36);
 assert.equal(new Set(cells.map((cell:{id:string})=>cell.id)).size,36);
 for(const platform of ["linux","win32","darwin"])for(const version of ["1.2.0","1.5.2","1.6.0"])
  assert.deepEqual(cells.filter((cell:{platform:string;version:string})=>cell.platform===platform&&cell.version===version).map((cell:{mode:string})=>cell.mode),["tui","rpc","json","print"]);
 assert.deepEqual(supplementalPiVersions({ASEN_PI_MATRIX_EXTRA_VERSION:"1.5.2"}),["1.5.2"]);
 assert.deepEqual(supplementalPiVersions({}),[]);
});
test("G01 rechaza solicitudes de versiones duplicadas, ambiguas o excesivas",()=>{
 for(const env of [{ASEN_PI_MATRIX_EXTRA_VERSIONS:""},{ASEN_PI_MATRIX_EXTRA_VERSIONS:"1.6.0,"},
  {ASEN_PI_MATRIX_EXTRA_VERSIONS:"1.6.0,1.6.0"},{ASEN_PI_MATRIX_EXTRA_VERSIONS:"1.5.2, 1.6.0"},
  {ASEN_PI_MATRIX_EXTRA_VERSIONS:"1.4.0,1.5.2,1.6.0"},{ASEN_PI_MATRIX_EXTRA_VERSION:"latest"},
  {ASEN_PI_MATRIX_EXTRA_VERSION:"1.5.2",ASEN_PI_MATRIX_EXTRA_VERSIONS:"1.6.0"}])
  assert.throws(()=>supplementalPiVersions(env));
});

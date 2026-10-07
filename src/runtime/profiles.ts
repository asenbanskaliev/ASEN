export const ASEN_PROFILES_SCHEMA="asen.runtime-profiles/v1" as const;
export type Thinking="off"|"minimal"|"low"|"medium"|"high";
export interface RouteChoice{model?:string;thinking?:Thinking}
export interface RuntimeProfile{name:string;routes:Record<string,RouteChoice>}
export interface RuntimeProfilesFile{schema:typeof ASEN_PROFILES_SCHEMA;active?:string;profiles:RuntimeProfile[]}
export type ProfileLayer={global?:RuntimeProfilesFile;project?:RuntimeProfilesFile;session?:RuntimeProfilesFile};
const NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const THINKING=new Set(["off","minimal","low","medium","high"]);
function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==="object"&&!Array.isArray(v);}
function validRoute(v:unknown):v is RouteChoice{return record(v)&&Object.keys(v).every(k=>k==="model"||k==="thinking")&&(v.model===undefined||(typeof v.model==="string"&&v.model.length>0&&v.model.length<=256&&v.model===v.model.trim()&&!/[\u0000-\u001f\u007f]/u.test(v.model)))&&(v.thinking===undefined||(typeof v.thinking==="string"&&THINKING.has(v.thinking)));}
export function parseRuntimeProfiles(raw:string):RuntimeProfilesFile|undefined{
 let v:unknown;try{v=JSON.parse(raw);}catch{return undefined;}if(!record(v)||v.schema!==ASEN_PROFILES_SCHEMA||!Array.isArray(v.profiles)||v.profiles.length>64)return undefined;
 const names=new Set<string>(),profiles:RuntimeProfile[]=[];for(const p of v.profiles){if(!record(p)||typeof p.name!=="string"||!NAME.test(p.name)||names.has(p.name)||!record(p.routes))return undefined;const routes:Record<string,RouteChoice>={};for(const [role,route] of Object.entries(p.routes)){if(!NAME.test(role)||!validRoute(route))return undefined;routes[role]={...route};}names.add(p.name);profiles.push({name:p.name,routes});}
 const active=v.active;if(active!==undefined&&(typeof active!=="string"||!names.has(active)))return undefined;return {schema:ASEN_PROFILES_SCHEMA,...(typeof active==="string"?{active}:{}),profiles};
}
function selected(file:RuntimeProfilesFile|undefined):RuntimeProfile|undefined{return file?.active?file.profiles.find(p=>p.name===file.active):undefined;}
export function resolveRuntimeRoute(layers:ProfileLayer,role:string):{choice?:RouteChoice;source:"session"|"project"|"global"|"default"}{
 for(const [source,file] of [["session",layers.session],["project",layers.project],["global",layers.global]] as const){const route=selected(file)?.routes[role];if(route)return {choice:{...route},source};}return {source:"default"};
}
export function setActiveProfile(file:RuntimeProfilesFile,name:string):RuntimeProfilesFile{if(!file.profiles.some(p=>p.name===name))throw new Error("Profile does not exist");return {...file,active:name};}
export function upsertProfile(file:RuntimeProfilesFile,profile:RuntimeProfile):RuntimeProfilesFile{if(!NAME.test(profile.name)||Object.entries(profile.routes).some(([r,v])=>!NAME.test(r)||!validRoute(v)))throw new Error("Invalid profile");const i=file.profiles.findIndex(p=>p.name===profile.name),profiles=file.profiles.map(p=>({name:p.name,routes:structuredClone(p.routes)}));if(i<0){if(profiles.length>=64)throw new Error("Too many profiles");profiles.push(structuredClone(profile));}else profiles[i]=structuredClone(profile);return {...file,profiles};}

export function serializeRuntimeProfiles(file:RuntimeProfilesFile):string{const checked=parseRuntimeProfiles(JSON.stringify(file));if(!checked)throw new Error("Invalid profiles file");return JSON.stringify(checked,null,2)+"\n";}
export function removeProfile(file:RuntimeProfilesFile,name:string):RuntimeProfilesFile{if(file.active===name)throw new Error("Cannot remove active profile");if(!file.profiles.some(p=>p.name===name))throw new Error("Profile does not exist");return {...file,profiles:file.profiles.filter(p=>p.name!==name).map(p=>structuredClone(p))};}
export function renameProfile(file:RuntimeProfilesFile,from:string,to:string):RuntimeProfilesFile{if(!NAME.test(to))throw new Error("Invalid profile");if(file.profiles.some(p=>p.name===to))throw new Error("Profile already exists");const current=file.profiles.find(p=>p.name===from);if(!current)throw new Error("Profile does not exist");return {...file,...(file.active===from?{active:to}:file.active!==undefined?{active:file.active}:{}),profiles:file.profiles.map(p=>p.name===from?{...structuredClone(p),name:to}:structuredClone(p))};}

export type CheckState="pass"|"warn"|"fail";
export interface DoctorCheck{name:string;state:CheckState;detail:string}
/**
 * Freshness of the built artifact. A stale `dist/` makes every piece of host
 * evidence invalid (S-09), so the doctor must say so instead of letting the
 * caller trust an outdated binary.
 */
export interface DistFreshness{readonly newestDistMtime:number|undefined;readonly newestSrcMtime:number|undefined}
export function doctorChecks(input:{piVersionOk:boolean;homeWritable:boolean;registryAvailable:boolean;profileValid:boolean;historyPrivate:boolean;telemetryConsentValid:boolean;dist?:DistFreshness}):DoctorCheck[]{
 const checks:DoctorCheck[]=[
  {name:"pi-version",state:input.piVersionOk?"pass":"fail",detail:input.piVersionOk?"supported":"unsupported"},
  {name:"home",state:input.homeWritable?"pass":"fail",detail:input.homeWritable?"writable":"not writable"},
  {name:"skill-registry",state:input.registryAvailable?"pass":"warn",detail:input.registryAvailable?"available":"unavailable"},
  {name:"profiles",state:input.profileValid?"pass":"fail",detail:input.profileValid?"valid":"invalid"},
  {name:"history-privacy",state:input.historyPrivate?"pass":"fail",detail:input.historyPrivate?"private":"privacy check failed"},
  {name:"telemetry-consent",state:input.telemetryConsentValid?"pass":"fail",detail:input.telemetryConsentValid?"valid":"invalid"}
 ];
 if(input.dist!==undefined){
  const {newestDistMtime,newestSrcMtime}=input.dist;
  if(newestDistMtime===undefined){
   checks.push({name:"dist-freshness",state:"warn",detail:"dist/ missing; run `npm run build` before any host evidence"});
  }else if(newestSrcMtime!==undefined&&newestDistMtime<newestSrcMtime){
   checks.push({name:"dist-freshness",state:"warn",detail:`dist/ is older than src/ by ${Math.round(newestSrcMtime-newestDistMtime)}ms; rebuild before host evidence`});
  }else{
   checks.push({name:"dist-freshness",state:"pass",detail:"dist/ is newer than src/"});
  }
 }
 return checks;
}
export function doctorExitCode(checks:readonly DoctorCheck[]):0|1{return checks.some(c=>c.state==="fail")?1:0;}

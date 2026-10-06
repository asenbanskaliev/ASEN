export type CheckState="pass"|"warn"|"fail";
export interface DoctorCheck{name:string;state:CheckState;detail:string}
export function doctorChecks(input:{piVersionOk:boolean;homeWritable:boolean;registryAvailable:boolean;profileValid:boolean;historyPrivate:boolean;telemetryConsentValid:boolean}):DoctorCheck[]{return [
 {name:"pi-version",state:input.piVersionOk?"pass":"fail",detail:input.piVersionOk?"supported":"unsupported"},
 {name:"home",state:input.homeWritable?"pass":"fail",detail:input.homeWritable?"writable":"not writable"},
 {name:"skill-registry",state:input.registryAvailable?"pass":"warn",detail:input.registryAvailable?"available":"unavailable"},
 {name:"profiles",state:input.profileValid?"pass":"fail",detail:input.profileValid?"valid":"invalid"},
 {name:"history-privacy",state:input.historyPrivate?"pass":"fail",detail:input.historyPrivate?"private":"privacy check failed"},
 {name:"telemetry-consent",state:input.telemetryConsentValid?"pass":"fail",detail:input.telemetryConsentValid?"valid":"invalid"}
 ];}
export function doctorExitCode(checks:readonly DoctorCheck[]):0|1{return checks.some(c=>c.state==="fail")?1:0;}

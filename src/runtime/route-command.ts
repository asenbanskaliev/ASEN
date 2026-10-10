import path from "node:path";
import {deriveOddFacts,planOddRoute,type OddRoutingRequest} from "../flow/odd-routing.js";

const INPUT_KEYS=["taskIdentity","intent","scope","writes","riskOperations","session","testing","review","unresolvedDecisions"] as const;
const MAX_INPUT=16_384;
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

/** User-authored, read-only ODD route preview bound to the active project by the Pi adapter. */
export function routePreviewCommand(args:string,repositoryIdentity:string):string{
 if(typeof args!=="string"||!args.trim()||args.length>MAX_INPUT)throw new Error("Usage: /asen-route <JSON ODD facts>; input must be 1–16384 characters");
 if(typeof repositoryIdentity!=="string"||!path.isAbsolute(repositoryIdentity))throw new Error("ASEN route preview requires a canonical active project path");
 let value:unknown;try{value=JSON.parse(args);}catch{throw new Error("ASEN route preview expects valid JSON ODD facts");}
 if(!exact(value,INPUT_KEYS))throw new Error(`ASEN route facts must contain exactly: ${INPUT_KEYS.join(", ")}`);
 const facts=deriveOddFacts({...value,repositoryIdentity} as unknown as OddRoutingRequest),decision=planOddRoute(facts);
 return [`route: ${decision.route}`,`risk: ${decision.risk}`,`verification: ${decision.verification}`,`reasons: ${decision.reasons.join(", ")}`,`isolated child required: ${decision.requiresIsolatedChild}`,"Preview only: no agent was dispatched and no write permission was granted."].join("\n");
}

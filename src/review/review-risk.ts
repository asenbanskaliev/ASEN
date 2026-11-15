export type ReviewLens="risk"|"resilience"|"readability"|"reliability";
export interface ReviewRiskInput{readonly riskId:string;readonly reason:string;readonly severity:"low"|"high";readonly lenses:readonly ReviewLens[];}
export interface ReviewPlan{readonly riskId:string;readonly reason:string;readonly severity:"low"|"high";readonly lenses:readonly ReviewLens[];readonly independentVerifier:boolean;readonly status:"planned";}
const lenses=new Set<ReviewLens>(["risk","resilience","readability","reliability"]);
function clean(value:unknown,label:string):string{
 if(typeof value!=="string"||!value||value!==value.trim()||value!==value.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(value))throw new Error(`${label} is invalid`);
 return value;
}
/** Builds a proportional review plan; it never creates authority or runs a reviewer. */
export function planReviewRisk(input:ReviewRiskInput):ReviewPlan{
 if(typeof input!=="object"||input===null||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)throw new Error("Review risk must be plain data");
 const riskId=clean(input.riskId,"risk id"),reason=clean(input.reason,"risk reason");
 if(input.severity!=="low"&&input.severity!=="high")throw new Error("Review risk severity is invalid");
 if(!Array.isArray(input.lenses)||input.lenses.length===0||new Set(input.lenses).size!==input.lenses.length||input.lenses.some(lens=>!lenses.has(lens)))throw new Error("Review lenses are invalid");
 const selected=Object.freeze([...input.lenses]);
 return Object.freeze({riskId,reason,severity:input.severity,lenses:selected,independentVerifier:input.severity==="high",status:"planned" as const});
}

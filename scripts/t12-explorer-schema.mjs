/** Pure, provider-free T12 Explorer schema check. Never return raw agent content. */
const required=Object.freeze({
 currentState:"string",affectedAreas:"array",approaches:"array",evidence:"array",
 risks:"array",unknowns:"array",readiness:"string",findings:"array",
});
export function inspectExplorerSchema(value){
 const observedShape=Object.fromEntries(Object.keys(required).map(key=>[
  key,Array.isArray(value?.[key])?"array":typeof value?.[key],
 ]));
 return Object.freeze({
  passed:Object.entries(required).every(([key,type])=>observedShape[key]===type),
  observedShape:Object.freeze(observedShape),
 });
}

export function assertReadmeOnlyWriterPlan(plan) {
 const roles=Array.isArray(plan?.roles)?plan.roles:[];
 const workers=roles.filter(row=>row?.role==="worker");
 if(roles.some(row=>!Array.isArray(row?.paths)||row.paths.some(item=>item!=="README.md"))) {
  throw new Error("E1 writer plan contains a write surface outside README.md");
 }
 if(workers.length!==1||workers[0].paths.length!==1||workers[0].paths[0]!=="README.md") {
  throw new Error("E1 requires exactly one Writer assigned only README.md");
 }
 return true;
}

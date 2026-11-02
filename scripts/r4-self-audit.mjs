import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

/** R4 SELF_AUDIT_ONLY is not an independent reviewer, certification, or reference-parity attestation. */
export function evaluateR4SelfSnapshot(snapshot){
 const checks=[];
 const check=(id,passed,reason)=>checks.push(Object.freeze({id,passed:Boolean(passed),reason}));
 const shaOk=value=>typeof value==="string"&&/^[0-9a-f]{40}$/u.test(value);
 check("exact_sha",shaOk(snapshot.expectedSha)&&snapshot.expectedSha===snapshot.headSha,"Git HEAD equals the immutable PR head");
 check("ecosystem_claims",Array.isArray(snapshot.claims?.rows)&&snapshot.claims.rows.length===16&&snapshot.claims.rows.every(x=>x.status==="PARTIAL"),"Global ECO claims remain evidence-bounded PARTIAL");
 check("t09_scope",/^- \[ \] T09 \|[^\r\n]*PARTIAL aggregate/mu.test(snapshot.capability),"T09 cannot self-promote to aggregate FULL");
 check("t09_activation_uncertainty",snapshot.managedUninstall?.includes('if(selected.state==="uncertain")return report({operation:"upgrade",status:"ambiguous"')&&snapshot.managedUninstall?.includes('if(selected.state==="not-started"){await clearJournal(prefix);')&&snapshot.managedUninstall?.includes('error instanceof ManagedVersionSelectionError&&active===to&&error.report.publication==="committed"')&&snapshot.managedUninstall?.includes('state:"uncertain",reason:text(error),observedActive:active??null'),"Unproven selector activation keeps the journal and a competitor readback cannot certify ownership");
 check("t09_uninstall_journal_preflight",snapshot.managedUninstall?.includes('if(!records)return fail("FOREIGN_ROOT","Managed ownership records changed before uninstall; nothing further was removed");\n  // Check the journal under the maintenance lock before removing any owned file.\n  await readJournal(prefix);\n  for(const version of records.versions){'),"Malformed recovery evidence must be verified before owned-file removal begins");
 check("t09_journal_origin",snapshot.managedUninstall?.includes('if(journal&&current!==journal.from&&current!==journal.to)return fail("RECOVERY_REQUIRED"')&&snapshot.managedUninstall?.includes("new Date(value.startedAt).toISOString()!==value.startedAt")&&snapshot.managedUninstall?.includes("value.from===value.to"),"T09 stale or malformed recovery journals must not select an unrelated current version");
 check("t09_recovery_journal",snapshot.managedUninstall?.includes('if(!restored.ok)return report({operation:"upgrade",status:"ambiguous"')&&snapshot.managedUninstall?.includes('if(journal&&target!==journal.from)return fail("RECOVERY_REQUIRED"')&&snapshot.managedUninstall?.includes("if(health.ok&&journal)await clearJournal(prefix);")&&snapshot.managedUninstall?.includes('if(!health.ok)return report({operation:"rollback",status:"ambiguous"'),"T09 must retain the interrupted-upgrade recovery journal until the CLI probe passes");
 check("t09_stage_identity",typeof snapshot.managedUninstall==="string"&&snapshot.managedUninstall.includes("beforeQuarantineMove")&&snapshot.managedUninstall.includes("quarantine.verified()")&&snapshot.managedUninstall.includes("sameUninstallIdentity(stageIdentity,stage)"),"T09 owned removal stage must be identity-bound before and after an atomic move");
 check("t04_retry_claim_scope",snapshot.backgroundJournal?.includes('...(previous.args?{args:Object.freeze([...previous.args])}:{})')&&snapshot.backgroundJournal?.includes('...(previous.cwd?{cwd:previous.cwd}:{})'),"Authorized retry claim must retain immutable original argument and working-directory identity");
 check("t10_record_finality",snapshot.backgroundJournal?.includes('previous.state==="interrupted"&&previous.authorizationId')&&snapshot.backgroundJournal?.includes('snapshot.state!=="running"')&&snapshot.backgroundJournal?.includes('previous.state!=="running"')&&snapshot.backgroundJournal?.includes('previous.deliveryState!==snapshot.deliveryState')&&snapshot.backgroundJournal?.includes('Background journal record conflict'),"Journal record must reject stale terminal rows, duplicate retry dispatch and erased delivery receipts");
 check("t10_live_delivery_cas",snapshot.backgroundJobs?.includes("this.journal?.updateDeliveryState(id,job.options.sessionId,job.options.projectId,state,error,expected)")&&snapshot.backgroundJobs?.includes("throw error;")&&snapshot.backgroundJournal?.includes("current.deliveryState!==expected.deliveryState")&&snapshot.backgroundJournal?.includes("Background job delivery conflict"),"Live delivery must use journal-scoped CAS and never claim durable success after a conflicted write");
 check("t10_durable_interruption_deny",snapshot.backgroundJobs?.includes('job.state==="interrupted"||job.sessionId!==sessionId')&&snapshot.backgroundJobs?.includes('if(job.state==="interrupted")throw new Error("Cannot deliver an interrupted job result")')&&snapshot.backgroundJournal?.includes('if(current.state==="interrupted")throw new Error("Cannot deliver an interrupted job result")'),"All pending-notice and delivery-state entrypoints refuse unconfirmed interruptions");
 check("t10_uncertain_restart",snapshot.extension.includes('const unresolved=jobs.filter(job=>job.state==="interrupted"&&job.deliveryState!=="enqueued")')&&snapshot.extension.includes('if(job.state!=="interrupted"&&pendingIds.has('),"A virtual interrupted restart cannot be re-enqueued without a durable fenced owner");
 check("t10_lock_progress",snapshot.backgroundJournal?.includes("absoluteDeadline=startedAt+15_000")&&snapshot.backgroundJournal?.includes("inactiveDeadline=Math.min(absoluteDeadline,Date.now()+3_000)")&&snapshot.backgroundJournal?.includes("Date.now()>=absoluteDeadline||Date.now()>=inactiveDeadline"),"Journal contention observes real progress, but total lock wait stays bounded and unowned locks stay untouched");
 check("t10_persist_before_delivery",snapshot.backgroundJobs?.includes('if(job.state==="running"||job.state==="queued"||job.persistenceError)return null;')&&snapshot.extension.includes('if(result.persistenceError)')&&snapshot.extension.includes('if(result.deliveryState==="enqueued")return;')&&snapshot.extension.includes('backgroundJobs.setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"pending");')&&snapshot.extension.includes('let transportAttempted=false;')&&snapshot.extension.includes('if(transportAttempted)try{backgroundJobs.setDeliveryStateScoped('),"A terminal result must be durable before any Pi enqueue, and a failed preflight must never fabricate delivery");
 check("t10_journal",snapshot.extension.includes("pendingBackgroundJobNotifications(")&&snapshot.extension.includes('setDeliveryStateScoped(result.id,result.sessionId,result.projectId,"enqueued")'),"Durable background journal still owns delivery state");
 check("t10_no_false_ack",snapshot.extension.includes("deliveryConfirmed:false")&&!snapshot.extension.includes("deliveryConfirmed:true"),"Pi enqueue is not a confirmed presentation");
 check("t10_projection_only",snapshot.projection.includes("class PiNotificationProjection")&&snapshot.projection.includes("SessionNotificationBus")&&!snapshot.projection.includes("pi.sendMessage")&&!snapshot.projection.includes("acknowledge(")&&snapshot.extension.includes("notificationProjection.publish("),"Ephemeral widget is not the Pi transport");
 check("t10_ephemeral_scope_clear",snapshot.projection.includes("this.#bus.clear(partition(previous))")&&snapshot.projection.includes("this.#bus.clear(partition(current))"),"Session change and shutdown must clear in-memory notice identities");
 check("t10_host_boundary",snapshot.extension.includes("const notificationProjection=new PiNotificationProjection()")&&snapshot.extension.includes("notificationProjection.deactivate(agentDeliveryIdentity)"),"Session scope is explicit and cleared at shutdown");
 check("no_provider_credits",!/(?:OPENAI_API_KEY|NVIDIA_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|secrets\.)/iu.test(snapshot.workflow),"Self-audit must not use a live provider or secrets");
 check("review_disclosure",snapshot.f5.includes("SELF_AUDIT_ONLY")&&snapshot.f5.includes("NOT independent"),"Owner waiver cannot be presented as independent review");
 const passed=checks.every(x=>x.passed);
 return Object.freeze({schema:"asen-r4-self-audit-v1",mode:"SELF_AUDIT_ONLY",independentReviewPerformed:false,sha:snapshot.headSha,status:passed?"PASS":"FAIL",checks,unresolved:["no independent reviewer","real OS browser launch","inherited Pi host dependency advisory","hostile same-user uninstall proof","global Reference Shell parity"]});
}

function snapshotFromRepository(){
 const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
 const read=path=>readFileSync(resolve(root,path),"utf8");
 const headSha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",timeout:5000}).trim();
 return {expectedSha:process.env.ASEN_EXPECTED_SHA??"",headSha,claims:JSON.parse(read("registry/parity/ecosystem-claims-v1.json")),capability:read("odd/tasks/pi-capability-completion.md"),extension:read("extensions/asen.ts"),backgroundJobs:read("src/runtime/background-jobs.ts"),backgroundJournal:read("src/runtime/background-job-journal.ts"),projection:read("src/runtime/notification-projection.ts"),managedUninstall:read("src/runtime/managed-lifecycle.ts"),workflow:read(".github/workflows/r4-self-audit.yml"),f5:read("odd/tasks/hardening-exact-sha-r4.md")};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=evaluateR4SelfSnapshot(snapshotFromRepository());
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(report.status!=="PASS")process.exitCode=1;
 }catch(error){
  process.stderr.write("R4_SELF_AUDIT_BLOCKED: "+(error instanceof Error?error.message:"unknown error")+"\n");
  process.exitCode=1;
 }
}

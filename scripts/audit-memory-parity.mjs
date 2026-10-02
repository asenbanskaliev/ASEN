import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST="registry/parity/memory-upstream-v3.json";
const FOUNDATION_MANIFEST="registry/parity/memory-foundation-contracts-v1.json";
const OBSERVATION_WRITE_MANIFEST="registry/parity/memory-observation-write-contracts-v1.json";
const RETRIEVAL_SEARCH_MANIFEST="registry/parity/memory-retrieval-search-contracts-v1.json";
const CONTEXT_TIMELINE_MANIFEST="registry/parity/memory-context-timeline-contracts-v1.json";
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._/-]+$/;
const TOP_FIELDS=["schemaVersion","scope","statusModel","limitations","targets","sources","families"];
const TARGET_FIELDS=["id","repository","version","tag","tagObject","commit","publishedAt","channel","apiRefUrl","tagUrl"];
const SOURCE_FIELDS=["id","targetId","path","bytes","sha256","rawUrl"];
const FAMILY_FIELDS=["id","title","status","facts","limitations"];
const FOUNDATION_TOP_FIELDS=["schemaVersion","scope","status","proofKind","limitations","sources","cases"];
const FOUNDATION_SOURCE_FIELDS=["id","path","bytes","sha256","commit","commitRole","lineStart","lineEnd"];
const FOUNDATION_CASE_FIELDS=["id","summary","evidence","input","trigger","ordering","output","durableState","sideEffects","negativeControls","versionControl","criticalValues"];
const FOUNDATION_EVIDENCE_FIELDS=["sourceId","startLine","endLine"];
const OBSERVATION_TOP_FIELDS=["schemaVersion","scope","status","proofKind","limitations","sources","cases"];
const OBSERVATION_SOURCE_FIELDS=["id","path","bytes","sha256","commit","commitRole","lineStart","lineEnd"];
const OBSERVATION_CASE_FIELDS=["id","summary","evidence","inputs","triggers","preconditions","outputs","durableEffects","negativeControls","privacy","assertion","transport","versionControl","criticalValues"];
const OBSERVATION_NARRATIVE_FIELDS=["summary","inputs","triggers","preconditions","outputs","durableEffects","negativeControls","privacy","assertion","transport"];
const RETRIEVAL_TOP_FIELDS=["schemaVersion","scope","status","proofKind","limitations","sources","cases"];
const RETRIEVAL_SOURCE_FIELDS=["id","path","bytes","sha256","commit","sourceIdentity","representation","lineStart","lineEnd"];
const RETRIEVAL_CASE_FIELDS=["id","summary","evidence","contract","negativeControls","versionControl","criticalValues"];
const CONTEXT_TOP_FIELDS=["schemaVersion","scope","status","proofKind","limitations","sources","cases"];
const CONTEXT_SOURCE_FIELDS=["id","path","bytes","sha256","commit","sourceIdentity","representation","lineStart","lineEnd"];
const CONTEXT_CASE_FIELDS=["id","summary","evidence","contract","negativeControls","versionControl","criticalValues"];
const CORE_COMMIT="15a2f78885d7ad8ced23b2d1d88383e9bb472c17";
const FOUNDATION_SOURCE_ANCHORS={
 "internal/store/store.go":[501321,"2ffd000ee7f8c8fc1ad0c3d130e88a8ab4878449866c9737215b3c6d8ffa555b",997,9363],
 "internal/store/startup_gate_test.go":[24904,"d89e2f55fe5f33513902887ff8a150130f192773218b363383daf03f02205030",119,450],
 "internal/store/filesystem_policy.go":[2330,"7bf87a28de234d8c5319d9d5b75a40f58ecd6d5f51ed32a677a2234092e3a3e0",26,67],
 "internal/store/generation_fence.go":[12735,"39ca5c48d3843086867f64049894df2f218d165c1d28bdacd7ad4a31980a1865",16,110],
 "internal/store/migration_lock.go":[2500,"5259721e35d46953bb325ae482eb7dceed7f09324ad19e3de9ac7992245e7b4c",10,69]
};
const FOUNDATION_CRITICAL_ANCHORS={
 "FND-01":{absolutePathAccepted:true,relativePathRejected:true,rejectionBeforeMutation:true},
 "FND-02":{classification:"known_remote",rejected:true,mutationBarrier:["data_directory","database_triplet","instance_metadata","migration_lock"]},
 "FND-03":{unknown:"ALLOWED",inspectionFailure:"ALLOWED",unclassifiable:"ALLOWED",provedLocal:false,missingPathProbe:"closest_existing_ancestor"},
 "FND-04":{maxOpenConnections:1,transactionLock:"immediate",busyTimeoutMs:5000,journalMode:"WAL",synchronous:"NORMAL",foreignKeys:1,persistentWalMode:1,lockRetryBackoffMs:[10,25,50,100,200]},
 "FND-05":{schemaVersion:1,freshOrOlder:["migrate","repair","stamp_1"],currentVersion1:["migrate","repair","no_stamp"]},
 "FND-06":{futureVersionCondition:">1",skipStartup:["migration","repair","stamp"],compatibleCrudPermitted:["GET","Add","Update","Delete"],preVersionPreparationPermitted:true,readOnly:false},
 "FND-07":{processSerialization:true,versionRaceRecheck:true,replacementFence:true,lockFilePersists:true,startupWritesFenced:true},
 "FND-08":{failedPostOpenClosesHandle:true,normalCloseClosesHandle:true,persistentWalPreserved:true,priorFilesystemStateRolledBack:false}
};
const FOUNDATION_ORDER_ANCHOR=["generation_check","version_read","future_gate","migration_lock","generation_recheck","version_reread","migrate_repair","stamp_if_older"];
const OBSERVATION_LIMITATIONS=Object.freeze([
 "These contracts record source inspection only; they do not prove ASEN runtime behavior or write parity.",
 "Private-tag replacement is not a general secret detector.",
 "expected_project is a caller ownership assertion, not authentication or tenant isolation.",
 "Unknown write outcomes require readback and reconciliation; they must not be retried automatically.",
 "Library UpdateObservation and DeleteObservation variants remain callable without expected_project.",
 "Queue-helper invocation does not prove a durable queue row because local unenrolled projects skip insertion.",
 "MCP forwards capture_prompt; the separately released Pi surface exposes but does not forward that option, and this core snapshot is not published-Pi proof."
]);
const OBSERVATION_SOURCE_ANCHORS=Object.freeze({
 "internal/store/store.go":[501321,"2ffd000ee7f8c8fc1ad0c3d130e88a8ab4878449866c9737215b3c6d8ffa555b",3685,12492],
 "internal/mcp/mcp.go":[147307,"613a6c74621cdae0c6b8af1fb79c5c121ba51ca4a9665621f9312c683199872d",500,1877],
 "internal/server/server.go":[73752,"53caec2f14679d5c9a2558c06ce6183e740bb1b78b4cebc33219b60271a53c20",146,929]
});
const OBSERVATION_EVIDENCE_ANCHORS=Object.freeze({
 "OBS-01":[["SRC-OBS-001",3685,3722],["SRC-OBS-001",3809,3860],["SRC-OBS-001",4335,4357],["SRC-OBS-001",12256,12275],["SRC-OBS-001",12483,12492],["SRC-OBS-002",500,550],["SRC-OBS-002",1447,1600],["SRC-OBS-003",630,673]],
 "OBS-02":[["SRC-OBS-001",3719,3772],["SRC-OBS-001",12409,12424]],
 "OBS-03":[["SRC-OBS-001",3774,3807]],
 "OBS-04":[["SRC-OBS-001",4666,4809],["SRC-OBS-001",4828,4853],["SRC-OBS-002",554,595],["SRC-OBS-002",1661,1745],["SRC-OBS-003",783,830]],
 "OBS-05":[["SRC-OBS-001",4858,4951],["SRC-OBS-001",10636,10713],["SRC-OBS-002",641,660],["SRC-OBS-002",1855,1877],["SRC-OBS-003",146,180],["SRC-OBS-003",431,439],["SRC-OBS-003",897,929]]
});
const RETRIEVAL_LIMITATIONS=Object.freeze([
 "These contracts record source inspection only; they do not prove ASEN runtime behavior or retrieval parity.",
 "Whitespace and quote-only SQLite outcomes are unproved even though the generated empty expressions are source-inspected.",
 "The configured search cap is not universally 20, and no runtime override or default-window behavior is proved here.",
 "ID retrieval and all-project search are not authentication, authorization, tenant isolation, or implicit project isolation.",
 "Read-side persistence is unproved; inspected SQL reads and in-memory activity or nudges do not establish zero persistent writes.",
 "Retrieval does not redact legacy or imported data merely because normal writers replace private tags.",
 "Live envelopes, actual SQLite matching, configuration overrides, privacy, and provenance remain pending runtime obligations."
]);
const RETRIEVAL_SOURCE_ANCHORS=Object.freeze({
 "internal/store/store.go":[488121,"6c52f5e8f71e8d00e1ff5c5f10361142b89b500786b181c825e1d69ad31ee15e",375,12509],
 "internal/mcp/mcp.go":[143683,"72dc51bdf5c5ca93540cb678ad22cd314c439154f36315adba78db66080874bb",1207,2314],
 "internal/server/server.go":[71547,"b6bca0acfbdc11704637c6b0eb26032f0f66f377dd95be44e365c36a82c2123d",728,781],
 "internal/store/relations.go":[59527,"a4c34d7766c4a392164368aec39eea2f60b6436f6e94e1394559e6a2c7f2601e",1106,1113],
 "internal/store/relations_scan_batch.go":[9798,"05f8695dd6602b7e697afd69a65d8681e8bd51e1f6c9f1cb3e53ea4e1460710b",26,54]
});
const RETRIEVAL_EVIDENCE_ANCHORS=Object.freeze({
 "RET-01":[["SRC-RET-001",4654,4664],["SRC-RET-001",5080,5227],["SRC-RET-002",1207,1461],["SRC-RET-002",2266,2314],["SRC-RET-003",728,781]],
 "RET-02":[["SRC-RET-001",5085,5091],["SRC-RET-001",5237,5241],["SRC-RET-001",12495,12509],["SRC-RET-004",1106,1113],["SRC-RET-005",26,54],["SRC-RET-002",1218,1224],["SRC-RET-003",742,746]],
 "RET-03":[["SRC-RET-001",2839,2885],["SRC-RET-001",5433,5507]],
 "RET-04":[["SRC-RET-001",792,823],["SRC-RET-001",5096,5102],["SRC-RET-001",5104,5227],["SRC-RET-001",5386,5431],["SRC-RET-002",1207,1461]],
 "RET-05":[["SRC-RET-001",5080,5354],["SRC-RET-002",1207,1461],["SRC-RET-002",2266,2314]],
 "RET-06":[["SRC-RET-001",4654,4664],["SRC-RET-001",5104,5354],["SRC-RET-002",1252,1461],["SRC-RET-004",1106,1113],["SRC-RET-005",26,54]]
});
const CONTEXT_LIMITATIONS=Object.freeze([
 "These contracts record source inspection only; they do not prove ASEN runtime behavior or context/timeline parity.",
 "The configured observation default is not a universal cap, and configuration overrides are not exercised.",
 "Core MaxBytes budgets only the rendered context body; HTTP JSON and MCP result envelopes have distinct boundaries.",
 "MCP argument branches are source-inspected Go behavior; this does not claim that JSON transports accept NaN.",
 "Timeline project checks are resolved-project equality gates, not authentication, tenant isolation, or global ID authorization.",
 "Read-side persistence outside the inspected ranges, live HTTP/MCP envelopes, and actual database ordering remain unproved."
]);
const CONTEXT_SOURCE_ANCHORS=Object.freeze({
 "internal/store/store.go":[488121,"6c52f5e8f71e8d00e1ff5c5f10361142b89b500786b181c825e1d69ad31ee15e",792,12254],
 "internal/mcp/mcp.go":[143683,"72dc51bdf5c5ca93540cb678ad22cd314c439154f36315adba78db66080874bb",1950,3624],
 "internal/server/server.go":[71547,"b6bca0acfbdc11704637c6b0eb26032f0f66f377dd95be44e365c36a82c2123d",928,2191]
});
const CONTEXT_EVIDENCE_ANCHORS=Object.freeze({
 "CTX-core-options":[["SRC-CTX-001",792,824],["SRC-CTX-001",5647,5775],["SRC-CTX-001",5866,5879],["SRC-CTX-001",12248,12254]],
 "CTX-core-byte-helper":[["SRC-CTX-001",5777,5802]],
 "CTX-HTTP-context":[["SRC-CTX-003",1251,1338],["SRC-CTX-003",2183,2191]],
 "CTX-MCP-complete-result":[["SRC-CTX-002",1950,2114]],
 "CTX-timeline":[["SRC-CTX-001",4970,5067],["SRC-CTX-003",928,967],["SRC-CTX-002",2195,2263],["SRC-CTX-002",3618,3624]]
});
const CONTEXT_CRITICAL_ANCHORS=Object.freeze({
 "CTX-core-options":{
  sectionCaps:{zero:{sessions:5,prompts:10,observations:"configured_MaxContextResults",defaultConfigMaxContextResults:20,pinned:"unlimited"},positive:"cap",negative:"omit"},
  previews:{unit:"Unicode_runes",sessionSummaryRunes:200,promptRunes:200,pinnedBodyRunes:300,observationBodyRunes:300,truncatedSuffix:"...",renderedHardCeiling:false},
  compact:{omits:["pinned_body","observation_body"],preserves:["sessions","prompts"]},maxBytes:{nonpositive:"unbounded",budgetScope:"rendered_core_context_body"}
 },
 "CTX-core-byte-helper":{nonpositive:"unbounded",utf8SafePrefix:true,marker:"\n[truncated]\n",markerBudget:"reserved_then_appended_when_marker_fits",tinyPositive:"valid_prefix_only",budgetScope:"rendered_core_context_body"},
 "CTX-HTTP-context":{sectionStates:{positive:"cap",zero:"default",negative:"omit"},sectionCeiling:500,maxBytes:{absent:0,empty:0,malformed:0,nonpositive:0,positiveCeiling:65536},byteBudgetScope:"core_body_before_json_envelope",response:"structured_context_string"},
 "CTX-MCP-complete-result":{
  defaultBytes:16384,ceilingBytes:65536,invalidBudget:{absent:"default",mistyped:"default",nonpositive:"default",NaN:"default",fractional:"default"},statsProjectCap:8,pinnedCap:20,contextBudgetFloor:1,
  order:["load_stats","cap_displayed_projects_8","append_nudge","reserve_suffix_bytes","floor_context_budget_1","render_core_pinned_20","concatenate","final_complete_result_utf8_clamp"],marker:"\n[truncated]\n",tinyPositive:"valid_prefix_only",noContentMessageFinalClamp:true,budgetScope:"complete_MCP_text_result"
 },
 "CTX-timeline":{
  defaults:{beforeNonpositive:5,afterNonpositive:5},storeProjectGuard:false,focus:"full_undeleted_observation",neighbors:{session:"same_as_focus",deleted:"excluded",before:"id_less_than_focus_desc_then_reversed",after:"id_greater_than_focus_ascending"},
  resultOrder:["before_oldest_first","focus","after_oldest_first"],transportGate:{sequence:["resolve_project","global_id_focus_fetch","resolved_project_equality","Timeline"],httpAllowsEmptyResolvedProject:true,mcpRequiresEquality:true},globalIdAuthorization:false,httpOutput:"structured_full_timeline",
  mcpPreview:{unit:"Unicode_runes",sessionSummaryRunes:100,neighborRunes:150,focusRunes:500,truncatedSuffix:"..."},readSidePersistence:"UNPROVED"
 }
});
const RETRIEVAL_CRITICAL_ANCHORS=Object.freeze({
 "RET-01":{
  getFilter:"id_and_undeleted_only",getProjectGuard:false,
  mcpProjectResolution:"after_retrieval_for_envelope",searchProject:"normalized_filter",
  allProjects:"bypass_resolution_and_filter",personalWithoutExplicitProject:"clear_filter",
  httpGetProjectFilter:false,deletedExcluded:true
 },
 "RET-02":{
  validationBeforeShortPath:true,validModes:["","all","any"],
  all:{split:"unicode_whitespace_fields",trim:"edge_double_quotes",interiorQuotes:"double_every_quote",quoteOnly:"retained_as_empty_phrase",join:"space_implicit_AND"},
  any:{split:"unicode_whitespace_fields",trim:"edge_double_quotes",quoteOnly:"dropped",order:"preserved",duplicates:"preserved",interiorQuotes:"double_unpaired_preserve_doubled_pairs",nonQuoteUtf8:"unchanged",join:" OR "},
  emptyExpressionBuilt:true,sqliteOutcome:"UNPROVED"
 },
 "RET-03":{
  shortThresholdRunes:3,switchScope:"whole_query",
  escapeOrder:["backslash","percent","underscore"],escapedCharacters:["\\","%","_"],
  fields:["title","content","tool_name","type","project","topic_key"],fieldJoin:"OR",
  allTermJoin:"AND",anyTermJoin:"OR",rank:0,
  order:["updated_at_DESC","id_DESC"],normalTokenizer:"trigram"
 },
 "RET-04":{
  requestDefault:10,configDefaultMax:20,cap:"configured_MaxSearchResults",universal20:false,
  topicDirect:{trigger:"query_contains_slash",match:"exact_topic_key",rank:-1000,order:"updated_at_DESC",dedupeBeforeNormal:true},
  bm25Weights:{title:5,content:1,topicKey:3},
  composite:{form:"raw_bm25_multiply_one_plus_boosts",pinned:0.1,recency:0.06,recencyHalfScoreDays:30,stability:0.04,stabilityScale:4},
  sort:["composite_ASC","stable_sync_or_padded_id_ASC","id_ASC"],projectedRank:"raw_bm25"
 },
 "RET-05":{
  previewLength:300,unit:"SQLite_Unicode_codepoints",truncated:"length_content_greater_than_300",
  storeSearch:"full_content",mcpSearch:"preview_only",compactAdds:["preview","truncated"],
  fullGetSeparate:true,automaticGetFetch:false
 },
 "RET-06":{
  deletedExcludedFrom:["get","topic_direct","fts","like"],
  optionalMetadataOmitted:["project","topic_key","review_after"],
  relationLoad:{ordinaryError:"swallowed",canceled:"search_error",deadlineExceeded:"search_error"},
  persistentWrites:"UNPROVED",legacyReadRedaction:false,projectAuthorization:false
 }
});
const OBSERVATION_CRITICAL_ANCHORS=Object.freeze({
 "OBS-01":{admissionFields:["session_id","type","title","content","project","scope","tool_name","topic_key"],projectNormalized:true,privateTagReplacement:"[REDACTED]",contentLimit:"configured_bytes_utf8_safe_plus_marker",postPrivacyNonempty:["title","content"],newRow:{newId:true,revisionCount:1,duplicateCount:1,lastSeenAt:"now",updatedAt:"now"},queueEffect:"helper_invoked_enrollment_dependent",mcp:{contentAlias:"observation",typeDefault:"manual",capturePromptForwarded:true},http:{required:["session_id","title","content"],successStatus:201,response:["id","status_saved"]}},
 "OBS-02":{matchOrder:"before_duplicate",matchingKeys:["normalized_topic_key","project","scope","undeleted"],selected:"latest_updated_then_created",sameId:true,replacedFields:["session_id","type","title","content","tool_name","topic_key","normalized_hash"],revisionDelta:1,duplicateDelta:0,lastSeenAt:"now",updatedAt:"now",queueEffect:"helper_invoked_enrollment_dependent"},
 "OBS-03":{afterNoTopicMatch:true,matchingKeys:["normalized_content_hash","project","scope","type","title","undeleted","inside_configured_window"],selected:"newest_created",sameId:true,duplicateDelta:1,revisionDelta:0,contentMutated:false,lastSeenAt:"now",updatedAt:"now",queueEffect:"helper_invoked_enrollment_dependent",outsideOrDifferent:"insert_new"},
 "OBS-04":{guardedEntry:"UpdateObservationForProject",expectedOwnerRequired:true,ownershipCheck:"inside_transaction",projectImmutable:true,atLeastOneUpdateField:"transport_validated",findReplace:{paired:true,withContent:false,pureMissWithoutMetadata:"unchanged_no_revision_no_queue"},validMutation:{revisionDelta:1,rehashContent:true,queueEffect:"helper_invoked_enrollment_dependent"},rejectionBarrier:["row","revision","queue"],httpStatus:{malformed:400,mismatch_or_project_change:409,other:404},mcpCurrentProjectCheck:true,unguardedLibraryVariant:"UpdateObservation"},
 "OBS-05":{guardedEntry:"DeleteObservationForProject",expectedOwnerRequired:true,ownershipCheck:"inside_transaction",hardDefault:false,soft:{deletedAt:"now",updatedAt:"now"},hard:{tombstoneBeforePhysicalRemoval:true,relations:"orphan_not_cascade"},sync:{enrolled:"delete_queue_row",unenrolled:"supersede_prior_mutation_state"},rejectionBarrier:["row","relations","tombstone","queue"],mcpProfile:"admin",http:{authWrapper:"conditional_configuration",missingOwner:400,mismatch:409,missingRow:404},unguardedLibraryVariant:"DeleteObservation"}
});
const FOUNDATION_EVIDENCE_ANCHORS=Object.freeze({
 "FND-01":Object.freeze([["SRC-FND-001",1007,1010]]),
 "FND-02":Object.freeze([["SRC-FND-001",1011,1016],["SRC-FND-002",144,211],["SRC-FND-003",41,55]]),
 "FND-03":Object.freeze([["SRC-FND-003",41,67],["SRC-FND-002",190,211]]),
 "FND-04":Object.freeze([["SRC-FND-001",1027,1112],["SRC-FND-002",119,143]]),
 "FND-05":Object.freeze([["SRC-FND-001",1114,1188],["SRC-FND-002",238,293]]),
 "FND-06":Object.freeze([["SRC-FND-001",1122,1179],["SRC-FND-001",3724,3853],["SRC-FND-001",4654,4663],["SRC-FND-001",4725,4809],["SRC-FND-001",4871,4951],["SRC-FND-002",339,450]]),
 "FND-07":Object.freeze([["SRC-FND-001",1119,1164],["SRC-FND-004",16,93],["SRC-FND-005",10,69]]),
 "FND-08":Object.freeze([["SRC-FND-001",1022,1056],["SRC-FND-002",119,143]])
});
// Pin repository identity without repeating external branding outside the provenance registry.
const REPOSITORY_SHA256="7ead05522b4ff6e758946f5c4e80e860bfea93b10ed488f217dc5ae97cf5cab3";
const TARGET_ANCHORS={
 core:{version:"3.0.0",tag:"v3.0.0",tagObject:"fcf2eb5b6fe445c19a2e5568612a0a421f0fd5e1",commit:"15a2f78885d7ad8ced23b2d1d88383e9bb472c17",publishedAt:"2026-10-01T22:30:47Z",channel:"core release"},
 pi:{version:"0.2.0",tag:"pi-v0.2.0",tagObject:"8795484df1725315d8bf2b9181afa67de78147b0",commit:"ce51810bd351f397e49728d6a5be81679cf18554",publishedAt:null,channel:"separate npm channel"}
};
const SOURCE_ANCHORS={
 "internal/store/store.go":[501321,"2ffd000ee7f8c8fc1ad0c3d130e88a8ab4878449866c9737215b3c6d8ffa555b"],
 "internal/store/store_migration_test.go":[39990,"70b196a0903c7690b7ae0a93295d9482345416ec5abae23c47bd5ce279ddacdc"],
 "internal/project/detect.go":[20411,"5ab182e6718761e0a759ff8c96336de359210ecf564b10f88f4a3aea45424300"],
 "internal/project/detect_test.go":[44643,"4d8a25a04a46f47ca23e2dd32dc468cef8b9cbe43fa7f9e72ca54ca762289741"],
 "internal/server/server.go":[73752,"53caec2f14679d5c9a2558c06ce6183e740bb1b78b4cebc33219b60271a53c20"],
 "internal/mcp/mcp.go":[147307,"613a6c74621cdae0c6b8af1fb79c5c121ba51ca4a9665621f9312c683199872d"],
 "plugin/pi/index.ts":[105598,"090e0fc8b6a30d36cff1259764aad093c432e5cfa65e28e687683795057ed431"]
};

const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const exactKeys=(value,expected,label,issues)=>{
 if(!object(value)){issues.push(`${label} must be an object`);return false;}
 const actual=Object.keys(value).sort(),wanted=[...expected].sort();
 if(actual.join("\n")!==wanted.join("\n"))issues.push(`${label} has unknown or missing properties`);
 return true;
};
const nonemptyStrings=value=>Array.isArray(value)&&value.every(item=>typeof item==="string"&&item.trim().length>0);
const duplicates=values=>new Set(values).size!==values.length;

/** Load the checked-in reference without network, database, or source execution. */
export function loadCheckedInMemoryParity(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory parity JSON ${MANIFEST}`,{cause:error});}
}

/** Load the source-inspected foundation contracts without executing upstream code. */
export function loadCheckedInMemoryFoundation(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,FOUNDATION_MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory foundation JSON ${FOUNDATION_MANIFEST}`,{cause:error});}
}

/** Load observation-write contracts without executing upstream code. */
export function loadCheckedInMemoryObservationWrites(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,OBSERVATION_WRITE_MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory observation-write JSON ${OBSERVATION_WRITE_MANIFEST}`,{cause:error});}
}

/** Load retrieval/search contracts without executing upstream code. */
export function loadCheckedInMemoryRetrievalSearch(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,RETRIEVAL_SEARCH_MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory retrieval/search JSON ${RETRIEVAL_SEARCH_MANIFEST}`,{cause:error});}
}

/** Load context/timeline contracts without executing upstream code. */
export function loadCheckedInMemoryContextTimeline(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,CONTEXT_TIMELINE_MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory context/timeline JSON ${CONTEXT_TIMELINE_MANIFEST}`,{cause:error});}
}

/** Pure structural and critical-value validation of source-inspected context/timeline contracts. */
export function validateMemoryContextTimeline(manifest){
 const issues=[];
 if(!exactKeys(manifest,CONTEXT_TOP_FIELDS,"context/timeline manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("context/timeline schemaVersion must be 1");
 if(manifest.scope!=="reference_only"||manifest.status!=="SOURCE_INSPECTED"||manifest.proofKind!=="source_inspection")issues.push("context/timeline metadata must remain reference-only source inspection");
 if(!nonemptyStrings(manifest.limitations)||JSON.stringify(manifest.limitations)!==JSON.stringify(CONTEXT_LIMITATIONS))issues.push("context/timeline limitations must preserve exact unproved boundaries");
 const sources=Array.isArray(manifest.sources)?manifest.sources:[],sourceIds=sources.map(source=>source?.id),sourceById=new Map();
 const expectedSources=["SRC-CTX-001","SRC-CTX-002","SRC-CTX-003"];
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("context/timeline source IDs must be strings");
 if(sources.length!==3||duplicates(sourceIds)||JSON.stringify(sourceIds)!==JSON.stringify(expectedSources))issues.push("context/timeline sources must contain exact unique IDs in order");
 for(const source of sources){
  if(!exactKeys(source,CONTEXT_SOURCE_FIELDS,`context/timeline source ${source?.id??"unknown"}`,issues))continue;
  const pathIsString=typeof source.path==="string",anchor=pathIsString?CONTEXT_SOURCE_ANCHORS[source.path]:undefined;
  if(typeof source.id==="string")sourceById.set(source.id,source);
  if(!pathIsString||!PATH.test(source.path))issues.push(`context/timeline source ${source.id} path is invalid`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`context/timeline source ${source.id} does not match its pinned byte/hash tuple`);
  if(source.commit!==CORE_COMMIT||source.sourceIdentity!==`${CORE_COMMIT}:${source.path}`)issues.push(`context/timeline source ${source.id} has invalid source identity`);
  if(source.representation!=="git_blob")issues.push(`context/timeline source ${source.id} representation must be git_blob`);
  if(!anchor||source.lineStart!==anchor[2]||source.lineEnd!==anchor[3])issues.push(`context/timeline source ${source.id} has invalid declared line range`);
 }
 const cases=Array.isArray(manifest.cases)?manifest.cases:[],caseIds=cases.map(item=>item?.id),expectedCases=Object.keys(CONTEXT_EVIDENCE_ANCHORS),covered=new Set();
 if(!caseIds.every(id=>typeof id==="string"))issues.push("context/timeline case IDs must be strings");
 if(cases.length!==5||duplicates(caseIds)||JSON.stringify(caseIds)!==JSON.stringify(expectedCases))issues.push("context/timeline cases must contain the exact five CTX cases in order");
 for(const item of cases){
  if(!exactKeys(item,CONTEXT_CASE_FIELDS,`context/timeline case ${item?.id??"unknown"}`,issues))continue;
  for(const field of ["summary","contract","negativeControls"])if(typeof item[field]!=="string"||!item[field].trim())issues.push(`context/timeline case ${item.id} ${field} must be a nonempty string`);
  if(item.versionControl!=="CORE-15a")issues.push(`context/timeline case ${item.id} has invalid versionControl`);
  const expected=typeof item.id==="string"?CONTEXT_EVIDENCE_ANCHORS[item.id]:undefined;
  if(!Array.isArray(item.evidence)||!expected||item.evidence.length!==expected.length)issues.push(`context/timeline case ${item.id} has invalid pinned evidence`);
  else item.evidence.forEach((evidence,index)=>{
   if(!exactKeys(evidence,FOUNDATION_EVIDENCE_FIELDS,`context/timeline case ${item.id} evidence`,issues))return;
   const source=sourceById.get(evidence.sourceId),anchor=expected[index];
   if(!source||!Number.isInteger(evidence.startLine)||!Number.isInteger(evidence.endLine)||evidence.startLine>evidence.endLine||evidence.startLine<source.lineStart||evidence.endLine>source.lineEnd)issues.push(`context/timeline case ${item.id} evidence has invalid line range`);
   else covered.add(evidence.sourceId);
   if(!anchor||evidence.sourceId!==anchor[0]||evidence.startLine!==anchor[1]||evidence.endLine!==anchor[2])issues.push(`context/timeline case ${item.id} has invalid pinned evidence`);
  });
  const critical=typeof item.id==="string"?CONTEXT_CRITICAL_ANCHORS[item.id]:undefined;
  if(!object(item.criticalValues)||!critical||JSON.stringify(item.criticalValues)!==JSON.stringify(critical))issues.push(`context/timeline case ${item.id} has invalid critical values`);
 }
 if(expectedSources.some(id=>!covered.has(id)))issues.push("context/timeline cases must reference all pinned sources");
 return issues;
}

/** Pure structural and critical-value validation of source-inspected retrieval/search contracts. */
export function validateMemoryRetrievalSearch(manifest){
 const issues=[];
 if(!exactKeys(manifest,RETRIEVAL_TOP_FIELDS,"retrieval/search manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("retrieval/search schemaVersion must be 1");
 if(manifest.scope!=="reference_only"||manifest.status!=="SOURCE_INSPECTED"||manifest.proofKind!=="source_inspection")issues.push("retrieval/search metadata must remain reference-only source inspection");
 if(JSON.stringify(manifest.limitations)!==JSON.stringify(RETRIEVAL_LIMITATIONS))issues.push("retrieval/search limitations must preserve exact unproved boundaries");
 const sources=Array.isArray(manifest.sources)?manifest.sources:[],sourceIds=sources.map(source=>source?.id);
 const expectedSources=Array.from({length:5},(_,i)=>`SRC-RET-${String(i+1).padStart(3,"0")}`),sourceById=new Map();
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("retrieval/search source IDs must be strings");
 if(sources.length!==5||duplicates(sourceIds)||JSON.stringify(sourceIds)!==JSON.stringify(expectedSources))issues.push("retrieval/search sources must contain exact unique IDs in order");
 for(const source of sources){
  if(!exactKeys(source,RETRIEVAL_SOURCE_FIELDS,`retrieval/search source ${source?.id??"unknown"}`,issues))continue;
  const pathIsString=typeof source.path==="string",anchor=pathIsString?RETRIEVAL_SOURCE_ANCHORS[source.path]:undefined;
  if(typeof source.id==="string")sourceById.set(source.id,source);
  if(!pathIsString||!PATH.test(source.path))issues.push(`retrieval/search source ${source.id} path is invalid`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`retrieval/search source ${source.id} does not match its pinned byte/hash tuple`);
  if(source.commit!==CORE_COMMIT||source.sourceIdentity!==`${CORE_COMMIT}:${source.path}`)issues.push(`retrieval/search source ${source.id} has invalid source identity`);
  if(source.representation!=="git_blob")issues.push(`retrieval/search source ${source.id} representation must be git_blob`);
  if(!anchor||source.lineStart!==anchor[2]||source.lineEnd!==anchor[3])issues.push(`retrieval/search source ${source.id} has invalid declared line range`);
 }
 const cases=Array.isArray(manifest.cases)?manifest.cases:[],caseIds=cases.map(item=>item?.id);
 const expectedCases=Array.from({length:6},(_,i)=>`RET-${String(i+1).padStart(2,"0")}`),covered=new Set();
 if(!caseIds.every(id=>typeof id==="string"))issues.push("retrieval/search case IDs must be strings");
 if(cases.length!==6||duplicates(caseIds)||JSON.stringify(caseIds)!==JSON.stringify(expectedCases))issues.push("retrieval/search cases must contain exact RET-01 through RET-06 in order");
 for(const item of cases){
  if(!exactKeys(item,RETRIEVAL_CASE_FIELDS,`retrieval/search case ${item?.id??"unknown"}`,issues))continue;
  for(const field of ["summary","contract","negativeControls"])if(typeof item[field]!=="string"||!item[field].trim())issues.push(`retrieval/search case ${item.id} ${field} must be a nonempty string`);
  if(item.versionControl!=="CORE-15a")issues.push(`retrieval/search case ${item.id} has invalid versionControl`);
  const expected=typeof item.id==="string"?RETRIEVAL_EVIDENCE_ANCHORS[item.id]:undefined;
  if(!Array.isArray(item.evidence)||!expected||item.evidence.length!==expected.length)issues.push(`retrieval/search case ${item.id} has invalid pinned evidence`);
  else item.evidence.forEach((evidence,index)=>{
   if(!exactKeys(evidence,FOUNDATION_EVIDENCE_FIELDS,`retrieval/search case ${item.id} evidence`,issues))return;
   const source=sourceById.get(evidence.sourceId),anchor=expected[index];
   if(!source||!Number.isInteger(evidence.startLine)||!Number.isInteger(evidence.endLine)||evidence.startLine>evidence.endLine||evidence.startLine<source.lineStart||evidence.endLine>source.lineEnd)issues.push(`retrieval/search case ${item.id} evidence has invalid line range`);
   else covered.add(evidence.sourceId);
   if(!anchor||evidence.sourceId!==anchor[0]||evidence.startLine!==anchor[1]||evidence.endLine!==anchor[2])issues.push(`retrieval/search case ${item.id} has invalid pinned evidence`);
  });
  const critical=typeof item.id==="string"?RETRIEVAL_CRITICAL_ANCHORS[item.id]:undefined;
  if(!object(item.criticalValues)||!critical||JSON.stringify(item.criticalValues)!==JSON.stringify(critical))issues.push(`retrieval/search case ${item.id} has invalid critical values`);
 }
 if(expectedSources.some(id=>!covered.has(id)))issues.push("retrieval/search cases must reference all pinned sources");
 return issues;
}

/** Pure structural and critical-value validation of source-inspected observation writes. */
export function validateMemoryObservationWrites(manifest){
 const issues=[];
 if(!exactKeys(manifest,OBSERVATION_TOP_FIELDS,"observation-write manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("observation-write schemaVersion must be 1");
 if(manifest.scope!=="reference_only")issues.push("observation-write scope must be reference_only");
 if(manifest.status!=="SOURCE_INSPECTED")issues.push("observation-write status must be SOURCE_INSPECTED");
 if(manifest.proofKind!=="source_inspection")issues.push("observation-write proofKind must be source_inspection");
 if(JSON.stringify(manifest.limitations)!==JSON.stringify(OBSERVATION_LIMITATIONS))issues.push("observation-write limitations must preserve the exact source-inspection boundaries");
 const sources=Array.isArray(manifest.sources)?manifest.sources:[],sourceIds=sources.map(source=>source?.id);
 const expectedSources=["SRC-OBS-001","SRC-OBS-002","SRC-OBS-003"];
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("observation-write source IDs must be strings");
 if(sources.length!==3||duplicates(sourceIds)||JSON.stringify(sourceIds)!==JSON.stringify(expectedSources))issues.push("observation-write sources must contain exact unique IDs in order");
 const sourceById=new Map();
 for(const source of sources){
  if(!exactKeys(source,OBSERVATION_SOURCE_FIELDS,`observation-write source ${source?.id??"unknown"}`,issues))continue;
  const pathIsString=typeof source.path==="string",anchor=pathIsString?OBSERVATION_SOURCE_ANCHORS[source.path]:undefined;
  if(typeof source.id==="string")sourceById.set(source.id,source);
  if(!pathIsString)issues.push(`observation-write source ${source.id} path must be a string`);
  else if(!PATH.test(source.path))issues.push(`observation-write source ${source.id} path is invalid`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`observation-write source ${source.id} does not match its pinned byte/hash tuple`);
  if(source.commit!==CORE_COMMIT||source.commitRole!=="CORE-15a")issues.push(`observation-write source ${source.id} has invalid commitRole or commit`);
  if(!anchor||source.lineStart!==anchor[2]||source.lineEnd!==anchor[3])issues.push(`observation-write source ${source.id} has invalid declared line range`);
 }
 const cases=Array.isArray(manifest.cases)?manifest.cases:[],caseIds=cases.map(item=>item?.id);
 const expectedCases=["OBS-01","OBS-02","OBS-03","OBS-04","OBS-05"];
 if(!caseIds.every(id=>typeof id==="string"))issues.push("observation-write case IDs must be strings");
 if(cases.length!==5||duplicates(caseIds)||JSON.stringify(caseIds)!==JSON.stringify(expectedCases))issues.push("observation-write cases must contain exact OBS-01 through OBS-05 as five unique IDs in order");
 const covered=new Set();
 for(const item of cases){
  if(!exactKeys(item,OBSERVATION_CASE_FIELDS,`observation-write case ${item?.id??"unknown"}`,issues))continue;
  for(const field of OBSERVATION_NARRATIVE_FIELDS)if(typeof item[field]!=="string"||!item[field].trim())issues.push(`observation-write case ${item.id} ${field} must be a nonempty string`);
  if(item.versionControl!=="CORE-15a")issues.push(`observation-write case ${item.id} has invalid versionControl`);
  const expectedEvidence=typeof item.id==="string"&&Object.hasOwn(OBSERVATION_EVIDENCE_ANCHORS,item.id)?OBSERVATION_EVIDENCE_ANCHORS[item.id]:undefined;
  if(!Array.isArray(item.evidence)||!expectedEvidence||item.evidence.length!==expectedEvidence.length)issues.push(`observation-write case ${item.id} has invalid pinned evidence`);
  else item.evidence.forEach((evidence,index)=>{
   if(!exactKeys(evidence,FOUNDATION_EVIDENCE_FIELDS,`observation-write case ${item.id} evidence`,issues))return;
   const source=sourceById.get(evidence.sourceId),anchor=expectedEvidence[index];
   if(!source)issues.push(`observation-write case ${item.id} evidence has unknown sourceId`);
   else if(!Number.isInteger(evidence.startLine)||!Number.isInteger(evidence.endLine)||evidence.startLine>evidence.endLine||evidence.startLine<source.lineStart||evidence.endLine>source.lineEnd)issues.push(`observation-write case ${item.id} evidence has invalid line range`);
   else covered.add(evidence.sourceId);
   if(!anchor||evidence.sourceId!==anchor[0]||evidence.startLine!==anchor[1]||evidence.endLine!==anchor[2])issues.push(`observation-write case ${item.id} has invalid pinned evidence`);
  });
  const critical=typeof item.id==="string"&&Object.hasOwn(OBSERVATION_CRITICAL_ANCHORS,item.id)?OBSERVATION_CRITICAL_ANCHORS[item.id]:undefined;
  if(!object(item.criticalValues)||!critical||JSON.stringify(item.criticalValues)!==JSON.stringify(critical))issues.push(`observation-write case ${item.id} has invalid critical values`);
 }
 if(expectedSources.some(id=>!covered.has(id)))issues.push("observation-write cases must reference all pinned sources");
 return issues;
}

/** Pure structural and critical-value validation of source-inspected foundation contracts. */
export function validateMemoryFoundation(manifest){
 const issues=[];
 if(!exactKeys(manifest,FOUNDATION_TOP_FIELDS,"foundation manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("foundation schemaVersion must be 1");
 if(manifest.scope!=="reference_only")issues.push("foundation scope must be reference_only");
 if(manifest.status!=="SOURCE_INSPECTED")issues.push("foundation status must be SOURCE_INSPECTED");
 if(manifest.proofKind!=="source_inspection")issues.push("foundation proofKind must be source_inspection");
 if(!nonemptyStrings(manifest.limitations)||manifest.limitations.length===0)issues.push("foundation limitations must be nonempty strings");
 const sources=Array.isArray(manifest.sources)?manifest.sources:[],sourceIds=sources.map(source=>source?.id);
 const expectedSources=Array.from({length:5},(_,i)=>`SRC-FND-${String(i+1).padStart(3,"0")}`);
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("foundation source IDs must be strings");
 if(sources.length!==5||duplicates(sourceIds)||[...sourceIds].sort().join("\n")!==expectedSources.join("\n"))issues.push("foundation sources must contain exact unique IDs");
 const sourceById=new Map();
 for(const source of sources){
  if(!exactKeys(source,FOUNDATION_SOURCE_FIELDS,`foundation source ${source?.id??"unknown"}`,issues))continue;
  const anchor=typeof source.path==="string"?FOUNDATION_SOURCE_ANCHORS[source.path]:undefined;
  if(typeof source.id==="string")sourceById.set(source.id,source);
  if(!PATH.test(source.path??""))issues.push(`foundation source ${source.id} path is invalid`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`foundation source ${source.id} does not match its pinned byte/hash tuple`);
  if(source.commit!==CORE_COMMIT||source.commitRole!=="CORE-15a")issues.push(`foundation source ${source.id} has invalid commitRole or commit`);
  if(!anchor||source.lineStart!==anchor[2]||source.lineEnd!==anchor[3])issues.push(`foundation source ${source.id} has invalid declared line range`);
 }
 const cases=Array.isArray(manifest.cases)?manifest.cases:[],caseIds=cases.map(item=>item?.id);
 const expectedCases=Array.from({length:8},(_,i)=>`FND-${String(i+1).padStart(2,"0")}`);
 if(!caseIds.every(id=>typeof id==="string"))issues.push("foundation case IDs must be strings");
 if(cases.length!==8||duplicates(caseIds)||[...caseIds].sort().join("\n")!==expectedCases.join("\n"))issues.push("foundation cases must contain exact FND-01 through FND-08 as eight unique IDs");
 const covered=new Set();
 for(const item of cases){
  if(!exactKeys(item,FOUNDATION_CASE_FIELDS,`foundation case ${item?.id??"unknown"}`,issues))continue;
  for(const field of ["summary","input","trigger","output","durableState","sideEffects","negativeControls"])
   if(typeof item[field]!=="string"||!item[field].trim())issues.push(`foundation case ${item.id} ${field} must be a nonempty string`);
  if(item.versionControl!=="CORE-15a")issues.push(`foundation case ${item.id} has invalid versionControl`);
  if(!nonemptyStrings(item.ordering)||item.ordering.length===0)issues.push(`foundation case ${item.id} ordering must be nonempty strings`);
  if(!Array.isArray(item.evidence)||item.evidence.length===0)issues.push(`foundation case ${item.id} requires evidence`);
  else for(const evidence of item.evidence){
   if(!exactKeys(evidence,FOUNDATION_EVIDENCE_FIELDS,`foundation case ${item.id} evidence`,issues))continue;
   const source=sourceById.get(evidence.sourceId);
   if(!source)issues.push(`foundation case ${item.id} evidence has unknown sourceId`);
   else if(!Number.isInteger(evidence.startLine)||!Number.isInteger(evidence.endLine)||evidence.startLine>evidence.endLine||evidence.startLine<source.lineStart||evidence.endLine>source.lineEnd)issues.push(`foundation case ${item.id} evidence has invalid line range`);
   else covered.add(evidence.sourceId);
  }
  const evidenceAnchor=typeof item.id==="string"&&Object.hasOwn(FOUNDATION_EVIDENCE_ANCHORS,item.id)?FOUNDATION_EVIDENCE_ANCHORS[item.id]:undefined;
  if(!evidenceAnchor||!Array.isArray(item.evidence)||item.evidence.length!==evidenceAnchor.length||!item.evidence.every((evidence,index)=>typeof evidence.sourceId==="string"&&evidence.sourceId===evidenceAnchor[index][0]&&Number.isInteger(evidence.startLine)&&evidence.startLine===evidenceAnchor[index][1]&&Number.isInteger(evidence.endLine)&&evidence.endLine===evidenceAnchor[index][2]))issues.push(`foundation case ${item.id} has invalid pinned evidence`);
  const anchor=typeof item.id==="string"?FOUNDATION_CRITICAL_ANCHORS[item.id]:undefined;
  if(!object(item.criticalValues)||!anchor||JSON.stringify(item.criticalValues)!==JSON.stringify(anchor))issues.push(`foundation case ${item.id} has invalid critical values`);
  if(item.id==="FND-07"&&JSON.stringify(item.ordering)!==JSON.stringify(FOUNDATION_ORDER_ANCHOR))issues.push("foundation case FND-07 has invalid ordering");
 }
 if(expectedSources.some(id=>!covered.has(id)))issues.push("foundation cases must reference all pinned sources");
 return issues;
}

/** Pure structural validation of a supplied manifest value. */
export function validateMemoryParity(manifest){
 const issues=[];
 if(!exactKeys(manifest,TOP_FIELDS,"manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("schemaVersion must be 1");
 if(manifest.scope!=="reference_only")issues.push("scope must be reference_only");
 if(JSON.stringify(manifest.statusModel)!==JSON.stringify(["MISSING","PARTIAL"]))issues.push("statusModel must allow only MISSING and PARTIAL");
 if(!nonemptyStrings(manifest.limitations)||manifest.limitations.length===0)issues.push("manifest limitations must be nonempty strings");
 const targets=Array.isArray(manifest.targets)?manifest.targets:[];
 if(targets.length!==2||duplicates(targets.map(target=>target?.id)))issues.push("targets must contain exactly two unique IDs");
 for(const target of targets){
  if(!exactKeys(target,TARGET_FIELDS,`target ${target?.id??"unknown"}`,issues))continue;
  if(typeof target.id!=="string")issues.push("target ID must be a string");
  const anchor=typeof target.id==="string"&&Object.hasOwn(TARGET_ANCHORS,target.id)?TARGET_ANCHORS[target.id]:undefined;
  if(!anchor)issues.push(`unknown target ID ${target.id}`);
  else for(const [field,value] of Object.entries(anchor))if(target[field]!==value)issues.push(`target ${target.id} has invalid ${field}`);
  if(typeof target.repository!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target.repository))issues.push(`target ${target.id} has invalid repository`);
  else if(createHash("sha256").update(target.repository).digest("hex")!==REPOSITORY_SHA256)issues.push(`target ${target.id} has invalid repository identity`);
  if(!SHA40.test(target.tagObject)||!SHA40.test(target.commit))issues.push(`target ${target.id} requires full lowercase Git hashes`);
  const base=`https://github.com/${target.repository}`;
  if(target.apiRefUrl!==`https://api.github.com/repos/${target.repository}/git/ref/tags/${target.tag}`)issues.push(`target ${target.id} API URL is not bound to its repository and tag`);
  if(target.tagUrl!==`${base}/releases/tag/${target.tag}`)issues.push(`target ${target.id} tag URL is not bound to its repository and tag`);
 }
 const targetById=new Map(targets.map(target=>[target.id,target]));
 const sources=Array.isArray(manifest.sources)?manifest.sources:[];
 const sourceIds=sources.map(source=>source?.id);
 const expectedSourceIds=Array.from({length:7},(_,index)=>`SRC-MEM-${String(index+1).padStart(3,"0")}`);
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("source IDs must be strings");
 if(sources.length!==7||duplicates(sourceIds)||duplicates(sources.map(source=>source?.path))||duplicates(sources.map(source=>source?.rawUrl))||[...sourceIds].sort().join("\n")!==expectedSourceIds.join("\n"))issues.push("sources must contain exact unique IDs, paths, and URLs");
 for(const source of sources){
  if(!exactKeys(source,SOURCE_FIELDS,`source ${source?.id??"unknown"}`,issues))continue;
  const target=targetById.get(source.targetId),pathIsString=typeof source.path==="string";
  const anchor=pathIsString?SOURCE_ANCHORS[source.path]:undefined;
  if(!target)issues.push(`source ${source.id} has unknown targetId`);
  if(source.targetId!=="core")issues.push(`source ${source.id} must belong to the core snapshot`);
  if(!pathIsString)issues.push(`source ${source.id} path must be a string`);
  else if(!PATH.test(source.path))issues.push(`source ${source.id} path is not canonical relative syntax`);
  if(!Number.isInteger(source.bytes)||source.bytes<=0||source.bytes>2*1024*1024||!SHA64.test(source.sha256))issues.push(`source ${source.id} has invalid byte/hash tuple`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`source ${source.id} does not match its pinned byte/hash tuple`);
  if(target&&pathIsString&&source.rawUrl!==`https://raw.githubusercontent.com/${target.repository}/${target.commit}/${source.path}`)issues.push(`source ${source.id} raw URL is not bound to owner, commit, and path`);
 }
 const families=Array.isArray(manifest.families)?manifest.families:[];
 const expectedIds=Array.from({length:18},(_,index)=>`E3-${String(index+1).padStart(2,"0")}`);
 const ids=families.map(family=>family?.id);
 if(!ids.every(id=>typeof id==="string"))issues.push("family IDs must be strings");
 if(families.length!==18||duplicates(ids)||[...ids].sort().join("\n")!==expectedIds.join("\n"))issues.push("families must cover exactly E3-01 through E3-18");
 for(const family of families){
  if(!exactKeys(family,FAMILY_FIELDS,`family ${family?.id??"unknown"}`,issues))continue;
  if(typeof family.title!=="string"||family.title.trim().length===0)issues.push(`family ${family.id} title must be a nonempty string`);
  if(!new Set(["MISSING","PARTIAL"]).has(family.status))issues.push(`family ${family.id} has invalid status; FULL is unsupported by this reference-only schema`);
  if(!nonemptyStrings(family.facts))issues.push(`family ${family.id} facts must be a string array`);
  if(!nonemptyStrings(family.limitations)||family.limitations.length===0)issues.push(`family ${family.id} requires explicit limitations`);
 }
 return issues;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){console.error("audit:memory-parity is offline-only and accepts no flags");process.exitCode=2;}
 else{
  const issues=[...validateMemoryParity(loadCheckedInMemoryParity()),...validateMemoryFoundation(loadCheckedInMemoryFoundation()),...validateMemoryObservationWrites(loadCheckedInMemoryObservationWrites()),...validateMemoryRetrievalSearch(loadCheckedInMemoryRetrievalSearch()),...validateMemoryContextTimeline(loadCheckedInMemoryContextTimeline())];
  if(issues.length){console.error(issues.join("\n"));process.exitCode=1;}
  else console.log("memory parity reference: PASS (2 targets, 7 sources, 18 baseline families; 8 foundation, 5 observation-write, 6 retrieval/search, and 5 context/timeline source-inspected contracts; no runtime parity claim)");
 }
}

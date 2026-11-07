import {isProxy} from "node:util/types";
import {
  claimCompletedWorkUnit,
  type CompletedWorkUnit,
} from "./work-unit-evidence.js";
import {
  exactRecord,
  relationship,
  text,
  type DeliveryRelationship,
} from "./work-unit-policy.js";

export type ReviewCandidateKind = "commit" | "pr_slice";
export interface WorkUnitReviewCandidateInput {
  readonly kind: ReviewCandidateKind;
  readonly identity: string;
  readonly revision: string;
  readonly treeIdentity: string;
  readonly repositoryIdentity: string;
  readonly featureIdentity: string;
  readonly taskIdentity: string;
  readonly taskDocumentPath: string;
  readonly boundaryId: string;
  readonly previousReviewedBoundary: string | null;
  readonly deliveryRelationship: DeliveryRelationship;
}
export type WorkUnitReviewCandidate = Readonly<WorkUnitReviewCandidateInput & {
  completedWorkUnit: CompletedWorkUnit;
}>;

const issuedCandidates=new WeakSet<object>(),claimedCandidates=new WeakSet<object>();
const candidateKeys = [
  "kind", "identity", "revision", "treeIdentity", "repositoryIdentity", "featureIdentity",
  "taskIdentity", "taskDocumentPath", "boundaryId", "previousReviewedBoundary", "deliveryRelationship",
] as const;

function sameRelationship(left: DeliveryRelationship, right: DeliveryRelationship): boolean {
  return left.kind === right.kind
    && (left.kind === "single" || (right.kind === "chain_slice" && left.sliceId === right.sliceId));
}

function canonicalPullRequest(identity: string, repositoryIdentity: string): boolean {
  try {
    const repository = new URL(repositoryIdentity);
    const candidate = new URL(identity);
    const repositoryPath = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository.pathname);
    const cleanRepository = repository.protocol === "https:" && !repository.username && !repository.password
      && !repository.search && !repository.hash && repository.href === repositoryIdentity && repositoryPath;
    const match = /^([1-9][0-9]*)$/u.exec(candidate.pathname.slice(`${repository.pathname}/pull/`.length));
    return cleanRepository && candidate.protocol === repository.protocol && candidate.host === repository.host
      && !candidate.username && !candidate.password && !candidate.search && !candidate.hash
      && candidate.href === identity && candidate.pathname.startsWith(`${repository.pathname}/pull/`)
      && match !== null && identity === `${repositoryIdentity}/pull/${match[1]}`;
  } catch {
    return false;
  }
}

/** Records pure candidate facts after consuming one genuine completed record. */
export function recordWorkUnitReviewCandidate(
  completed: CompletedWorkUnit,
  candidate: WorkUnitReviewCandidateInput,
): WorkUnitReviewCandidate {
  claimCompletedWorkUnit(completed);
  if(isProxy(candidate))throw new Error("El candidato de revisión debe contener datos planos");
  const input = exactRecord(candidate, candidateKeys, "review candidate");
  if(isProxy(input.deliveryRelationship))throw new Error("La relación de entrega debe contener datos planos");
  if (input.kind !== "commit" && input.kind !== "pr_slice") throw new Error("review candidate kind is invalid");
  const kind: ReviewCandidateKind = input.kind;
  const facts = {
    kind,
    identity: text(input.identity, "candidate identity"),
    revision: text(input.revision, "candidate revision"),
    treeIdentity: text(input.treeIdentity, "candidate tree identity"),
    repositoryIdentity: text(input.repositoryIdentity, "repository identity"),
    featureIdentity: text(input.featureIdentity, "feature identity"),
    taskIdentity: text(input.taskIdentity, "task identity"),
    taskDocumentPath: text(input.taskDocumentPath, "task document path"),
    boundaryId: text(input.boundaryId, "boundary ID"),
    previousReviewedBoundary: input.previousReviewedBoundary === null
      ? null
      : text(input.previousReviewedBoundary, "previous reviewed boundary"),
    deliveryRelationship: relationship(input.deliveryRelationship),
  };
  for (const key of ["repositoryIdentity", "featureIdentity", "taskIdentity", "taskDocumentPath", "boundaryId"] as const) {
    if (facts[key] !== completed[key]) throw new Error(`${key} does not match completed work unit`);
  }
  if (facts.previousReviewedBoundary !== completed.previousReviewedBoundary) throw new Error("previous reviewed boundary mismatch");
  if (!sameRelationship(facts.deliveryRelationship, completed.deliveryRelationship)) throw new Error("delivery relationship mismatch");
  if (facts.revision !== completed.commit.identity || facts.treeIdentity !== completed.commit.treeIdentity) {
    throw new Error("candidate revision or tree does not match completed commit");
  }
  if (facts.kind === "commit" ? facts.identity !== completed.commit.identity
    : !canonicalPullRequest(facts.identity, completed.repositoryIdentity)) {
    throw new Error("candidate identity does not match its kind and repository");
  }
  const result=Object.freeze({ completedWorkUnit: completed, ...facts });
  issuedCandidates.add(result);return result;
}

/** Admisión de un uso; no emite revisión, autenticación ni entrega. */
export function claimWorkUnitReviewCandidate(value:unknown):WorkUnitReviewCandidate{
 if(typeof value!=="object"||value===null||!issuedCandidates.has(value))throw new Error("Se requiere un candidato de work-unit genuino");
 if(claimedCandidates.has(value))throw new Error("El candidato de revisión ya fue consumido");
 claimedCandidates.add(value);return value as WorkUnitReviewCandidate;
}

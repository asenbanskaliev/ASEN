import type {ReviewCandidateKind} from "../delivery/work-unit-review-candidate.js";
import {assertOrdinaryReviewCheckoutGenuine,revalidateOrdinaryReviewCheckout,type OrdinaryReviewCheckout} from "../review/ordinary-review-controller.js";
import {truncateForTerminal} from "./responsive-layout.js";

export interface ReviewPanelDescriptor{
 readonly schemaVersion:1;
 readonly candidateKind:ReviewCandidateKind;
 readonly candidate:Readonly<{revision:string;treeIdentity:string;parentIdentity:string}>;
 readonly reviewState:"review-needed";
 readonly nativeStatus:"unavailable";
 readonly nativeAcknowledgement:"not-acknowledged";
 readonly deliveryApproval:"not-approved";
}

const validIdentity=(value:unknown):value is string=>typeof value==="string"&&value.length>0;

/** Builds a candidate-only descriptor after genuine-checkout and current-Git revalidation. */
export function prepareReviewPanelDescriptor(input:Readonly<{checkout:OrdinaryReviewCheckout}>):ReviewPanelDescriptor|null{
 try{
  const checkout=input.checkout;
  assertOrdinaryReviewCheckoutGenuine(checkout);
  revalidateOrdinaryReviewCheckout(checkout);
  const kind=checkout.request.candidate.kind;
  if((kind!=="commit"&&kind!=="pr_slice")||!validIdentity(checkout.revision)||!validIdentity(checkout.treeIdentity)||!validIdentity(checkout.parentIdentity))return null;
  const candidate=Object.freeze({revision:checkout.revision,treeIdentity:checkout.treeIdentity,parentIdentity:checkout.parentIdentity});
  return Object.freeze({schemaVersion:1 as const,candidateKind:kind,candidate,reviewState:"review-needed" as const,nativeStatus:"unavailable" as const,nativeAcknowledgement:"not-acknowledged" as const,deliveryApproval:"not-approved" as const});
 }catch{return null;}
}

/** Pure fixed-label rendering. It performs no checkout, provider, review, approval, or ACK operation. */
export function renderReviewPanel(descriptor:ReviewPanelDescriptor|null,columns:number):readonly string[]{
 if(!Number.isSafeInteger(columns)||columns<1)throw new Error("Review panel width is invalid");
 const lines=descriptor===null?["Review unavailable"]:[
  `Review candidate: ${descriptor.candidateKind}`,
  `Revision: ${descriptor.candidate.revision}`,
  `Tree: ${descriptor.candidate.treeIdentity}`,
  `Parent: ${descriptor.candidate.parentIdentity}`,
  "Review state: review-needed",
  "Native status: unavailable",
  "Native acknowledgement: not-acknowledged",
  "Delivery approval: not-approved",
 ];
 return Object.freeze(lines.map(line=>truncateForTerminal(line,columns)));
}

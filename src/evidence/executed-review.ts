export interface ExecutedReview{
 readonly candidateRepository:string;
 readonly candidateId:string;
 readonly candidateRevision:string;
 readonly taskId:string;
 readonly reviewerId:string;
 readonly authorId:string;
 readonly command:readonly string[];
 readonly startedAt:string;
 readonly finishedAt:string;
 readonly report:Readonly<{
  candidateRepository:string;
  candidateId:string;
  candidateRevision:string;
  reviewer:string;
  reviewerRole:"independent"|"author";
  findings:readonly Readonly<{id:string;severity:"critical"|"high"|"medium"|"low";message:string;path?:string}>[];
 }>;
}

const issuedReviews=new WeakSet<object>();
export function isExecutedReview(value:unknown):value is ExecutedReview{
 return typeof value==="object"&&value!==null&&issuedReviews.has(value);
}
export function issueExecutedReview(review:ExecutedReview):ExecutedReview{
 issuedReviews.add(review);
 return review;
}

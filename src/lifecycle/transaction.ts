export interface TransactionHooks<T> {
  snapshot(): Promise<T>;
  apply(): Promise<void>;
  verify(): Promise<boolean>;
  rollback(snapshot: T): Promise<void>;
}
export async function transactionalChange<T>(hooks: TransactionHooks<T>): Promise<"committed"|"rolled-back"> {
  const snapshot=await hooks.snapshot();
  try {
    await hooks.apply();
    if (!await hooks.verify()) throw new Error("verification failed");
    return "committed";
  } catch (error) {
    await hooks.rollback(snapshot);
    return "rolled-back";
  }
}

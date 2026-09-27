export interface TransactionHooks<T>{
 snapshot():Promise<T>;apply():Promise<void>;verify():Promise<boolean>;rollback(snapshot:T):Promise<void>;
}
export type TransactionResult={status:"committed"}|{status:"rolled-back";cause:unknown}|{status:"rollback-failed";cause:unknown;rollbackError:unknown};
export async function transactionalChange<T>(hooks:TransactionHooks<T>):Promise<TransactionResult>{
 const snapshot=await hooks.snapshot();
 try{await hooks.apply();if(!await hooks.verify())throw new Error("verification failed");return {status:"committed"};}
 catch(cause){try{await hooks.rollback(snapshot);return {status:"rolled-back",cause};}catch(rollbackError){return {status:"rollback-failed",cause,rollbackError};}}
}
export interface Compensation{run():Promise<void>;}
export async function runCompensationsAll(items:readonly Compensation[]):Promise<unknown[]>{
 const errors:unknown[]=[];for(const item of [...items].reverse()){try{await item.run();}catch(e){errors.push(e);}}return errors;
}

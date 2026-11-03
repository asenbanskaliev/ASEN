/**
 * Conservative primary-session routine delivery waiver; not a shell sandbox.
 * Existing hard denies and recognized data-loss decisions run first.
 */
const ref=/^(?:feat|feature|fix|chore|docs|test)\/[A-Za-z0-9._/-]+$/u;
function safeRef(value:string):boolean{
 return ref.test(value)&&!value.includes("..")&&!value.endsWith(".lock")&&
  value.split("/").every(part=>part!==""&&part!=="."&&part!=="..");
}
export function isYoloRoutinePush(command:string):boolean{
 if(command.length>512||/[;&|\x60$<>\\\r\n]/u.test(command))return false;
 const match=/^git\s+push\s+(?:(?:-u|--set-upstream)\s+)?origin\s+(\S+)\s*$/u.exec(command.trim());
 return !!match&&safeRef(match[1]!);
}
const commit=/^git\s+commit\s+(?:(?:-a|--all)\s+)?(?:-m|--message)\s+(?:"[A-Za-z0-9 ,.:_-]{1,120}"|'[A-Za-z0-9 ,.:_-]{1,120}')$/u;
const rebase=/^git\s+rebase\s+(?:(?:--autostash)\s+)?origin\/(?:main|master|develop|dev)(?:\s+--autostash)?$/u;
const fetch=/^git\s+fetch\s+origin(?:\s+(?:main|master|develop|dev))?$/u;
const routineRead=/^git\s+(?:status|diff|log)(?:\s+--(?:short|stat|oneline))?$/u;
const routineCheck=/^(?:(?:npm|pnpm|yarn)\s+(?:test|run\s+(?:test|check|typecheck|lint|build|verify))|(?:node)\s+--test)$/u;
const routinePR=/^gh\s+pr\s+create\s+--fill$/u;
const safeSegment=(part:string):boolean=>isYoloRoutinePush(part)||commit.test(part)||
 rebase.test(part)||fetch.test(part)||routineRead.test(part)||
 routineCheck.test(part)||routinePR.test(part);
/** Every segment must be a recognized literal safe command. */
export function isYoloRoutineDelivery(command:string):boolean{
 if(typeof command!=="string"||command.length===0||command.length>2048||
  /[\x60$<>\\\r\n|;]/u.test(command))return false;
 const pieces=command.split(/\s*&&\s*/u);
 if(pieces.length>6||pieces.some(x=>!x.trim()))return false;
 return pieces.every(x=>safeSegment(x.trim()));
}
/** Lexical defense-in-depth for literal sensitive shell paths, not a sandbox. */
export function isSensitiveShellAction(command:string):boolean{
 if(typeof command!=="string")return true;
 const files=/(?:^|[^\w])(?:\.env(?:\.[A-Za-z0-9_-]+)?|\.npmrc|\.netrc|id_rsa|id_ed25519|keychain|[^\s/\\]+\.(?:pem|key|p12|pfx))(?=$|[^A-Za-z0-9_-])/iu;
 const directories=/(?:^|[\/\\\s"'~])(?:\.ssh|\.aws|secrets)(?:[\/\\]|$)/iu;
 return files.test(command)||directories.test(command);
}

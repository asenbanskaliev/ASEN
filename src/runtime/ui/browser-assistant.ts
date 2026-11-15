import {randomBytes,timingSafeEqual} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import type {AddressInfo} from "node:net";

export type BrowserConsentOutcome="confirmed"|"cancelled"|"timeout";
export interface BrowserConsentRequest{
 readonly title:string;
 readonly lines:readonly string[];
 readonly timeoutMs?:number;
 /** Receives the one-time loopback URL. Production callers print it and optionally open it. */
 readonly onUrl:(url:string)=>void;
}

const escapeHtml=(value:string)=>value.replace(/[&<>"']/gu,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
const safeEqual=(left:string,right:string)=>{const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);};

/**
 * Local consent page: loopback-only, random port, unguessable path token, strict Host/Origin checks,
 * CSP nonce, a single decision, and a bounded lifetime. It authorizes one pending operation only.
 */
export async function requestBrowserConsent(request:BrowserConsentRequest):Promise<BrowserConsentOutcome>{
 const token=randomBytes(32).toString("base64url"),nonce=randomBytes(16).toString("base64url");
 return await new Promise<BrowserConsentOutcome>((resolve,reject)=>{
  let settled=false,port=0;
  const finish=(outcome:BrowserConsentOutcome)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   setTimeout(()=>server.close(),50).unref();
   server.closeAllConnections?.();
   resolve(outcome);
  };
  const hostOk=(req:IncomingMessage)=>req.headers.host===`127.0.0.1:${port}`||req.headers.host===`localhost:${port}`;
  const send=(res:ServerResponse,status:number,body:string,type="text/html; charset=utf-8")=>{
   res.writeHead(status,{"content-type":type,"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY",
    "content-security-policy":`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'`});
   res.end(body);
  };
  const page=()=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(request.title)}</title><style nonce="${nonce}">body{font:16px system-ui;margin:2rem auto;max-width:42rem}button{font:inherit;padding:.5rem 1rem;margin-right:.5rem}</style></head><body><h1>${escapeHtml(request.title)}</h1><ul>${request.lines.map(line=>`<li>${escapeHtml(line)}</li>`).join("")}</ul><p id="s">Waiting for your decision.</p><button id="y">Confirm</button><button id="n">Cancel</button><script nonce="${nonce}">const d=a=>fetch("/${token}/"+a,{method:"POST",headers:{"x-asen-token":"${token}"}}).then(()=>{document.getElementById("s").textContent=a==="confirm"?"Confirmed. You can close this tab.":"Cancelled. You can close this tab."});document.getElementById("y").onclick=()=>d("confirm");document.getElementById("n").onclick=()=>d("cancel");</script></body></html>`;
  const server=createServer((req,res)=>{
   if(!hostOk(req)||settled){send(res,403,"Forbidden","text/plain");return;}
   const url=new URL(req.url??"/","http://127.0.0.1");
   const segments=url.pathname.split("/").filter(Boolean);
   if(segments.length<1||!safeEqual(segments[0]!,token)){send(res,404,"Not found","text/plain");return;}
   if(req.method==="GET"&&segments.length===1){send(res,200,page());return;}
   if(req.method==="POST"&&segments.length===2&&(segments[1]==="confirm"||segments[1]==="cancel")){
    const origin=req.headers.origin;
    const originOk=origin===undefined||origin===`http://127.0.0.1:${port}`||origin===`http://localhost:${port}`;
    const header=req.headers["x-asen-token"];
    if(!originOk||typeof header!=="string"||!safeEqual(header,token)||req.headers["sec-fetch-site"]==="cross-site"){send(res,403,"Forbidden","text/plain");return;}
    send(res,200,"ok","text/plain");
    finish(segments[1]==="confirm"?"confirmed":"cancelled");return;
   }
   send(res,405,"Method not allowed","text/plain");
  });
  const timer=setTimeout(()=>finish("timeout"),request.timeoutMs??120_000);
  server.once("error",error=>{clearTimeout(timer);reject(error);});
  server.listen(0,"127.0.0.1",()=>{
   port=(server.address() as AddressInfo).port;
   request.onUrl(`http://127.0.0.1:${port}/${token}`);
  });
 });
}

/** Best-effort opener without a shell; failure only means the user opens the printed URL manually. */
export function openInBrowser(url:string,platform:NodeJS.Platform=process.platform):void{
 if(!/^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+$/u.test(url))return;
 const [command,args]=platform==="darwin"?["open",[url]]:platform==="win32"?["rundll32",["url.dll,FileProtocolHandler",url]]:["xdg-open",[url]];
 try{const child=spawn(command!,args as string[],{stdio:"ignore",detached:true,shell:false});child.once("error",()=>undefined);child.unref();}catch{/* manual URL remains available */}
}

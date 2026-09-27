import { spawn } from "node:child_process";
import type { AgentRequest, AgentResult, AgentRunner } from "./dispatcher.js";

export interface PiProcessOptions {
  command?: string;
  extraArgs?: string[];
}

export class PiProcessRunner implements AgentRunner {
  constructor(private readonly options: PiProcessOptions = {}) {}

  run(request: AgentRequest): Promise<AgentResult> {
    const command=this.options.command ?? "pi";
    const args=["--mode","rpc",...(this.options.extraArgs ?? [])];
    return new Promise((resolve) => {
      const child=spawn(command,args,{cwd:request.repository,stdio:["pipe","pipe","pipe"]});
      let stdout="", stderr="";
      child.stdout.on("data",(d)=>stdout+=String(d));
      child.stderr.on("data",(d)=>stderr+=String(d));
      child.on("error",(error)=>resolve({id:request.id,ok:false,output:String(error)}));
      child.on("close",(code)=>resolve({id:request.id,ok:code===0,output:stdout || stderr}));
      child.stdin.write(JSON.stringify({type:"prompt",message:request.prompt})+"\n");
      child.stdin.end();
    });
  }
}

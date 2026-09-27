import { validateWriteGrant, type WriteGrant } from "../policies/scopes.js";

export interface AgentRequest {
  id: string;
  role: "explorer" | "worker" | "reviewer" | "verifier";
  prompt: string;
  repository: string;
  writeSurfaces?: string[];
  isolationKey?: string;
}

export interface AgentResult {
  id: string;
  ok: boolean;
  output: string;
}

export interface AgentRunner {
  run(request: AgentRequest): Promise<AgentResult>;
}

export class Dispatcher {
  readonly #active: WriteGrant[] = [];
  constructor(private readonly runner: AgentRunner) {}

  async dispatch(request: AgentRequest): Promise<AgentResult> {
    let grant: WriteGrant | undefined;
    if (request.writeSurfaces) {
      grant = { agentId: request.id, repository: request.repository, surfaces: request.writeSurfaces };
      if (request.isolationKey) grant.isolationKey = request.isolationKey;
      validateWriteGrant(grant, this.#active);
      this.#active.push(grant);
    }
    try { return await this.runner.run(request); }
    finally {
      if (grant) {
        const i=this.#active.indexOf(grant);
        if (i >= 0) this.#active.splice(i,1);
      }
    }
  }
}

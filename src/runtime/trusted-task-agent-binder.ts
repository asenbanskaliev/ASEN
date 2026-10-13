import type {AgentRuntime,AgentSessionIdentity} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore,TaskAgentLink} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

/**
 * Trusted correlation boundary. This method NEVER creates, starts or resumes an
 * agent. The caller must supply an already-persisted agent and Todo ID.
 * A crash before the link write leaves an unlinked agent, never a phantom grant.
 */
export class TrustedTaskAgentBinder{
 constructor(private readonly todos:Pick<SessionTodoStore,"list">,private readonly agents:Pick<AgentRuntime,"query">,private readonly links:Pick<TaskAgentLinkStore,"bind">){}
 async bind(taskId:string,agentId:string,identity:AgentSessionIdentity):Promise<TaskAgentLink>{
  const [tasks,agent]=await Promise.all([this.todos.list(identity),this.agents.query(agentId,identity)]);
  if(!tasks.some(task=>task.taskId===taskId)||!agent||agent.record.id!==agentId||
    agent.record.sessionId!==identity.sessionId||!sameWorkspaceIdentityPath(agent.record.projectId,identity.projectId))
   throw new Error("ASEN task-agent correlation requires matching durable ownership");
  return this.links.bind({taskId,agentId,sessionId:identity.sessionId,projectId:identity.projectId,createdAt:new Date().toISOString()});
 }
}

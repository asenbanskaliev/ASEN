import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";

/**
 * A read-only projection. A task is never completed because an agent completes.
 * Only exact, session-scoped orchestrator IDs (taskId:role) are correlated.
 * Pi agent IDs are opaque; do not guess their parent from prompts or timestamps.
 */
export class TaskAgentCoordinator {
 constructor(private readonly todos:Pick<SessionTodoStore,"list"|"history">,private readonly agents:Pick<AgentRuntime,"list">){}
 async snapshot(identity:AgentSessionIdentity){
  const [tasks,agents]=await Promise.all([this.todos.list(identity),this.agents.list(identity)]);
  return {tasks:tasks.map(task=>({
   id:task.taskId,title:task.title,state:task.current.state,revision:task.current.revision,
   agents:agents.filter(agent=>agent.sessionId===identity.sessionId&&agent.projectId===identity.projectId&&
    ["explorer","worker","reviewer","verifier"].some(role=>agent.id===task.taskId+":"+role&&agent.role===role))
    .map(agent=>({id:agent.id,role:agent.role,state:agent.state})),
  }))};
 }
 async task(taskId:string,identity:AgentSessionIdentity){
  const view=await this.snapshot(identity);
  const item=view.tasks.find(task=>task.id===taskId);
  if(!item)return null;
  return {...item,history:await this.todos.history(taskId,identity)};
 }
}

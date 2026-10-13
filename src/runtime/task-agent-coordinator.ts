import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";

/**
 * Read-only coordination projection. Neither plans nor agent completion
 * confer execution authority or change a parent task's state.
 * Existing stores remain independent sources of truth.
 */
export class TaskAgentCoordinator {
 constructor(private readonly todos:Pick<SessionTodoStore,"list"|"history">,private readonly agents:Pick<AgentRuntime,"list"|"query">){}
 async snapshot(identity:AgentSessionIdentity){
  const [tasks,agents]=await Promise.all([this.todos.list(identity),this.agents.list(identity)]);
  return {tasks:tasks.map(task=>({
   id:task.taskId,title:task.title,state:task.current.state,revision:task.current.revision,
   agents:agents.filter(agent=>agent.id.startsWith(task.taskId+":")).map(agent=>({
    id:agent.id,role:agent.role,state:agent.state,
   })),
  }))};
 }
 async task(taskId:string,identity:AgentSessionIdentity){
  const tasks=await this.todos.list(identity),task=tasks.find(item=>item.taskId===taskId);
  if(!task)return null;
  const [history,agents]=await Promise.all([this.todos.history(taskId,identity),this.agents.list(identity)]);
  return {id:task.taskId,title:task.title,state:task.current.state,history,
   agents:agents.filter(agent=>agent.id.startsWith(taskId+":")).map(agent=>({
    id:agent.id,role:agent.role,state:agent.state,
   }))};
 }
}

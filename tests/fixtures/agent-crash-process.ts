import {PersistentAgentStore} from "../../src/runtime/agent-store.js";

const [file, mode, parentId, sessionArg, projectArg, taskArg] = process.argv.slice(2);
if (!file || !["running", "pair", "continue-running"].includes(mode ?? "")) throw new Error("Expected store path and a supported crash mode");
const { store } = await PersistentAgentStore.open(file, () => mode === "continue-running" ? "2026-10-10T10:00:02.000Z" : "2026-10-10T10:00:00.000Z");
const sessionId = sessionArg && sessionArg !== "-" ? sessionArg : "session-crash", projectId = projectArg && projectArg !== "-" ? projectArg : "/repo", taskId = taskArg && taskArg !== "-" ? taskArg : "crash-recovery-task";
if (mode === "continue-running") {
  if (!parentId) throw new Error("Expected parent task ID");
  const parent = await store.get(parentId, sessionId, projectId);
  if (!parent) throw new Error("Parent task was not found");
  const continuation = await store.enqueueContinuation(parentId, sessionId, projectId, { kind: "user", id: `pi:${sessionId}` });
  await store.running(continuation.id, "2026-10-10T10:00:03.000Z");
  process.exit(0);
}
const request = {
  id: taskId,
  role: "explorer" as const,
  prompt: "inspect the project",
  repository: projectId,
  isolationKey: sessionId,
  owner: { kind: "user" as const, id: `pi:${sessionId}` },
};
if (mode === "pair") {
  const queued = { ...request, id: "queued-before-crash" };
  await store.enqueue(queued, queued.owner);
}
await store.enqueue(request, request.owner);
await store.running(request.id, "2026-10-10T10:00:01.000Z");
process.exit(0);

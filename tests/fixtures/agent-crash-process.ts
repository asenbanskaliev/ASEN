import {PersistentAgentStore} from "../../src/runtime/agent-store.js";

const [file, mode] = process.argv.slice(2);
if (!file || mode !== "running") throw new Error("Expected store path and running mode");
const { store } = await PersistentAgentStore.open(file, () => "2026-10-10T10:00:00.000Z");
const request = {
  id: "crash-recovery-task",
  role: "explorer" as const,
  prompt: "inspect the project",
  repository: "/repo",
  isolationKey: "session-crash",
  owner: { kind: "user" as const, id: "pi:session-crash" },
};
await store.enqueue(request, request.owner);
await store.running(request.id, "2026-10-10T10:00:01.000Z");
process.exit(0);

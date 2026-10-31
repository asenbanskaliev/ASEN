import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

/** Best-effort whole-tree termination. On POSIX systems, the primary PID is also the process group leader. */
export function terminateManagedChildTree(child: ChildProcess): void {
 if(child.pid===undefined||child.pid===null) return;
 try {
  if(process.platform === "win32") {
   const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
   killer.once("error", () => undefined);
  } else {
   try { process.kill(-child.pid, "SIGKILL"); } catch { /* The group may already be gone. */ }
  }
  child.kill("SIGKILL");
 } catch {
  // Signal delivery races (already_exited) are expected and harmless.
 }
}

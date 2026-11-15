import {sanitizeTerminalText,truncateForTerminal} from "../responsive-layout.js";

export interface StartupPhase{
 readonly id:string;
 /** Repository module that owns this step today. */
 readonly owner:string;
 readonly does:string;
 readonly fails:string;
}

/**
 * The real order of `runAsen` in src/cli.ts, declared once.
 * A later phase never runs before an earlier one, and a refusal in a phase ends the launch.
 * This table is descriptive: nothing here executes, reorders or authorizes anything.
 */
export const ASEN_STARTUP_PHASES:readonly StartupPhase[]=Object.freeze([
 Object.freeze({id:"lifecycle",owner:"src/runtime/lifecycle/lifecycle-cli.ts",
  does:"Handles the signed install lifecycle and the home backup/restore commands before ASEN parses any other shape.",
  fails:"Returns its own exit code; a defined code ends the launch and nothing downstream runs."}),
 Object.freeze({id:"managed-parse",owner:"src/runtime/lifecycle/launcher.ts",
  does:"Reads the managed update, backup preview, doctor, selection and run argument shapes in order, and stops at the first match.",
  fails:"An invalid shape prints that command's usage and exits 2; the parsers after it are skipped."}),
 Object.freeze({id:"arguments",owner:"src/runtime/lifecycle/launcher.ts",
  does:"Parses ASEN selectors and the remaining Pi arguments after Pi value literals are hidden and then restored.",
  fails:"A conflicting --link/--isolated/--home prints the error and exits 2; --help and --version print and exit 0."}),
 Object.freeze({id:"command-branch",owner:"src/cli.ts",
  does:"Runs the single command the arguments selected: startup, setup, managed stage, managed update preview, backup preview, doctor, managed select, managed run or home.",
  fails:"Each branch reports its own refusal and exit code; the startup branch prints only and exits 0."}),
 Object.freeze({id:"launcher-config",owner:"src/runtime/lifecycle/launcher.ts",
  does:"Reads the stored launcher configuration so an explicit selector can be written down once.",
  fails:"An unreadable configuration prints the launcher-configuration refusal and exits 2."}),
 Object.freeze({id:"home-resolution",owner:"src/runtime/lifecycle/launcher.ts",
  does:"Resolves the ASEN home from the flag, then the stored configuration, then the environment, then the default.",
  fails:"There is no silent fallback: a rejected selector is reported by the arguments phase instead."}),
 Object.freeze({id:"pi-runtime",owner:"src/runtime/lifecycle/launcher.ts",
  does:"Resolves the Pi runtime from ASEN_PI, the bundled copy, or ASEN_PI_ON_PATH.",
  fails:"Prints the Pi-runtime-not-found refusal and exits 1."}),
 Object.freeze({id:"argument-guard",owner:"src/cli.ts",
  does:"Scans the remaining Pi arguments for the -- terminator and for the Pi options that consume the next value.",
  fails:"It does not refuse; it decides whether a later resource flag could hide a value."}),
 Object.freeze({id:"extension-declaration",owner:"src/cli.ts",
  does:"Reads the selected home settings and decides whether ASEN must declare its own package to Pi.",
  fails:"An unreadable settings file counts as declared, and an explicit discovery opt-out is never overridden."}),
 Object.freeze({id:"spawn",owner:"src/cli.ts",
  does:"Starts Pi with PI_CODING_AGENT_DIR and ASEN_PACKAGE_ROOT set to the resolved values.",
  fails:"A spawn error exits 1, and Pi's own exit code is propagated unchanged."}),
]);

const clean=(value:string,max=600)=>sanitizeTerminalText(value).replace(/\s+/gu," ").trim().slice(0,max);

/** Read-only projection of the ordered startup sequence. Nothing in this view executes. */
export function renderStartupFlow(width=100):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid startup flow width");
 const rows:string[]=[
  "ASEN startup · "+ASEN_STARTUP_PHASES.length+" ordered phases · read-only projection",
  "This order mirrors runAsen in src/cli.ts. It is descriptive only: nothing in this view executes.",
 ];
 ASEN_STARTUP_PHASES.forEach((phase,index)=>{
  rows.push(String(index+1).padStart(2," ")+". "+clean(phase.id,40)+" · "+clean(phase.owner,90));
  rows.push("    Does: "+clean(phase.does));
  rows.push("    Fails: "+clean(phase.fails));
 });
 rows.push("One table owns the CLI surface: src/runtime/lifecycle/cli-usage.ts generates the asen help text.");
 return Object.freeze(rows.map(row=>truncateForTerminal(row,width)));
}

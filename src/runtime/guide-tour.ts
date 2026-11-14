import {effectiveKey} from "./keymaps.js";

// Guided tours: the pure half of the reference shell's gentle-guide contract, ported for ASEN. A
// tour is an index over a list of steps; nothing here touches the terminal, an overlay or a
// registration, so the extension host owns placement and key handling while these functions stay
// deterministic and testable. The optional `requires` slot keeps a step invisible when the command
// or tool it teaches is absent, which is what makes one static list safe across installations.

export type GuideRegion="center"|"editor"|"sidebar";
export type GuideMode="local"|"agent";
/** How a tour ended: the last step advanced past, the user stopped it, or it moved region. */
export type GuideResult="finished"|"ended"|"moved";

export interface GuideStep{
 id:string;
 title:string;
 body:string;
 region:GuideRegion;
 /** Slash command to try, shown as `/name`. Never executed by this module. */
 command?:string;
 /** Keymap action id whose live key is shown next to the command. */
 keymap?:string;
 /** Command OR tool name that must exist for this step to be shown at all. */
 requires?:string;
}

/**
 * The steps of one tour plus the position in it. Index is the only state, so a caller may keep the
 * same instance across a relocation or a mode change.
 */
export class GuideTour{
 #steps:readonly GuideStep[];
 #index=0;

 constructor(steps:readonly GuideStep[]){
  if(steps.length===0)throw new Error("A tour needs at least one step.");
  this.#steps=steps;
 }

 /** The step the user is on; the index never leaves the list. */
 current():GuideStep{
  const step=this.#steps[this.#index];
  if(step===undefined)throw new RangeError("The guide tour has no step at this position.");
  return step;
 }

 /** 1-based position, so it can be shown to the user as it is. */
 position():number{return this.#index+1;}

 isLast():boolean{return this.#index===this.#steps.length-1;}

 /** Advance, or report that the tour is already at its last step. */
 next():boolean{
  if(this.isLast())return false;
  this.#index+=1;
  return true;
 }

 /** Rewind, or report that the tour is already at its first step. */
 previous():boolean{
  if(this.#index===0)return false;
  this.#index-=1;
  return true;
 }

 /** Jump to a step by id, or leave the tour where it stands when the id is unknown. */
 show(id:string):boolean{
  const index=this.#steps.findIndex(step=>step.id===id);
  if(index<0)return false;
  this.#index=index;
  return true;
 }

 getSteps():readonly GuideStep[]{return this.#steps;}
}

/** The steps that apply to what is actually registered, in tour order. */
export function filterGuideSteps(available:ReadonlySet<string>,steps?:readonly GuideStep[]):GuideStep[]{
 return (steps??[]).filter(step=>!step.requires||available.has(step.requires));
}

/** The widest popover the reference layout uses, and the narrowest one it still renders. */
export const GUIDE_POPOVER_WIDTH=56;
export const MIN_POPOVER_WIDTH=40;
/** Rows a bottom-anchored popover lifts above the editor, so it never covers what the user types. */
export const EDITOR_OFFSET_ROWS=6;

export interface GuidePlacement{
 anchor:"center"|"bottom-center"|"right-center";
 width:number;
 offsetX?:number;
 offsetY?:number;
 /** Agent mode shows the step beside the chat without ever taking keyboard focus. */
 nonCapturing:boolean;
}

function guidePopoverWidth(columns:number):number{
 return Math.min(GUIDE_POPOVER_WIDTH,Math.max(MIN_POPOVER_WIDTH,columns-4));
}

/** Where a step's popover goes for its region and the current terminal layout. */
export function guidePlacement(region:GuideRegion,columns:number,railColumns:number|undefined,mode:GuideMode):GuidePlacement{
 const width=guidePopoverWidth(columns);
 const nonCapturing=mode==="agent";
 if(region==="sidebar"&&railColumns!==undefined)return{anchor:"right-center",width,offsetX:-(railColumns+1),nonCapturing};
 if(region==="editor")return{anchor:"bottom-center",width,offsetY:-EDITOR_OFFSET_ROWS,nonCapturing};
 return{anchor:"center",width,nonCapturing};
}

/** What the user can try here: the command, the live key, or both; empty when neither applies. */
export function guideTryLine(step:GuideStep,env:NodeJS.ProcessEnv=process.env):string{
 const parts:string[]=[];
 if(step.command)parts.push(`/${step.command}`);
 const key=step.keymap?effectiveKey(step.keymap,env):undefined;
 if(key)parts.push(key);
 return parts.length?`Try: ${parts.join(" · ")}`:"";
}

/**
 * The text-only form of the current step, for agent narration and headless sessions: position,
 * title, body, what to try, and what comes next.
 */
export function guideStepText(tour:GuideTour,env:NodeJS.ProcessEnv=process.env):string{
 const step=tour.current();
 const steps=tour.getSteps();
 const lines=[`Step ${tour.position()}/${steps.length} · ${step.title}`,step.body];
 const tryLine=guideTryLine(step,env);
 if(tryLine)lines.push(tryLine);
 const upcoming=steps[tour.position()];
 lines.push(upcoming?`Next: ${upcoming.title}`:"This is the last step");
 return lines.join("\n");
}

/** The ASEN tour: only the first, second and last step are unconditional. */
export const ASEN_GUIDE_STEPS:readonly GuideStep[]=[
 {id:"welcome",title:"Welcome to ASEN",body:"A short tour of the workbench. Right arrow or Enter advances, left arrow goes back, and esc ends it whenever you like.",region:"center"},
 {id:"prompt",title:"The prompt",body:"This is where you type. Enter sends the message, shift+Enter adds a line, and every ASEN command starts with a slash.",region:"editor"},
 {id:"palette",title:"Command palette",body:"Search every registered command in one list and see the key it is on. The palette only writes the command into the prompt; it never runs anything for you.",region:"center",command:"asen-palette",keymap:"commands",requires:"asen-palette"},
 {id:"profiles",title:"Profiles",body:"A profile switches model, reasoning effort and permission mode in one step, with a fallback chain behind it.",region:"center",command:"asen-profiles",requires:"asen-profiles"},
 {id:"agents",title:"Agents",body:"The agents panel lists running and finished subagents, their state, and how to inspect or stop one you own.",region:"sidebar",command:"asen-agents",keymap:"agents.view",requires:"asen-agents"},
 {id:"todos",title:"Task list",body:"The task list shows the plan for the current work and the status of every step in it.",region:"sidebar",command:"asen-todos",requires:"asen-todos"},
 {id:"changes",title:"Changes",body:"Browse the working diff file by file, with the exact lines each change touches, before anything is accepted.",region:"editor",command:"asen-changes-view",keymap:"changes",requires:"asen-changes-view"},
 {id:"review",title:"Review",body:"Review collects the candidate, its risk tier and the evidence behind it, and tells you what is still missing.",region:"center",command:"asen-review",requires:"asen-review"},
 {id:"customize",title:"Customize",body:"Change settings such as language, banner and presentation without editing a config file by hand.",region:"center",command:"asen-customize",requires:"asen-customize"},
 {id:"keymaps",title:"Keymaps",body:"Every ASEN shortcut has one registry. Reassign a key here, then reload; a key Pi reserves is refused instead of stolen.",region:"center",command:"asen-customize",requires:"asen-customize"},
 {id:"usage",title:"Usage",body:"Usage reports the measured counters for this session: tokens, cost and what is still unknown.",region:"center",command:"asen-usage",keymap:"usage",requires:"asen-usage"},
 {id:"diagnostics",title:"Diagnostics",body:"Doctor runs the local checks and names what is missing or broken, without changing anything.",region:"center",command:"asen-doctor",requires:"asen-doctor"},
 {id:"end",title:"That's the tour",body:"You can start it again anytime. The command palette lists every command shown here.",region:"center"},
] as const;

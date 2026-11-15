export interface ShortcutBinding{action:string;key:string;available:boolean}
const KEY=/^(?:ctrl|alt|shift|meta)(?:\+(?:ctrl|alt|shift|meta))*\+[a-z0-9.,/;'-]$/i;
export function validateShortcuts(bindings:readonly ShortcutBinding[]):void{const keys=new Set<string>(),actions=new Set<string>();for(const b of bindings){const key=b.key.toLowerCase();if(!b.action||!KEY.test(key))throw new Error("Invalid shortcut");if(keys.has(key)||actions.has(b.action))throw new Error("Shortcut conflict");keys.add(key);actions.add(b.action);}}
export function resolveShortcut(bindings:readonly ShortcutBinding[],key:string):string|undefined{validateShortcuts(bindings);return bindings.find(b=>b.available&&b.key.toLowerCase()===key.toLowerCase())?.action;}
export const ASEN_SHORTCUTS:readonly ShortcutBinding[]=[
 {action:"open-command-palette",key:"ctrl+p",available:false},
 {action:"open-agents",key:"ctrl+a",available:false},
 {action:"open-workspace",key:"ctrl+w",available:false},
 {action:"cancel-dialog",key:"ctrl+c",available:true}
] as const;

export type LayoutMode="wide"|"compact"|"narrow"|"minimum";
export function layoutMode(columns:number):LayoutMode{if(!Number.isSafeInteger(columns)||columns<1)throw new Error("Terminal width is invalid");return columns>=100?"wide":columns>= seventy?"compact":columns>= fifty?"narrow":"minimum";}
const seventy=70,fifty=50;
export function truncateForTerminal(value:string,columns:number):string{const width=Math.max(1,columns);return value.length<=width?value:`${value.slice(0,Math.max(0,width-1))}…`;}


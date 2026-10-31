import {lstatSync, realpathSync} from "node:fs";
import {dirname, join, resolve} from "node:path";

export function canonicalPathSync(lexicalTarget: string): string {
 const lexical = lexicalTarget;
 if (!lexical || lexical.includes("\0")) throw new Error("invalid path");
 const suffix: string[] = [];
 let candidate = lexical;
 for (;;) {
  try {
   return join(realpathSync(candidate), ...suffix.reverse());
  } catch (error) {
   try {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (lstatSync(candidate).isSymbolicLink()) throw new Error("unresolvable symbolic link");
   } catch (metadataError) {
    if ((metadataError as NodeJS.ErrnoException).code !== "ENOENT") throw metadataError;
   }
   const parent = dirname(candidate);
   if (parent === candidate) throw error;
   suffix.push(candidate.slice(parent.length).replace(/^[/\\]/, ""));
   candidate = parent;
  }
 }
}

export async function canonicalPathAsync(lexicalTarget: string): Promise<string> {
 return canonicalPathSync(lexicalTarget);
}

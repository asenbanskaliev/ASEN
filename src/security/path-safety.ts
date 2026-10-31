import {lstatSync, realpathSync} from "node:fs";
import {dirname, join} from "node:path";
import path from "node:path";

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


export function sensitiveName(value:string):boolean{
 const name=process.platform==="win32"?value.toLowerCase():value;
 return name===".git"||name.startsWith(".env")||name.endsWith(".pem")||name.endsWith(".key")||name===".npmrc"||name===".netrc"||name===".pypirc"||name===".aws"||name===".ssh"||name==="id_rsa"||name.startsWith("id_ed25519")||name.endsWith(".p12")||name.endsWith(".pfx");
}
export function sensitivePath(value:string):boolean{
 const normalized=path.normalize(value.replace(/\\/g,"/"));
 return sensitiveName(normalized)||/\/\.docker\/config\.json$/iu.test(normalized)||/\/\.aws\/.+/iu.test(normalized)||/\/\.ssh\/.+/iu.test(normalized)||/\/\.netrc$/iu.test(normalized);
}
export function hasSensitiveName(value:string):boolean{
 const normalized=path.normalize(value),root=path.parse(normalized).root;
 return normalized.slice(root.length).split(path.sep).filter(Boolean).some(sensitiveName)||sensitivePath(normalized);
}

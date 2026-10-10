import {createRequire} from "node:module";
import {readFileSync,existsSync,readdirSync,realpathSync} from "node:fs";
import {join,relative,resolve,sep} from "node:path";

/** Exercise Node's public package resolver against an actually installed packed artifact. */
export function verifyPublicExports(installationRoot) {
  installationRoot=realpathSync(installationRoot);
  const root=realpathSync(join(installationRoot,"node_modules","asen")), pkg=JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
  const require=createRequire(join(installationRoot,"package-probe.cjs")),checked=[];
  if(!pkg.exports||typeof pkg.exports!=="object")throw new Error("Package needs explicit public exports");
  for(const [key,target] of Object.entries(pkg.exports)) {
    if(typeof target!=="string"||!key.startsWith("./")||!target.startsWith("./"))throw new Error("Unsupported public export shape");
    const cases=key.includes("*") ? readdirSync(join(root,"skills"),{withFileTypes:true}).filter(row=>row.isDirectory()).map(row=>key.replace("*",row.name)) : [key];
    if(!cases.length)throw new Error("Public wildcard export has no packed cases");
    for(const subpath of cases) {
      const specifier="asen/"+subpath.slice(2),resolved=require.resolve(specifier),actual=existsSync(resolved)?realpathSync(resolved):resolved,expected=resolve(root,target.replace("*",subpath.slice(key.indexOf("*"))));
      if(!existsSync(actual)||relative(root,actual).startsWith(".."+sep)||actual!==expected)throw new Error(`Packed public export mismatch: ${specifier}`);
      checked.push(specifier);
    }
  }
  for(const specifier of ["asen/src/core/types.js","asen/package.json","asen/extensions/authority.ts","asen/unknown","asen/dist/cli.js","asen/src/cli.ts","asen/extensions/asen.ts","asen/skills"]){
    try{require.resolve(specifier);throw new Error(`Undeclared path resolved: ${specifier}`);}
    catch(error){if(error.code!=="ERR_PACKAGE_PATH_NOT_EXPORTED")throw error;}
  }
  return checked;
}

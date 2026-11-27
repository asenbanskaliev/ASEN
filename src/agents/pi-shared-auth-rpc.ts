/** Entrada RPC aislada para alternativas OAuth. Usa la API pública de Pi
 * con la ruta original de credenciales y ajustes privados, sin duplicar tokens.
 * Solo la instalación nativa seleccionada por PiProcessRunner puede cargarla.
 */
import {readFileSync,realpathSync,lstatSync} from "node:fs";
import {isAbsolute,join} from "node:path";
import type * as PiSdk from "@earendil-works/pi-coding-agent";

type Launch={sdk:string;authPath:string;agentDir:string;cwd:string;model:string;thinking?:Parameters<typeof PiSdk.createAgentSessionFromServices>[0]["thinkingLevel"];tools:string[];extensions:string[];skills:string[]};
async function main():Promise<void>{
 const file=process.argv[2];
 if(!file||process.argv.length!==3||!isAbsolute(file)||!lstatSync(file).isFile())throw Error("Invalid launch");
 const input=JSON.parse(readFileSync(file,"utf8")) as Launch;
 if(!input||!input.sdk.startsWith("file:")||!isAbsolute(input.authPath)||!isAbsolute(input.agentDir)||!isAbsolute(input.cwd)||input.agentDir!==process.env.PI_CODING_AGENT_DIR||!input.model||!Array.isArray(input.tools)||input.tools.some(tool=>!["read","edit","write"].includes(tool))||!Array.isArray(input.extensions)||input.extensions.length<1||input.extensions.length>2||!Array.isArray(input.skills))throw Error("Invalid launch");
 const cwd=realpathSync(input.cwd),authPath=realpathSync(input.authPath);
 if(!lstatSync(authPath).isFile())throw Error("Invalid credential store");
 process.env.PI_CODING_AGENT="true";process.env.AI_AGENT="pi";
 const pi=await import(input.sdk) as typeof PiSdk;
 const settings=pi.SettingsManager.create(cwd,input.agentDir,{projectTrusted:false});
 const network=settings.getGlobalSettings();
 if(network.httpProxy!==undefined||network.httpIdleTimeoutMs!==undefined)throw Error("Unsupported shared-auth HTTP configuration");
 const retry=settings.getRetrySettings();
 if(retry.enabled||retry.maxRetries!==0||settings.getProviderRetrySettings().maxRetries!==0||settings.getCompactionEnabled())throw Error("Unsafe retry settings");
 const modelRuntime=await pi.ModelRuntime.create({authPath,modelsPath:join(input.agentDir,"models.json"),allowModelNetwork:false});
 const services=await pi.createAgentSessionServices({cwd,agentDir:input.agentDir,settingsManager:settings,modelRuntime,resourceLoaderOptions:{noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,disabledBuiltinExtensions:["mcp"],additionalExtensionPaths:input.extensions,additionalSkillPaths:input.skills}});
 if(services.diagnostics.some(item=>item.type==="error"))throw Error("Pi services rejected");
 const slash=input.model.indexOf("/");if(slash<1)throw Error("Exact model required");
 const provider=input.model.slice(0,slash),id=input.model.slice(slash+1);
 const model=modelRuntime.getModel(provider,id)??(provider==="nvidia"?modelRuntime.getModel(provider,input.model):undefined);
 if(!model||model.provider!==provider||model.id!==id&&!(provider==="nvidia"&&model.id===input.model)||!modelRuntime.hasConfiguredAuth(provider))throw Error("Exact model unavailable");
 const sessionManager=pi.SessionManager.inMemory(cwd);
 let created=false;
 const runtime=await pi.createAgentSessionRuntime(async target=>{
  if(created||target.cwd!==cwd||target.agentDir!==input.agentDir||target.sessionManager!==sessionManager)throw Error("OAuth child cannot change execution scope");
  created=true;
  const session=await pi.createAgentSessionFromServices({services,sessionManager,model,...(input.thinking===undefined?{}:{thinkingLevel:input.thinking}),...(input.tools.length===0?{noTools:"all" as const}:{tools:input.tools})});
  return {...session,services,diagnostics:services.diagnostics};
 },{cwd,agentDir:input.agentDir,sessionManager});
 await pi.runRpcMode(runtime);
}
// Los errores del SDK pueden contener datos de configuración. No imprimirlos.
void main().catch(()=>{process.stderr.write("ASEN: no se pudo iniciar Pi RPC con el almacén OAuth compartido.\n");process.exitCode=1;});

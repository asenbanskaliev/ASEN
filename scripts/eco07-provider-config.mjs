const PROVIDERS=Object.freeze({
 openrouter:{credential:"OPENROUTER_API_KEY",model:"nvidia/nemotron-3.5-lightning:free"},
 groq:{credential:"GROQ_API_KEY",model:"openai/gpt-oss-120b"},
 llm7:{credential:"LLM7_API_KEY",model:"default",extension:"npm:pi-free@2.8.4"},
});

/** Resolve an explicitly supported ECO-07 provider without exposing credentials in errors. */
export function resolveEco07Provider(environment){
 const provider=environment.ASEN_ECO07_PROVIDER??"openrouter";
 if(!Object.hasOwn(PROVIDERS,provider))throw new Error("Unsupported ECO-07 provider");
 const config=PROVIDERS[provider],apiKey=environment[config.credential];
 if(typeof apiKey!=="string"||apiKey.length===0)throw new Error(`${provider} API key is unavailable to the ECO-07 Actions job`);
 const model=environment.ASEN_ECO07_MODEL??config.model;
 if(typeof model!=="string"||model.length===0||model!==model.trim()||/[\u0000-\u001f\u007f]/.test(model))throw new Error("Invalid ECO-07 model selection");
 if(config.extension&&environment.ASEN_ECO07_PROVIDER_EXTENSION!==config.extension)
  throw new Error("ECO-07 LLM7 requires the pinned Pi Free provider extension");
 if(!config.extension&&environment.ASEN_ECO07_PROVIDER_EXTENSION!==undefined)
  throw new Error("Unexpected ECO-07 provider extension");
 return Object.freeze({provider,model,apiKey,credential:config.credential,...(config.extension?{extension:config.extension}:{})});
}

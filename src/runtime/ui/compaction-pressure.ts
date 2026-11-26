/** Cálculo informativo G02. No ejecuta compactación, lee archivos ni concede autoridad.
 * Los valores por defecto corresponden al contrato de configuración Pi 1.6.
 * El anfitrión debe aportar una configuración real y compatible; no se inventa
 * un porcentaje a partir de la ocupación general de la ventana. */
export type CompactionPressure=Readonly<
 |{state:"unknown";reason:"settings"|"model"|"usage"|"threshold"}
 |{state:"off"}
 |{state:"available";usedTokens:number;windowTokens:number;reserveTokens:number;
 thresholdTokens:number;remainingTokens:number;percent:number;atOrAboveThreshold:boolean}
>;
const DEFAULT_RESERVE=16_384;
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const count=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
const setting=(value:unknown):value is number|undefined=>value===undefined||count(value);
const unknown=(reason:Extract<CompactionPressure,{state:"unknown"}>["reason"]):CompactionPressure=>Object.freeze({state:"unknown",reason});
export function projectCompactionPressure(input:Readonly<{
 settings:unknown;model?:unknown;usage:unknown;
}>):CompactionPressure{
 try{
  const settings=input.settings;
  if(!record(settings))return unknown("settings");
  const cfg=settings.compaction===undefined?{}:settings.compaction;
  if(!record(cfg))return unknown("settings");
  const enabled=cfg.enabled===undefined?true:cfg.enabled;
  if(enabled===false)return Object.freeze({state:"off"});
  if(enabled!==true)return unknown("settings");
  const overrides=cfg.modelOverrides;
  if(overrides!==undefined&&overrides!==null&&!record(overrides))return unknown("settings");
  let override:Record<string,unknown>={};
  if(record(overrides)&&Object.keys(overrides).length){
   const model=input.model;
   if(!record(model)||typeof model.provider!=="string"||!model.provider||typeof model.id!=="string"||!model.id)return unknown("model");
   const key=model.provider+"/"+model.id;
   if(Object.hasOwn(overrides,key)){
    const value=overrides[key];
    if(!record(value))return unknown("settings");
    override=value;
   }
  }
  // Validar también el valor general si prevalece una excepción por modelo.
  // keepRecentTokens no es el umbral de inicio, pero su invalidez impide
  // asegurar que Pi aceptaría esta misma configuración.
  if(!setting(cfg.reserveTokens)||!setting(override.reserveTokens)||
   !setting(cfg.keepRecentTokens)||!setting(override.keepRecentTokens))return unknown("settings");
  const reserve=override.reserveTokens??cfg.reserveTokens??DEFAULT_RESERVE;
  const usage=input.usage;
  if(!record(usage)||!count(usage.tokens)||!count(usage.contextWindow)||usage.contextWindow===0)return unknown("usage");
  const threshold=usage.contextWindow-reserve;
  if(threshold<=0)return unknown("threshold");
  return Object.freeze({state:"available",usedTokens:usage.tokens,windowTokens:usage.contextWindow,reserveTokens:reserve,
   thresholdTokens:threshold,remainingTokens:Math.max(0,threshold-usage.tokens),
   percent:Math.min(100,100*(usage.tokens/threshold)),atOrAboveThreshold:usage.tokens>=threshold});
 }catch{return unknown("settings");}
}

/** Indica cercanía al umbral, nunca una compactación en curso ni una orden. */
export function compactionPressureLabel(value:CompactionPressure):string{
 if(value.state==="unknown")return "compact. ?";
 if(value.state==="off")return "compact. desact.";
 return (value.atOrAboveThreshold?"! ":"")+"compact. "+Math.round(value.percent)+"%";
}

/** Sondeo acotado de ajustes efectivos. Solo lee ajustes/uso y avisa si cambia la presión. */
export function createCompactionPressureObserver(options:Readonly<{
 read:()=>CompactionPressure|undefined;
 initial?:CompactionPressure|undefined;
 current:()=>boolean;
 onChange:()=>void;
 intervalMs?:number;
 schedule?:(callback:()=>void,delayMs:number)=>ReturnType<typeof setTimeout>;
 cancel?:(timer:ReturnType<typeof setTimeout>)=>void;
}>):Readonly<{stop:()=>void}>{
 const requested=options.intervalMs??5000;
 if(!Number.isFinite(requested)||requested<0)throw new Error("G02: intervalo de observación no válido");
 const intervalMs=Math.max(1000,Math.min(30000,Math.floor(requested)));
 const schedule=options.schedule??((callback,delay)=>setTimeout(callback,delay));
 const cancel=options.cancel??(timer=>clearTimeout(timer));
 const fingerprint=(value:CompactionPressure|undefined):string=>{
  try{return JSON.stringify(value)??"undefined";}catch{return "unserializable";}
 };
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 let initialized=Object.hasOwn(options,"initial");
 let last=initialized?fingerprint(options.initial):"";
 const isCurrent=()=>{try{return options.current();}catch{return false;}};
 const stop=()=>{stopped=true;if(timer!==undefined)cancel(timer);timer=undefined;};
 const poll=()=>{
  if(stopped)return;
  if(!isCurrent()){stop();return;}
  try{
   const next=fingerprint(options.read());
   if(initialized&&next!==last){
    last=next;
    try{options.onChange();}catch{/* Una vista de estado no puede interrumpir Pi. */}
   }else{last=next;initialized=true;}
  }catch{
   const next="read-error";
   if(initialized&&next!==last){
    last=next;
    try{options.onChange();}catch{/* Una vista de estado no puede interrumpir Pi. */}
   }else{last=next;initialized=true;}
  }
  if(stopped||!isCurrent()){stop();return;}
  timer=schedule(()=>{timer=undefined;poll();},intervalMs);
  timer.unref?.();
 };
 poll();
 return {stop};
}

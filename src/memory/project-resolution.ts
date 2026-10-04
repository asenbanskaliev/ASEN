export type MemoryProjectSource="config"|"git_remote"|"git_root"|"git_child"|"dir_basename"|"ambiguous";

export interface MemoryProjectDiscovery {
  configProject?:string;
  repositoryBinding?:string;
  gitRemoteProject?:string;
  gitRootProject?:string;
  childProjects?:readonly string[];
  directoryProject:string;
}
export interface MemoryProjectResolution {
  project?:string;
  source:MemoryProjectSource;
  availableProjects?:readonly string[];
}

function requiredName(value:string|undefined,label:string):string|undefined{
  if(value===undefined)return undefined;
  const trimmed=value.trim();
  if(!trimmed)throw new Error(`Memory ${label} project is blank`);
  return trimmed;
}
export function resolveDiscoveredMemoryProject(input:MemoryProjectDiscovery):MemoryProjectResolution{
  const config=requiredName(input.configProject,"configured");
  if(config)return {project:config,source:"config"};

  const binding=requiredName(input.repositoryBinding,"repository binding");
  const remote=requiredName(input.gitRemoteProject,"Git remote");
  const root=requiredName(input.gitRootProject,"Git root");
  if(binding)return {project:binding,source:remote?"git_remote":"git_root"};
  if(remote)return {project:remote,source:"git_remote"};
  if(root)return {project:root,source:"git_root"};

  const children=[...new Set((input.childProjects??[]).map(value=>requiredName(value,"child")).filter((value):value is string=>value!==undefined))].sort();
  if(children.length===1)return {project:children[0],source:"git_child"};
  if(children.length>1)return {source:"ambiguous",availableProjects:children};

  const directory=requiredName(input.directoryProject,"directory");
  if(!directory)throw new Error("Memory directory project is missing");
  return {project:directory,source:"dir_basename"};
}

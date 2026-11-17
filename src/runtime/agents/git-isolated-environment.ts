/** Git temporal: no heredar GIT_DIR/GIT_WORK_TREE, configuración, índices ni credenciales. */
export function isolatedGitEnvironment(extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{
 const env:NodeJS.ProcessEnv={};
 for(const key of ["PATH","Path","PATHEXT","SystemRoot","SYSTEMROOT","WINDIR","COMSPEC","TEMP","TMP","TMPDIR"])
  if(process.env[key]!==undefined)env[key]=process.env[key];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:"1",
  GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null",
  GIT_TERMINAL_PROMPT:"0",GIT_OPTIONAL_LOCKS:"0",GIT_NO_REPLACE_OBJECTS:"1",
  GIT_NO_LAZY_FETCH:"1",GIT_ALLOW_PROTOCOL:"",GIT_PROTOCOL_FROM_USER:"0"});
 for(const key of ["GIT_AUTHOR_NAME","GIT_AUTHOR_EMAIL","GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL","GIT_AUTHOR_DATE","GIT_COMMITTER_DATE"])
  if(extra[key]!==undefined)env[key]=extra[key];
 return env;
}

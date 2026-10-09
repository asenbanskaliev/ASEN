const RUNTIME_ENVIRONMENT = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "PI_CODING_AGENT_DIR",
  "PI_PACKAGE_DIR",
  "PI_OFFLINE",
  "PI_SKIP_VERSION_CHECK",
];

export const PROVIDER_CREDENTIALS = Object.freeze({
  openrouter: "OPENROUTER_API_KEY",
  llm7: "LLM7_API_KEY",
  groq: "GROQ_API_KEY",
});

export function createPiRuntimeEnvironment(source) {
  const environment = {};
  for (const name of RUNTIME_ENVIRONMENT) {
    if (typeof source[name] === "string") environment[name] = source[name];
  }
  return environment;
}

export function createPiProbeEnvironment(source, provider) {
  if (!Object.hasOwn(PROVIDER_CREDENTIALS, provider)) {
    throw new Error(`Unsupported GSP-06 provider: ${provider}`);
  }
  const credential = PROVIDER_CREDENTIALS[provider];
  if (typeof source[credential] !== "string" || source[credential].length === 0) {
    throw new Error(`GSP-06 credential is unavailable for provider: ${provider}`);
  }

  return {
    ...createPiRuntimeEnvironment(source),
    [credential]: source[credential],
    PI_TELEMETRY: "0",
  };
}

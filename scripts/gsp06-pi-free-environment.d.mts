export declare const PROVIDER_CREDENTIALS: Readonly<{
  openrouter: "OPENROUTER_API_KEY";
  llm7: "LLM7_API_KEY";
  groq: "GROQ_API_KEY";
}>;

export declare function createPiRuntimeEnvironment(
  source: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): NodeJS.ProcessEnv;

export declare function createPiProbeEnvironment(
  source: NodeJS.ProcessEnv,
  provider: string,
): NodeJS.ProcessEnv;

export declare function createPiVerifierEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;

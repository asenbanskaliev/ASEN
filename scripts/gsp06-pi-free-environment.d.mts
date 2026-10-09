export declare const PROVIDER_CREDENTIALS: Readonly<{
  openrouter: "OPENROUTER_API_KEY";
  llm7: "LLM7_API_KEY";
  groq: "GROQ_API_KEY";
}>;

export declare function createPiRuntimeEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): NodeJS.ProcessEnv;

export declare function createPiProbeEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  provider: string,
): NodeJS.ProcessEnv;

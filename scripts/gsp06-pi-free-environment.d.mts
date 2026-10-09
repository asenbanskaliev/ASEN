export declare function createPiRuntimeEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): NodeJS.ProcessEnv;

export declare function createPiProbeEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  provider: string,
): NodeJS.ProcessEnv;

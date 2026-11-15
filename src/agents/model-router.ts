/**
 * Role-Based Model Router for ASEN.
 * Routes agent roles to optimal model tiers (e.g. flash_lite for read-only exploration,
 * pro for architecture & review), with strict guardrails preventing downgrade of critical roles.
 */

export enum AgentRole {
  EXPLORER = "explorer",
  ARCHITECT = "architect",
  IMPLEMENTER = "implementer",
  AUDITOR = "auditor"
}

export type ModelTier = "flash_lite" | "flash" | "pro" | "inherit";

export interface ModelRouterOverrides {
  readonly explorerModel?: ModelTier | undefined;
  readonly architectModel?: ModelTier | undefined;
  readonly implementerModel?: ModelTier | undefined;
  readonly auditorModel?: ModelTier | undefined;
}

export const ROLE_MODEL_TIERS: Readonly<Record<AgentRole, ModelTier>> = Object.freeze({
  [AgentRole.EXPLORER]: "flash_lite",
  [AgentRole.ARCHITECT]: "pro",
  [AgentRole.IMPLEMENTER]: "inherit",
  [AgentRole.AUDITOR]: "pro"
});

const LITE_MODELS = new Set<ModelTier>(["flash_lite"]);

export function resolveAgentModel(
  role: AgentRole,
  overrides?: ModelRouterOverrides
): ModelTier {
  let selectedModel: ModelTier;

  switch (role) {
    case AgentRole.EXPLORER:
      selectedModel = overrides?.explorerModel ?? ROLE_MODEL_TIERS[AgentRole.EXPLORER];
      break;
    case AgentRole.ARCHITECT:
      selectedModel = overrides?.architectModel ?? ROLE_MODEL_TIERS[AgentRole.ARCHITECT];
      break;
    case AgentRole.IMPLEMENTER:
      selectedModel = overrides?.implementerModel ?? ROLE_MODEL_TIERS[AgentRole.IMPLEMENTER];
      if (LITE_MODELS.has(selectedModel)) {
        throw new Error(
          "Security Rule Violation: IMPLEMENTER role cannot be assigned a lite model (must be 'pro' or 'inherit')"
        );
      }
      break;
    case AgentRole.AUDITOR:
      selectedModel = overrides?.auditorModel ?? ROLE_MODEL_TIERS[AgentRole.AUDITOR];
      if (LITE_MODELS.has(selectedModel)) {
        throw new Error(
          "Security Rule Violation: AUDITOR role cannot be assigned a lite model (must be 'pro' or 'inherit')"
        );
      }
      break;
    default:
      selectedModel = "inherit";
  }

  return selectedModel;
}

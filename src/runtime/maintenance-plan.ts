import path from "node:path";

export const MAINTENANCE_PLAN_SCHEMA = "asen.maintenance-plan/v1" as const;

export type SetupMaintenanceIntent = "stage" | "verify" | "activate";

export interface SetupMaintenancePlanInput {
  packageRoot: string;
  prefix: string;
  home: string;
}

export interface SetupMaintenancePlanStep {
  readonly order: 1 | 2 | 3;
  readonly intent: SetupMaintenanceIntent;
  readonly executable: false;
}

export interface SetupMaintenancePlan {
  readonly schema: typeof MAINTENANCE_PLAN_SCHEMA;
  readonly operation: "setup";
  readonly executable: false;
  readonly packageRoot: string;
  readonly prefix: string;
  readonly home: string;
  readonly steps: readonly SetupMaintenancePlanStep[];
}

function copyAbsolutePath(value: string, field: keyof SetupMaintenancePlanInput): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${field} must be an absolute path`);
  }
  return `${value}`;
}

function setupStep(order: 1 | 2 | 3, intent: SetupMaintenanceIntent): SetupMaintenancePlanStep {
  return Object.freeze({ order, intent, executable: false });
}

export function createSetupMaintenancePlan(input: Readonly<SetupMaintenancePlanInput>): SetupMaintenancePlan {
  const steps = Object.freeze([
    setupStep(1, "stage"),
    setupStep(2, "verify"),
    setupStep(3, "activate"),
  ]);
  return Object.freeze({
    schema: MAINTENANCE_PLAN_SCHEMA,
    operation: "setup",
    executable: false,
    packageRoot: copyAbsolutePath(input.packageRoot, "packageRoot"),
    prefix: copyAbsolutePath(input.prefix, "prefix"),
    home: copyAbsolutePath(input.home, "home"),
    steps,
  });
}

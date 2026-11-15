import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type AsenLanguage = "en" | "es";

function normalizeLanguage(value: unknown): AsenLanguage {
  if (value === "es" || value === "en") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered.startsWith("es")) return "es";
    if (lowered.startsWith("en")) return "en";
  }
  return "en";
}

export function resolvePreferredLanguage(env: NodeJS.ProcessEnv = process.env, stored?: unknown): AsenLanguage {
  if (env.ASEN_LANG) return normalizeLanguage(env.ASEN_LANG);
  return normalizeLanguage(stored);
}

export function languageConfigPath(home: string): string {
  return join(home, ".asen", "language.json");
}

export async function readAsenLanguage(home: string): Promise<AsenLanguage> {
  try {
    const raw = await readFile(languageConfigPath(home), "utf8");
    const stored = JSON.parse(raw);
    const language = stored !== null && typeof stored === "object" && !Array.isArray(stored) ? stored.lang : stored;
    return resolvePreferredLanguage(process.env, language);
  } catch {
    return resolvePreferredLanguage(process.env);
  }
}

export async function writeAsenLanguage(home: string, language: AsenLanguage): Promise<void> {
  const normalized = language === "es" ? "es" : "en";
  await mkdir(join(home, ".asen"), { recursive: true });
  await writeFile(languageConfigPath(home), JSON.stringify({ lang: normalized }, null, 2), "utf8");
}

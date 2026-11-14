import type {IntegrationProfileInspection} from "./integration-profile-inspection.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

function clean(value: string): string {
 return sanitizeTerminalText(value).replace(/\s+/gu, " ").trim();
}

function compactLine(value: string, width: number): string {
 return truncateForTerminal(clean(value), width);
}

/** Bounded, sanitized projection of public integration inventory and configured profiles. */
export function integrationPanel(inspection: IntegrationProfileInspection, width = 120): string[] {
 if (!Number.isInteger(width) || width < 1) throw new Error("Integration panel width must be a positive integer");
 const rows: string[] = [];
 if (inspection.commands.state === "unavailable" && inspection.tools.state === "unavailable" && inspection.profiles.state === "unavailable") {
  return [compactLine("Integraciones: no disponible; ninguna afirmación de conexión puede derivarse del inventario.", width)];
 }
 for (const section of ["commands", "tools"] as const) {
  const result = inspection[section];
  rows.push(compactLine(`Integraciones · ${section}: ${result.state}${result.limited ? " · parcial" : ""}${result.diagnostic ? ` · ${result.diagnostic}` : ""}`, width));
  for (const entry of result.entries) {
   const pieces = [
    `${entry.name}`,
    entry.namespace ? `(${entry.namespace})` : "",
    `${entry.status} · conexión ${entry.connection}`,
    `procedencia ${entry.provenance.source}${entry.provenance.scope ? `/${entry.provenance.scope}` : ""}${entry.provenance.origin ? `/${entry.provenance.origin}` : ""}`,
   ].filter(Boolean);
   rows.push(compactLine(pieces.join(" — "), width));
  }
 }
 if (inspection.profiles.state === "available") {
  if (inspection.profiles.snapshot) { rows.push(compactLine(`Perfil activo ${inspection.profiles.snapshot.active}: ${inspection.profiles.snapshot.source} · persistencia en proceso`, width)); }
  for (const route of inspection.profiles.routes) {
   rows.push(compactLine(`${route.role} · fuente ${route.source} · ${route.configured ? "configurado" : "por defecto"} · modelo ${route.model} · ejecución real desconocida`, width));
  }
 } else {
  rows.push(compactLine(`Perfiles: ${inspection.profiles.state} · ${inspection.profiles.diagnostic ?? "sin información"}`, width));
 }
 return rows;
}

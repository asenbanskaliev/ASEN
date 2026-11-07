import assert from "node:assert/strict";
import test from "node:test";
import {inspectIntegrationProfiles} from "../src/runtime/integration-profile-inspection.js";
import {integrationPanel} from "../src/runtime/integrations-panel.js";

test("integrations panel reports unavailable truthfully", () => {
 const result = inspectIntegrationProfiles({});
 const rows = integrationPanel(result, 80);
 assert.match(rows.join("\n"), /no disponible/);
});

test("integrations panel projects entries without claiming connection", () => {
 const result = inspectIntegrationProfiles({getAllTools:()=>[{name:"lookup",namespace:{name:"mcp__docs"},sourceInfo:{scope:"user",origin:"package"}}]});
 const rows = integrationPanel(result, 120);
 assert.match(rows.join("\n"), /lookup — \(mcp__docs\) — registered · conexión unknown/);
 assert.match(rows.join("\n"), /procedencia unknown\/user\/package/);
});

test("integrations panel clips controls", () => {
 const rows = integrationPanel(inspectIntegrationProfiles({}), 48);
 assert.ok(rows.every(row => row.length <= 48 || row.endsWith("…")));
});

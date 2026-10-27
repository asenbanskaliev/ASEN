import test from "node:test";
import assert from "node:assert/strict";
import {layoutMode,truncateForTerminal} from "../src/runtime/responsive-layout.js";
test("selects safe layouts at narrow widths",()=>{assert.equal(layoutMode(120),"wide");assert.equal(layoutMode(80),"compact");assert.equal(layoutMode(60),"narrow");assert.equal(layoutMode(40),"minimum");assert.equal(truncateForTerminal("abcdef",4),"abc…");});


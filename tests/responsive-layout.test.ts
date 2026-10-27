import test from "node:test";
import assert from "node:assert/strict";
import {layoutMode,truncateForTerminal,truncateStartForTerminal,visibleWidth} from "../src/runtime/responsive-layout.js";
test("selects safe layouts at narrow widths",()=>{assert.equal(layoutMode(120),"wide");assert.equal(layoutMode(80),"compact");assert.equal(layoutMode(60),"narrow");assert.equal(layoutMode(40),"minimum");assert.equal(truncateForTerminal("abcdef",4),"abc…");});
test("fits graphemes and double-width characters without splitting them",()=>{assert.equal(visibleWidth("A界😀e\u0301"),6);assert.equal(truncateForTerminal("界界",3),"界…");assert.equal(truncateStartForTerminal("abcdef",4),"…def");assert.ok(visibleWidth(truncateForTerminal("👩‍👩‍👧‍👦界-end",6))<=6);});


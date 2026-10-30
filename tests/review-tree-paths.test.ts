import assert from "node:assert/strict";
import test from "node:test";

// Dynamic import keeps each new rule visible in the feature-absence RED run.
async function validate(input: unknown): Promise<readonly string[]> {
  const {validatePortableReviewPaths} = await import("../src/review/review-tree-paths.js");
  return validatePortableReviewPaths(input);
}
const unsafe = /^Error: Unsafe portable review path$/u;
const shape = /^Error: Review paths must be a dense plain string array$/u;
const collision = /^Error: Review tree paths alias or overlap$/u;

async function rejectPaths(paths: string[]): Promise<void> {
  const before = [...paths];
  await assert.rejects(validate(paths), unsafe);
  assert.deepEqual(paths, before);
}

test("returns a frozen sorted copy of portable paths without changing input", async () => {
  const input = Object.freeze(["src/z.ts", "docs/niño.md", "assets/📦.bin", "src/a.ts"]);
  const result = await validate(input);
  assert.deepEqual(result, [...input].sort());
  assert.notEqual(result, input);
  assert(Object.isFrozen(result));
  assert.throws(() => (result as string[]).push("added"), TypeError);
  assert.deepEqual(input, ["src/z.ts", "docs/niño.md", "assets/📦.bin", "src/a.ts"]);
  assert.deepEqual(await validate([]), []);
});

test("rejects nonarrays, sparse arrays, subclasses, extras and nonstring values", async () => {
  class SpecialArray extends Array<string> {}
  const extra = Object.assign(["safe"], {extra: true});
  const symbol = Object.assign(["safe"], {[Symbol("extra")]: true});
  const hidden = ["safe"];
  Object.defineProperty(hidden, "0", {enumerable: false});
  for (const value of [null, undefined, "safe", {}, {0: "safe", length: 1}, [42], new Array(1), new SpecialArray("safe"), extra, symbol, hidden]) {
    await assert.rejects(validate(value), shape);
  }
});

test("rejects proxy and accessor input without invoking user code", async () => {
  let calls = 0;
  const proxy = new Proxy(["safe"], {
    get() { calls++; throw new Error("proxy get executed"); },
    ownKeys() { calls++; throw new Error("proxy ownKeys executed"); },
    getPrototypeOf() { calls++; throw new Error("proxy prototype executed"); },
  });
  const accessor = ["safe"];
  Object.defineProperty(accessor, "0", {get() { calls++; return "safe"; }});
  await assert.rejects(validate(proxy), shape);
  await assert.rejects(validate(accessor), shape);
  assert.equal(calls, 0);
});

test("rejects absolute, empty, dot, parent and Git metadata segments", async () => {
  for (const name of ["", "/absolute", "//server/share", "a//b", "a/", ".", "..", "a/./b", "a/../b", ".git/config", "a/.GiT/config"]) {
    await rejectPaths([name]);
  }
});

test("rejects Windows separators, drive-relative paths, ADS and forbidden punctuation", async () => {
  for (const name of ["a\\b", "C:foo", "file:stream", "a<b", "a>b", "a\"b", "a|b", "a?b", "a*b"]) {
    await rejectPaths([name]);
  }
});

test("rejects controls and unpaired Unicode surrogates", async () => {
  for (const code of [0, 1, 31, 127, 128, 159, 0xd800, 0xdc00]) {
    await rejectPaths([`a${String.fromCharCode(code)}b`]);
  }
});

test("rejects non-NFC spelling rather than silently normalizing it", async () => {
  await rejectPaths(["cafe\u0301.txt"]);
  assert.deepEqual(await validate(["café.txt"]), ["café.txt"]);
});

test("rejects segments ending with a dot or space", async () => {
  for (const name of ["file.", "file ", "directory./file", "directory /file"]) await rejectPaths([name]);
});

test("rejects reserved Windows device basenames with or without extensions", async () => {
  const devices = ["CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$",
    ...Array.from({length: 9}, (_, index) => `COM${index + 1}`),
    ...Array.from({length: 9}, (_, index) => `LPT${index + 1}`), "COM¹", "LPT²", "COM³"];
  for (const name of devices) {
    await rejectPaths([name]);
    await rejectPaths([`directory/${name.toLowerCase()}.txt`]);
  }
  assert.deepEqual(await validate(["COM0.txt", "COM10", "AUXiliary", ".hidden"]), [".hidden", "AUXiliary", "COM0.txt", "COM10"]);
});

test("rejects duplicate and case-fold alias paths without changing input", async () => {
  for (const paths of [["a", "a"], ["Readme", "README"], ["é", "É"], ["ς", "Σ"], ["folder/a", "Folder/b"]]) {
    const before = [...paths];
    await assert.rejects(validate(paths), collision);
    assert.deepEqual(paths, before);
    await assert.rejects(validate([...paths].reverse()), collision);
  }
});

test("rejects file-directory prefix collisions in both orders", async () => {
  for (const paths of [["a", "a/b"], ["a/b", "a"], ["A", "a/b"], ["a/b/c", "a/b"]]) {
    const before = [...paths];
    await assert.rejects(validate(paths), collision);
    assert.deepEqual(paths, before);
  }
});

test("accepts shared directories and distinct component prefixes as data only", async () => {
  const result = await validate(["a.txt", "ab/file", "folder/a", "folder/b", "__proto__/file"]);
  assert.deepEqual(result, ["__proto__/file", "a.txt", "ab/file", "folder/a", "folder/b"]);
  assert.deepEqual(Object.keys(result), ["0", "1", "2", "3", "4"]);
  for (const name of ["authority", "approved", "destination", "readonlyView", "ready"]) assert.equal(name in result, false);
});

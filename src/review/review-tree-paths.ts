import {types} from "node:util";

interface PathNode {
  readonly spelling: string;
  readonly file: boolean;
  readonly children: Map<string, PathNode>;
}

const reservedDevice = /^(?:CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu;
const forbiddenCharacter = /[<>:"\\|?*\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u;

function plainPaths(input: unknown): string[] {
  if (typeof input !== "object" || input === null || types.isProxy(input)
    || !Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    throw new Error("Review paths must be a dense plain string array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== input.length + 1) {
    throw new Error("Review paths must be a dense plain string array");
  }
  const paths: string[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") {
      throw new Error("Review paths must be a dense plain string array");
    }
    paths.push(descriptor.value);
  }
  return paths;
}

/**
 * Pure, conservative lexical preflight for a future filesystem review view.
 * Rejects rather than rewrites unsafe spelling. Case aliases use locale-independent
 * Unicode uppercase comparison, including directory components; this may reject
 * names that a particular filesystem would distinguish.
 *
 * This does not inspect a repository, prove destination eligibility, restrict
 * filesystem writes, issue authority, or provide an OS sandbox.
 */
export function validatePortableReviewPaths(input: unknown): readonly string[] {
  const paths = plainPaths(input);
  const roots = new Map<string, PathNode>();
  for (const path of paths) {
    if (!path || path !== path.normalize("NFC") || forbiddenCharacter.test(path)) {
      throw new Error("Unsafe portable review path");
    }
    const segments = path.split("/");
    let children = roots;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      if (!segment || segment === "." || segment === ".." || segment.toUpperCase() === ".GIT"
        || /[. ]$/u.test(segment) || reservedDevice.test(segment)) {
        throw new Error("Unsafe portable review path");
      }
      const key = segment.toUpperCase().normalize("NFC");
      const file = index === segments.length - 1;
      let node = children.get(key);
      if (node) {
        if (node.spelling !== segment || node.file || file) {
          throw new Error("Review tree paths alias or overlap");
        }
      } else {
        node = {spelling: segment, file, children: new Map<string, PathNode>()};
        children.set(key, node);
      }
      children = node.children;
    }
  }
  return Object.freeze(paths.sort());
}

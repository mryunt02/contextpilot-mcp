import { FunctionInfo } from "./types";

/**
 * v0.1 function extractor.
 *
 * Deliberately NOT using a full AST parser (tree-sitter/babel) yet —
 * per the milestone-1 goal ("no AI, no heavy deps, just something that
 * works"). This uses line-scanning + brace-depth counting, which covers
 * the large majority of real-world function/method declarations in
 * JS/TS codebases:
 *
 *   function foo(...) { ... }
 *   async function foo(...) { ... }
 *   export function foo(...) { ... }
 *   const foo = (...) => { ... }
 *   const foo = async (...) => { ... }
 *   export const foo = (...) => { ... }
 *   class Foo { bar(...) { ... } }
 *
 * Known limitations (documented on purpose, not hidden):
 *  - Braces inside string/template literals or comments can throw off
 *    depth-counting in rare cases.
 *  - One-liner arrow functions without a `{ }` body (`const f = x => x*2`)
 *    are recorded as single-line entries.
 *  - Overloaded/ambient declarations are skipped.
 *
 * This is the file to replace with a tree-sitter-based parser in v0.2
 * without changing the FunctionInfo contract used by the rest of the app.
 */

const FUNCTION_DECL =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/;
const ARROW_CONST =
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(?:async\s*)?\(?[^=]*\)?\s*=>/;
const CLASS_DECL =
  /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const METHOD_DECL =
  /^\s*(?:(?:public|private|protected|static|async|readonly)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/;
const CONTROL_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "function",
]);

interface OpenBlock {
  kind: FunctionInfo["kind"];
  name: string;
  startLine: number;
  className?: string;
  braceDepthAtOpen: number;
}

export function extractFunctions(
  filePath: string,
  content: string,
): FunctionInfo[] {
  const lines = content.split("\n");
  const results: FunctionInfo[] = [];

  let braceDepth = 0;
  let classStack: { name: string; depth: number }[] = [];
  const openStack: OpenBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const classMatch = CLASS_DECL.exec(line);
    if (classMatch) {
      classStack.push({ name: classMatch[1], depth: braceDepth });
    }

    let matched: { kind: FunctionInfo["kind"]; name: string } | null = null;

    const fnMatch = FUNCTION_DECL.exec(line);
    if (fnMatch) {
      matched = { kind: "function", name: fnMatch[1] };
    } else {
      const arrowMatch = ARROW_CONST.exec(line);
      if (arrowMatch && line.includes("=>")) {
        matched = { kind: "arrow", name: arrowMatch[1] };
      } else if (
        classStack.length > 0 &&
        classStack[classStack.length - 1].depth + 1 === braceDepth
      ) {
        const methodMatch = METHOD_DECL.exec(line);
        if (
          methodMatch &&
          !CONTROL_KEYWORDS.has(methodMatch[1]) &&
          line.includes("{")
        ) {
          matched = { kind: "method", name: methodMatch[1] };
        }
      }
    }

    if (matched && line.includes("{")) {
      openStack.push({
        kind: matched.kind,
        name: matched.name,
        startLine: i + 1,
        className:
          classStack.length > 0
            ? classStack[classStack.length - 1].name
            : undefined,
        braceDepthAtOpen: braceDepth,
      });
    }

    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") {
        braceDepth--;
        while (
          openStack.length > 0 &&
          openStack[openStack.length - 1].braceDepthAtOpen === braceDepth
        ) {
          const block = openStack.pop()!;
          results.push({
            name: block.name,
            kind: block.kind,
            filePath,
            startLine: block.startLine,
            endLine: i + 1,
            code: lines.slice(block.startLine - 1, i + 1).join("\n"),
            className: block.className,
          });
        }
        while (
          classStack.length > 0 &&
          classStack[classStack.length - 1].depth === braceDepth
        ) {
          classStack.pop();
        }
      }
    }
  }

  return results;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCallReferences, extractFunctions } from "../parser";

test("extracts a plain function declaration", () => {
  const code = `function login(user) {\n  return user;\n}\n`;
  const fns = extractFunctions("a.ts", code);
  assert.equal(fns.length, 1);
  assert.equal(fns[0].name, "login");
  assert.equal(fns[0].kind, "function");
});

test("extracts an arrow function assigned to const", () => {
  const code = `export const verifyJWT = (token) => {\n  return true;\n}\n`;
  const fns = extractFunctions("a.ts", code);
  assert.equal(fns.length, 1);
  assert.equal(fns[0].name, "verifyJWT");
  assert.equal(fns[0].kind, "arrow");
});

test("extracts class methods and attributes them to the class", () => {
  const code = `class AuthService {\n  async login(u, p) {\n    return true;\n  }\n\n  private async findUser(u) {\n    return u;\n  }\n}\n`;
  const fns = extractFunctions("a.ts", code);
  const names = fns.map((f) => f.name).sort();
  assert.deepEqual(names, ["findUser", "login"]);
  assert.ok(fns.every((f) => f.className === "AuthService"));
});

test("does not confuse control-flow keywords with methods", () => {
  const code = `class Foo {\n  bar() {\n    if (true) {\n      return 1;\n    }\n    for (let i = 0; i < 3; i++) {}\n  }\n}\n`;
  const fns = extractFunctions("a.ts", code);
  const names = fns.map((f) => f.name);
  assert.deepEqual(names, ["bar"]);
});

test("returns correct start/end line numbers", () => {
  const code = `function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n`;
  const fns = extractFunctions("a.ts", code);
  const a = fns.find((f) => f.name === "a")!;
  const b = fns.find((f) => f.name === "b")!;
  assert.deepEqual([a.startLine, a.endLine], [1, 3]);
  assert.deepEqual([b.startLine, b.endLine], [5, 7]);
});

test("extracts unqualified and qualified function calls", () => {
  const calls = extractCallReferences(`function login() {\n  verifyPassword();\n  this.createJWT();\n  UserRepository.findByEmail();\n}`);
  assert.deepEqual(calls, [
    { name: "verifyPassword", receiver: undefined },
    { name: "createJWT", receiver: "this" },
    { name: "findByEmail", receiver: "UserRepository" },
  ]);
});

test("uses the AST for modern TypeScript functions and exact source ranges", () => {
  const code = `@service
export default async function <T>(value: T): Promise<T> {
  function nested() { return value; }
  return nested();
}

class Worker {
  @trace()
  async run<T>(value: T) { return value; }
}

const handler = async function <T>(value: T) { return value; };
const mapper = <T,>(value: T) => value;
`;
  const fns = extractFunctions("modern.ts", code);
  const byName = (name: string) => fns.find((fn) => fn.name === name)!;

  assert.deepEqual(fns.map((fn) => fn.name), ["default", "nested", "run", "handler", "mapper"]);
  assert.equal(byName("run").className, "Worker");
  assert.equal(byName("handler").kind, "function");
  assert.equal(byName("mapper").kind, "arrow");
  assert.equal(byName("default").startLine, 1);
  assert.ok(byName("run").code.startsWith("@trace()"));
  for (const fn of fns) {
    assert.equal(fn.code, code.slice(fn.startOffset, fn.endOffset));
    assert.ok(fn.endOffset > fn.startOffset);
  }
});

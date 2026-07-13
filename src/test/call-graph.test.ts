import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCallEdges, getAllFunctions, openDb, rebuildCallGraph } from "../db";

test("builds caller and callee edges, including this-qualified methods", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "contextpilot-"));
  const db = openDb(root);
  const insert = db.prepare(`
    INSERT INTO functions (name, kind, class_name, file_path, start_line, end_line, start_offset, end_offset, code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run("login", "method", "AuthService", "auth.ts", 1, 4, 0, 40, "login() { return this.verifyPassword(); }");
  insert.run("verifyPassword", "method", "AuthService", "auth.ts", 6, 8, 41, 72, "verifyPassword() { return true; }");
  insert.run("findByEmail", "method", "UserRepository", "users.ts", 1, 3, 0, 36, "findByEmail() { return null; }");
  insert.run("loadUser", "function", null, "auth.ts", 10, 12, 73, 130, "function loadUser() { return UserRepository.findByEmail(); }");

  rebuildCallGraph(db);
  const functions = getAllFunctions(db);
  const id = (name: string) => functions.find((fn) => fn.name === name)?.id;
  assert.deepEqual(getCallEdges(db), [
    { callerId: id("login"), calleeId: id("verifyPassword") },
    { callerId: id("loadUser"), calleeId: id("findByEmail") },
  ]);
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

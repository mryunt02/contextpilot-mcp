# ContextPilot

**Intelligent Context Manager for Claude Code.**

ContextPilot doesn't change how Claude thinks — it changes what Claude sees first.
Instead of Claude Code grepping and re-reading dozens of files to find the code
relevant to a task, ContextPilot maintains a pre-built index of every function in
your project and returns only the handful that actually matter.

> We're not modifying Claude. We're giving Claude better context.

## The problem

A developer working in an 800-file, 200k-line codebase types:

```
Fix login bug
```

Claude Code has to search the whole tree to figure out what "login" even means in
this project — which burns both time and context budget before any real work starts.

## Status: v0.1 (Milestone 1)

This milestone intentionally uses **no AI and no heavy native dependencies**. The
goal is a small, correct, fast foundation:

- ✅ Scan a project for JS/TS/JSX/TSX source files
- ✅ Extract functions, arrow functions, and class methods (regex + brace-depth
  parsing — see `src/parser.ts` for why this was chosen over tree-sitter for now)
- ✅ Store them in SQLite (via Node's built-in `node:sqlite` — zero native
  compilation required, see below)
- ✅ `contextpilot index` — incremental: unchanged files are skipped via mtime/size
- ✅ `contextpilot search "<query>"` — keyword/token-overlap ranking
- ✅ `contextpilot context "<query>"` — concatenates top matches into one pasteable
  blob

### Why `node:sqlite` instead of `better-sqlite3`

`better-sqlite3` requires a native build step (`node-gyp`), which is a real source
of install friction for a CLI tool meant to run on arbitrary machines and CI
runners. Node 22.5+ ships an experimental built-in SQLite module
(`node:sqlite`) that needs no compilation at all. We traded "most mature SQLite
binding" for "installs cleanly everywhere" — worth revisiting once the built-in
module stabilizes out of experimental, or if we need features it doesn't have yet.

### Known limitations of the v0.1 parser

- Brace-depth counting can, in rare cases, be thrown off by braces inside string
  or template literals.
- Single-expression arrow functions without a `{ }` body are recorded as
  single-line entries.
- No semantic understanding — see "Known limitation" below.

### Known limitation of v0.1 search (the important one)

Keyword-overlap search finds `AuthService.login()` for the query `"Fix login
bug"` because the word "login" literally appears in the function name. It will
**not** find `verifyPassword()` or `createJWT()`, even though a human reviewing
a login bug would obviously want to see them too — there's no shared vocabulary
between the query and those names/bodies. Closing that gap with embeddings is
the explicit goal of the next milestone, not an oversight in this one.

## Install & try it

```bash
npm install
npm run build

node dist/cli.js index --dir /path/to/your/project
node dist/cli.js search "fix login bug" --dir /path/to/your/project
node dist/cli.js context "fix login bug" --dir /path/to/your/project --top 3
```

The index is stored at `<project>/.contextpilot/index.sqlite` — safe to add to
`.gitignore`.

## Roadmap

| Milestone | Scope |
|---|---|
| **v0.1** (this repo) | Scan → parse (regex) → SQLite → `index` / `search` / `context` CLI commands |
| **v0.2** | Embeddings-based ranking (local model or API) so semantically-related but lexically-different functions are found; swap regex parser for tree-sitter |
| **v0.3** | MCP server: Claude Code calls ContextPilot directly as a tool, no CLI step from the user |
| **v1.0** | Multi-language support, call-graph aware ranking (boost functions that call/are called by top matches), publish to the MCP Registry |

## Architecture

```
             User
               │
               ▼
         Claude Code
               │
        MCP Request  (v0.3+)
               │
               ▼
        ContextPilot
               │
 ┌─────────────┼──────────────┐
 │             │              │
 ▼             ▼              ▼
Index       Search         Ranking
 │
 ▼
Context Builder
 │
 ▼
Claude
```

## Tech stack

- TypeScript / Node.js
- `node:sqlite` (built-in) for the index
- `fast-glob` for project scanning
- `commander` for the CLI
- Regex + brace-depth parsing today; tree-sitter planned for v0.2
- Embeddings (local or API) planned for v0.2 ranking

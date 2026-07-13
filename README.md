# ContextPilot

[![npm version](https://img.shields.io/npm/v/contextpilotmcp.svg)](https://www.npmjs.com/package/contextpilotmcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

**ContextPilot automatically builds the smallest possible context for AI coding agents.**

Instead of dumping your entire repository (or even a keyword-matched subset of it) into an LLM's context window, ContextPilot indexes your codebase once and returns only the handful of functions actually relevant to the task at hand — as an MCP server that Claude Code, Claude Desktop, and other MCP-compatible agents can call directly.

## The problem

Every AI coding agent has to answer the same question before it can help you: *which part of this codebase actually matters for this task?* Feeding it the whole repo wastes tokens, time, and money. Naive keyword search is cheaper but shallow — it finds `Login()` and `LoginForm()` easily, but misses `verifyPassword()`, `createJWT()`, or `isLoggedIn()`, because those functions don't share the word "login" even though they're exactly where a login bug probably lives.

**Measured on a real 815-file production codebase**, searching for the task *"user cannot stay logged in after refresh"* (a query that never contains the word "login"):

| Method | Context sent | Approx. tokens |
|---|---|---|
| Entire repository | 815 files | ~325,000 |
| ContextPilot | 5 functions | ~960 |

That's the entire repository's worth of context reduced by over **99.7%** — while still surfacing the actual relevant code (`isLoggedIn()`, `getServerUser()`) instead of unrelated UI pages, because the match is semantic, not just keyword-based.

## How it works

1. **Index** — ContextPilot scans your project, parses JavaScript and TypeScript with the TypeScript Compiler API, and stores functions/methods with exact character ranges in a local SQLite database along with a semantic embedding of each function (`all-MiniLM-L6-v2`, run fully locally via `@xenova/transformers` — no API key, no data leaves your machine).
2. **Search** — a query like `"fix login bug"` is embedded and compared against every indexed function using cosine similarity, blended with keyword-overlap scoring for precision on exact name matches.
3. **Call graph** — while indexing, ContextPilot records caller → callee relationships. Retrieval can add direct callers and callees (or more hops) only when requested.
4. **Context** — the top matches are returned as a single pasteable blob of real source code, sized to fit a task, not a whole repo.
4. Incremental by default — re-indexing an 800-file project after touching one file stays fast, since unchanged files are skipped via mtime/size checks.

## Installation

```bash
npm install -g contextpilotmcp
```

## CLI usage

```bash
contextpilot index /path/to/project
contextpilot search "fix login bug" -d /path/to/project
contextpilot context "fix login bug" -d /path/to/project   # full source code of top matches
contextpilot context "fix login bug" -d /path/to/project --expand --depth 2
```

`--expand` includes both functions called by each top match and functions that
call it. `--depth` controls the maximum number of call-graph hops (default: 1).
Expansion is opt-in so normal searches stay as small as possible.

## Using it as an MCP server

ContextPilot ships as a Model Context Protocol server, so any MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.) can call it as a tool during a conversation — no manual copy-pasting of code into the chat.

**Claude Desktop** — add to your config (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "contextpilot": {
      "command": "npx",
      "args": ["-y", "contextpilotmcp"]
    }
  }
}
```

Restart Claude Desktop. In a new chat, ask something like:

> "Index /path/to/my-project, then find the functions most relevant to fixing the login bug."

Claude will call `contextpilot_index` and `contextpilot_search` automatically.

### Available tools

| Tool | Description |
|---|---|
| `contextpilot_index` | Scans a project and builds/updates the function index |
| `contextpilot_search` | Returns ranked function matches, optionally with call dependencies |
| `contextpilot_context` | Returns full source code of the top matches, optionally with call dependencies |

All three tools accept an optional `projectPath`. If omitted, ContextPilot falls back to the MCP server's current working directory.
`contextpilot_search` and `contextpilot_context` also accept `expandDependencies: true` and an optional `expansionDepth` (default `1`).

- **Claude Code** — since it's typically launched from inside your project directory (`cd my-project && claude`), the working directory usually *is* your project, so you can often skip `projectPath` entirely and just say "index this project" or "find the functions relevant to X."
- **Claude Desktop** — the MCP server is started from an unrelated working directory, not your project folder. Always pass `projectPath` explicitly here, e.g. "index /Users/you/projects/my-app, then search for X."

When in doubt, just pass `projectPath` explicitly — it always works regardless of client.

## License

MIT

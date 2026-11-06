---
name: contextpilot
description: Use ContextPilot's MCP tools to find the small set of functions actually relevant to a coding task, instead of reading or grepping the whole repository. Trigger whenever a task requires locating "where does X happen" in an unfamiliar or large JS/TS codebase, before resolving a bug, implementing a feature, or answering "where is this handled" — especially when the obvious keyword (e.g. "login") won't appear in the relevant function names (e.g. isLoggedIn, verifyPassword, createJWT).
---

# ContextPilot

ContextPilot is an MCP server that indexes a JavaScript/TypeScript project once and then returns only the functions semantically relevant to a task — typically a handful of functions (hundreds of tokens) instead of an entire repository (hundreds of thousands of tokens). It combines a local semantic embedding model with keyword overlap and call-graph expansion, and runs entirely on the user's machine (no API key, no code leaves the machine).

## When to use this skill

Reach for ContextPilot's tools instead of manual file browsing or broad grep when:
- The task is a bug fix, feature request, or question about an unfamiliar or large codebase ("why does X happen", "where is Y handled", "add Z to the login flow").
- A keyword search would likely miss the real implementation because it uses different vocabulary (e.g. searching "login" won't find `isLoggedIn()`, `verifyPassword()`, `createJWT()`).
- You want the minimal, precise context for a task rather than dumping whole files into the conversation.

Don't use it for trivial, single-file edits where the location is already known, or for non-JS/TS codebases (only JavaScript and TypeScript are parsed).

## Available tools

| Tool | Purpose |
|---|---|
| `contextpilot_index` | Scans the project and builds/updates the function index. Run this first, and again after large changes (incremental — skips unchanged files). |
| `contextpilot_search` | Returns ranked function matches for a natural-language task description. Use to decide what's relevant before pulling in source. |
| `contextpilot_context` | Returns the full source code of the top matches, ready to paste into reasoning — this is normally the tool to call for actually working on the task. |

All three accept an optional `projectPath`:
- If the MCP server's working directory is already the project root (common when launched from inside the project), `projectPath` can be omitted.
- If the server's working directory is unrelated to the project (e.g. launched globally), always pass `projectPath` explicitly.

`contextpilot_search` and `contextpilot_context` also accept `expandDependencies: true` with an optional `expansionDepth` (default `1`) to pull in direct callers/callees of each match — use this only when the top matches alone don't give enough surrounding context, since expansion grows the result size.

## Workflow

1. Call `contextpilot_index` with the project path (first use, or after substantial changes).
2. Call `contextpilot_context` with a plain description of the task (e.g. "user cannot stay logged in after refresh"). Prefer describing the *symptom or goal*, not a guessed function name — that's what the semantic search is for.
3. If the returned functions reference others you need to see (a caller or a helper not included), re-run with `expandDependencies: true` rather than manually grepping for them.
4. Use `contextpilot_search` instead of `contextpilot_context` only when you need to decide relevance first without pulling full source (e.g. to pick among many candidates before fetching code).

## Setup reference

If the MCP server isn't configured yet in the current client, the user needs:

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

If not installed, run `npm install -g contextpilotmcp` first.


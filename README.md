# ContextPilot

**Intelligent context manager for Claude Code and other MCP-compatible AI agents.**

ContextPilot indexes a codebase once, then answers questions like _"which functions are relevant to this task?"_ — instantly, and without dumping your entire repo into the model's context window.

## The problem

When you ask an AI coding agent to "fix the login bug," it has to search your codebase somehow. Naive keyword search finds `Login()` and `LoginForm()` easily — but misses `verifyPassword()`, `createJWT()`, or `isLoggedIn()`, because those functions don't share the word "login" even though they're exactly where the bug probably lives.

**Before (keyword-only search):**

```
$ contextpilot search "Fix login bug"
Login()          — score: 0.99
Login()          — score: 0.99
LoginForm()      — score: 0.99
```

Three login _pages_. Zero auth _logic_.

**After (hybrid semantic + keyword search):**

```
$ contextpilot search "user cannot stay logged in after refresh"
isLoggedIn()       — score: 0.32
getServerUser()    — score: 0.30
```

No shared keywords at all between the query and the results — the match is purely semantic, found via embeddings.

## How it works

1. **Index** — ContextPilot scans your project, parses functions/methods (regex + brace-depth based), and stores them in a local SQLite database along with a semantic embedding of each function (`all-MiniLM-L6-v2`, run fully locally via `@xenova/transformers` — no API key, no data leaves your machine).
2. **Search** — a query like `"fix login bug"` is embedded and compared against every indexed function using cosine similarity, blended with keyword-overlap scoring for precision on exact name matches.
3. **Context** — the top matches can be pulled as a single pasteable blob of real source code, ready to hand to an LLM.
4. Incremental by default — re-indexing an 800-file project after touching one file stays fast, since unchanged files are skipped via mtime/size checks.

## Installation

```bash
npm install -g contextpilot
```

## CLI usage

```bash
contextpilot index /path/to/project
contextpilot search "fix login bug" -d /path/to/project
contextpilot context "fix login bug" -d /path/to/project   # full source code of top matches
```

## Using it as an MCP server

ContextPilot ships as a Model Context Protocol server, so any MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.) can call it as a tool during a conversation — no manual copy-pasting of code into the chat.

**Claude Desktop** — add to your config (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "contextpilot": {
      "command": "npx",
      "args": ["-y", "contextpilot-mcp"]
    }
  }
}
```

Restart Claude Desktop. In a new chat, ask something like:

> "Index /path/to/my-project, then find the functions most relevant to fixing the login bug."

Claude will call `contextpilot_index` and `contextpilot_search` automatically.

### Available tools

| Tool                   | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `contextpilot_index`   | Scans a project and builds/updates the function index       |
| `contextpilot_search`  | Returns ranked function matches for a task description      |
| `contextpilot_context` | Returns full source code of the top matches, ready to paste |

All three tools accept an optional `projectPath`. If omitted, ContextPilot falls back to the MCP server's current working directory.

- **Claude Code** — since it's typically launched from inside your project directory (`cd my-project && claude`), the working directory usually _is_ your project, so you can often skip `projectPath` entirely and just say "index this project" or "find the functions relevant to X."
- **Claude Desktop** — the MCP server is started from an unrelated working directory, not your project folder. Always pass `projectPath` explicitly here, e.g. "index /Users/you/projects/my-app, then search for X."

When in doubt, just pass `projectPath` explicitly — it always works regardless of client.

## License

MIT

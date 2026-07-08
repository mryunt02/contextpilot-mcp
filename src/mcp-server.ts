import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { indexProject } from "./indexer";
import { search } from "./search";
import { buildContext } from "./context";

const server = new McpServer({
  name: "contextpilot",
  version: "0.1.0",
});

server.tool(
  "contextpilot_index",
  "Scans a project directory and builds/updates the function index. Run this before searching a new project, or after significant code changes.",
  {
    projectPath: z
      .string()
      .describe("Absolute path to the project root directory"),
    force: z
      .boolean()
      .optional()
      .describe("Force full re-index even if files are unchanged"),
  },
  async ({ projectPath, force }) => {
    const stats = await indexProject(projectPath, { force });
    return {
      content: [
        {
          type: "text",
          text: `Indexed ${stats.filesScanned} files, ${stats.functionsIndexed} functions total.`,
        },
      ],
    };
  },
);

server.tool(
  "contextpilot_search",
  "Finds the most relevant functions in an indexed project for a given task description. Use this before diving into a codebase to find where to make a change.",
  {
    projectPath: z
      .string()
      .describe(
        "Absolute path to the project root directory (must be already indexed)",
      ),
    query: z
      .string()
      .describe(
        "Natural language description of the task, e.g. 'fix login bug'",
      ),
    topK: z
      .number()
      .optional()
      .describe("Number of results to return (default 5)"),
  },
  async ({ projectPath, query, topK }) => {
    const results = await search(projectPath, query, topK ?? 5);
    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No matches found for "${query}". Has this project been indexed?`,
          },
        ],
      };
    }
    const summary = results
      .map(
        (r) =>
          `${r.className ? r.className + "." : ""}${r.name}() — ${r.filePath}:${r.startLine} (score: ${r.score.toFixed(2)})`,
      )
      .join("\n");
    return { content: [{ type: "text", text: summary }] };
  },
);

server.tool(
  "contextpilot_context",
  "Builds a single pasteable context blob containing the full source of the top matching functions for a task. Use this to get actual code, not just a list.",
  {
    projectPath: z
      .string()
      .describe(
        "Absolute path to the project root directory (must be already indexed)",
      ),
    query: z.string().describe("Natural language description of the task"),
    topK: z
      .number()
      .optional()
      .describe("Number of functions to include (default 6)"),
  },
  async ({ projectPath, query, topK }) => {
    const blob = await buildContext(projectPath, query, topK ?? 6);
    return { content: [{ type: "text", text: blob }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting ContextPilot MCP server:", err);
  process.exit(1);
});

#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import { indexProject } from "./indexer";
import { search } from "./search";
import { buildContext } from "./context";

const program = new Command();

program
  .name("contextpilot")
  .description("Intelligent Context Manager for Claude Code")
  .version("0.1.0");

program
  .command("index")
  .description("Scan the project and build/update the function index")
  .option("-d, --dir <path>", "project root directory", ".")
  .option("-f, --force", "force full re-index, ignoring cached mtimes", false)
  .action(async (opts) => {
    const rootDir = path.resolve(opts.dir);
    const start = Date.now();
    const stats = await indexProject(rootDir, { force: opts.force });
    const ms = Date.now() - start;

    console.log(`✓ ${stats.filesScanned} files scanned`);
    console.log(`✓ ${stats.functionsIndexed} functions indexed`);
    console.log(`✓ index created (${ms}ms) -> .contextpilot/index.sqlite`);
  });

program
  .command("search <query...>")
  .description("Find the most relevant functions for a task description")
  .option("-d, --dir <path>", "project root directory", ".")
  .option("-k, --top <n>", "number of results", "5")
  .action(async (queryParts, opts) => {
    const rootDir = path.resolve(opts.dir);
    const query = queryParts.join(" ");
    const results = await search(rootDir, query, parseInt(opts.top, 10));

    if (results.length === 0) {
      console.log(
        `No matches found for "${query}". Have you run \`contextpilot index\`?`,
      );
      return;
    }

    results.forEach((r, i) => {
      const label = r.className ? `${r.className}.${r.name}()` : `${r.name}()`;
      console.log(label);
      console.log(r.filePath + `:${r.startLine}-${r.endLine}`);
      console.log(`Score: ${r.score.toFixed(2)}`);
      if (i < results.length - 1) console.log("-".repeat(20));
    });
  });

program
  .command("context <query...>")
  .description("Build a single pasteable context blob from the top matches")
  .option("-d, --dir <path>", "project root directory", ".")
  .option("-k, --top <n>", "number of functions to include", "6")
  .action((queryParts, opts) => {
    const rootDir = path.resolve(opts.dir);
    const query = queryParts.join(" ");
    const blob = buildContext(rootDir, query, parseInt(opts.top, 10));
    console.log(blob);
  });

program.parse();

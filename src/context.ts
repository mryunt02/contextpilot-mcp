import { openDb, getAllFunctions } from "./db";
import { search } from "./search";
import { FunctionInfo } from "./types";
import { SearchOptions } from "./search";
export async function buildContext(
  rootDir: string,
  query: string,
  topK = 6,
  options: SearchOptions = {},
): Promise<string> {
  const results = await search(rootDir, query, topK, options);
  if (results.length === 0) {
    return `// No relevant functions found for query: "${query}"\n// Try \`contextpilot index\` first, or rephrase the query.`;
  }

  const db = openDb(rootDir);
  const all = getAllFunctions(db);
  db.close();

  const chunks: string[] = [];
  for (const r of results) {
    const match = all.find(
      (fn) =>
        fn.filePath === r.filePath &&
        fn.name === r.name &&
        fn.startLine === r.startLine,
    );
    if (!match) continue;
    const label = match.className
      ? `${match.className}.${match.name}()`
      : `${match.name}()`;
    const provenance = r.relationship
      ? ` (${r.relationship}, depth ${r.expansionDepth})`
      : ` (score: ${r.score.toFixed(2)})`;
    chunks.push(`// ${label}\n// ${match.filePath}:${match.startLine}-${match.endLine}${provenance}\n${match.code}`);
  }

  return chunks.join("\n\n// " + "-".repeat(40) + "\n\n");
}

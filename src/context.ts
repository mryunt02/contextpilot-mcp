import { openDb, getAllFunctions } from "./db";
import { search } from "./search";
import { FunctionInfo } from "./types";
export async function buildContext(
  rootDir: string,
  query: string,
  topK = 6,
): Promise<string> {
  const results = await search(rootDir, query, topK);
  if (results.length === 0) {
    return `// No relevant functions found for query: "${query}"\n// Try \`contextpilot index\` first, or rephrase the query.`;
  }

  const db = openDb(rootDir);
  const all = getAllFunctions(db);
  db.close();

  const byKey = new Map<string, FunctionInfo>();
  for (const fn of all)
    byKey.set(`${fn.filePath}:${fn.name}:${fn.startLine}`, fn);

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
    chunks.push(
      `// ${label}\n// ${match.filePath}:${match.startLine}-${match.endLine} (score: ${r.score.toFixed(2)})\n${match.code}`,
    );
  }

  return chunks.join("\n\n// " + "-".repeat(40) + "\n\n");
}

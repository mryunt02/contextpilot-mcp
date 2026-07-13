import fs from "fs";
import path from "path";
import { scanProject } from "./scanner";
import { extractFunctions } from "./parser";
import {
  openDb,
  clearFileEntries,
  upsertFile,
  getFileMeta,
  insertFunctions,
  countFiles,
  countFunctions,
  rebuildCallGraph,
} from "./db";
import { IndexStats } from "./types";

export async function indexProject(
  rootDir: string,
  opts: { force?: boolean } = {},
): Promise<IndexStats> {
  const db = openDb(rootDir);
  const files = await scanProject(rootDir);

  let filesScanned = 0;
  let functionsIndexed = 0;

  for (const relPath of files) {
    const absPath = path.join(rootDir, relPath);
    const stat = fs.statSync(absPath);
    const mtimeMs = Math.floor(stat.mtimeMs);
    const size = stat.size;

    const existing = getFileMeta(db, relPath);
    const unchanged =
      !opts.force &&
      existing &&
      existing.mtimeMs === mtimeMs &&
      existing.size === size;

    if (unchanged) {
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8");
    const functions = extractFunctions(relPath, content);

    clearFileEntries(db, relPath);
    upsertFile(db, relPath, mtimeMs, size);
    await insertFunctions(db, functions);

    filesScanned++;
    functionsIndexed += functions.length;
  }
  rebuildCallGraph(db);

  const stats: IndexStats = {
    filesScanned: opts.force ? files.length : filesScanned,
    functionsIndexed: countFunctions(db),
  };

  db.close();
  return stats;
}

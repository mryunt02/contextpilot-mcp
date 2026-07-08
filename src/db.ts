import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { FunctionInfo } from "./types";
import { embedText, embeddingToBuffer, bufferToEmbedding } from "./embeddings";
const DB_DIRNAME = ".contextpilot";
const DB_FILENAME = "index.sqlite";

export function getDbPath(rootDir: string): string {
  return path.join(rootDir, DB_DIRNAME, DB_FILENAME);
}

export function openDb(rootDir: string): DatabaseSync {
  const dbDir = path.join(rootDir, DB_DIRNAME);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const db = new DatabaseSync(getDbPath(rootDir));
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      mtime_ms INTEGER NOT NULL,
      size INTEGER NOT NULL
    );
  `);
  db.exec(`
  CREATE TABLE IF NOT EXISTS functions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    class_name TEXT,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    code TEXT NOT NULL,
    embedding BLOB
  );
`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_functions_file_path ON functions(file_path);`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(name);`);

  return db;
}

export function clearFileEntries(db: DatabaseSync, filePath: string) {
  db.prepare(`DELETE FROM functions WHERE file_path = ?`).run(filePath);
  db.prepare(`DELETE FROM files WHERE path = ?`).run(filePath);
}

export function upsertFile(
  db: DatabaseSync,
  filePath: string,
  mtimeMs: number,
  size: number,
) {
  db.prepare(
    `INSERT INTO files (path, mtime_ms, size) VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET mtime_ms = excluded.mtime_ms, size = excluded.size`,
  ).run(filePath, mtimeMs, size);
}

export function getFileMeta(
  db: DatabaseSync,
  filePath: string,
): { mtimeMs: number; size: number } | null {
  const row = db
    .prepare(`SELECT mtime_ms as mtimeMs, size FROM files WHERE path = ?`)
    .get(filePath) as { mtimeMs: number; size: number } | undefined;
  return row ?? null;
}

export async function insertFunctions(
  db: DatabaseSync,
  functions: FunctionInfo[],
) {
  const stmt = db.prepare(`
    INSERT INTO functions (name, kind, class_name, file_path, start_line, end_line, code, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const withEmbeddings: Array<FunctionInfo & { embeddingBuf: Buffer }> = [];
  for (const fn of functions) {
    const textToEmbed = `${fn.className ? fn.className + "." : ""}${fn.name}\n${fn.code}`;
    const vec = await embedText(textToEmbed);
    withEmbeddings.push({ ...fn, embeddingBuf: embeddingToBuffer(vec) });
  }

  db.exec("BEGIN");
  try {
    for (const fn of withEmbeddings) {
      stmt.run(
        fn.name,
        fn.kind,
        fn.className ?? null,
        fn.filePath,
        fn.startLine,
        fn.endLine,
        fn.code,
        fn.embeddingBuf,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
export function getAllFunctions(db: DatabaseSync): FunctionInfo[] {
  const rows = db
    .prepare(
      `SELECT name, kind, class_name as className, file_path as filePath, start_line as startLine, end_line as endLine, code, embedding
       FROM functions`,
    )
    .all() as unknown as Array<FunctionInfo & { embedding: Buffer | null }>;

  return rows.map((row) => ({
    ...row,
    embedding: row.embedding ? bufferToEmbedding(row.embedding) : undefined,
  }));
}

export function countFiles(db: DatabaseSync): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM files`).get() as {
    c: number;
  };
  return row.c;
}

export function countFunctions(db: DatabaseSync): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM functions`).get() as {
    c: number;
  };
  return row.c;
}

import { getAllFunctions, getCallEdges, openDb } from "./db";
import { FunctionInfo, SearchResult } from "./types";
import { embedText, cosineSimilarity } from "./embeddings";

/**
 * v0.1 ranking: no embeddings yet (that's the "next stage" in the plan).
 * Instead we do weighted token overlap between the query and:
 *   - the function/method name (split on camelCase/snake_case) — heaviest weight
 *   - the class name
 *   - the function body text
 *
 * This already handles cases like "Fix login bug" -> AuthService.login()
 * reasonably well, because splitting identifiers into tokens turns
 * `login` into a direct hit against the query token `login`.
 * It will NOT handle purely semantic matches like
 * "Authentication fails after refresh" -> verifyPassword() without shared
 * words — that's exactly the gap embeddings close in the next milestone.
 */

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "fix",
  "bug",
  "issue",
  "error",
  "please",
  "to",
  "for",
  "in",
  "on",
  "of",
  "and",
  "or",
  "problem",
]);

function splitIdentifier(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenize(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9_]+/)
    .flatMap(splitIdentifier)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scoreFunction(queryTokens: string[], fn: FunctionInfo): number {
  const nameTokens = splitIdentifier(fn.name);
  const classTokens = fn.className ? splitIdentifier(fn.className) : [];
  const bodyTokens = tokenize(fn.code).slice(0, 500); // cap for perf on huge functions

  const nameSet = new Set(nameTokens);
  const classSet = new Set(classTokens);
  const bodyCount = new Map<string, number>();
  for (const t of bodyTokens) bodyCount.set(t, (bodyCount.get(t) ?? 0) + 1);

  let score = 0;
  const uniqueQueryTokens = new Set(queryTokens);

  for (const qt of uniqueQueryTokens) {
    if (nameSet.has(qt)) score += 3;
    if (classSet.has(qt)) score += 2;
    if (bodyCount.has(qt)) score += Math.min(1, bodyCount.get(qt)! * 0.2);
  }
  const maxPossible = uniqueQueryTokens.size * 3 + 0.01;
  return Math.min(0.99, score / maxPossible);
}

export interface SearchOptions {
  expandDependencies?: boolean;
  expansionDepth?: number;
}

export async function search(
  rootDir: string,
  query: string,
  topK = 5,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const db = openDb(rootDir);
  const allFunctions = getAllFunctions(db);
  const callEdges = options.expandDependencies ? getCallEdges(db) : [];
  db.close();

  const queryTokens = tokenize(query);
  const queryEmbedding = await embedText(query);

  const scored = allFunctions
    .map((fn) => {
      const keywordScore = scoreFunction(queryTokens, fn);
      const semanticScore = fn.embedding
        ? cosineSimilarity(queryEmbedding, fn.embedding)
        : 0;
      const finalScore = 0.6 * semanticScore + 0.4 * keywordScore;

      return {
        id: fn.id,
        name: fn.name,
        filePath: fn.filePath,
        startLine: fn.startLine,
        endLine: fn.endLine,
        className: fn.className,
        score: finalScore,
      };
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score);

  const matches = scored.slice(0, topK);
  if (!options.expandDependencies || matches.length === 0) {
    return matches.map(({ id: _id, ...result }) => result);
  }

  const maxDepth = Math.max(1, Math.floor(options.expansionDepth ?? 1));
  const byId = new Map(allFunctions.flatMap((fn) => fn.id === undefined ? [] : [[fn.id, fn]] as const));
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  for (const { callerId, calleeId } of callEdges) {
    (outgoing.get(callerId) ?? outgoing.set(callerId, []).get(callerId)!).push(calleeId);
    (incoming.get(calleeId) ?? incoming.set(calleeId, []).get(calleeId)!).push(callerId);
  }

  const resultById = new Map<number, SearchResult>();
  const queue: Array<{ id: number; depth: number }> = [];
  for (const match of matches) {
    if (match.id === undefined) continue;
    const { id, ...result } = match;
    resultById.set(id, result);
    queue.push({ id, depth: 0 });
  }

  for (let index = 0; index < queue.length; index++) {
    const { id, depth } = queue[index];
    if (depth >= maxDepth) continue;
    for (const [neighborId, relationship] of [
      ...(outgoing.get(id) ?? []).map((calleeId) => [calleeId, "calls"] as const),
      ...(incoming.get(id) ?? []).map((callerId) => [callerId, "called-by"] as const),
    ]) {
      if (resultById.has(neighborId)) continue;
      const fn = byId.get(neighborId);
      if (!fn) continue;
      resultById.set(neighborId, {
        name: fn.name,
        filePath: fn.filePath,
        startLine: fn.startLine,
        endLine: fn.endLine,
        className: fn.className,
        score: 0,
        relationship,
        expansionDepth: depth + 1,
      });
      queue.push({ id: neighborId, depth: depth + 1 });
    }
  }

  // Preserve ranked matches first, then breadth-first dependencies, which is
  // both useful to agents and keeps the context deterministic.
  return [...resultById.values()];
}

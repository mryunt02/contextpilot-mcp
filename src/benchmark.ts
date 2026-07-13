import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAllFunctions, openDb } from "./db";
import { indexProject } from "./indexer";
import { search, searchKeyword } from "./search";
import { FunctionInfo, SearchResult } from "./types";

const BENCHMARK_FILES: Record<string, string> = {
  "auth.ts": `export async function signIn(email: string, password: string) {
  const account = await lookupAccount(email);
  if (!account || !checkSecret(account, password)) throw new Error("Invalid credentials");
  return mintSession(account.id);
}

export function restoreSession(token: string) {
  return verifySessionToken(token);
}

function lookupAccount(email: string) { return { id: email }; }
function checkSecret(account: { id: string }, password: string) { return password.length > 0; }
function mintSession(accountId: string) { return accountId + ".session"; }
function verifySessionToken(token: string) { return token.endsWith(".session"); }
`,
  "billing.ts": `export function calculateInvoiceTotal(subtotal: number, discount: number) {
  return subtotal - applyDiscount(subtotal, discount);
}

function applyDiscount(amount: number, percent: number) { return amount * (percent / 100); }
export function createCheckout(total: number) { return { amount: total, currency: "USD" }; }
`,
  "notifications.ts": `export function sendPasswordReset(address: string) {
  return deliverEmail(address, "Reset your password");
}

function deliverEmail(address: string, subject: string) { return { address, subject }; }
export function renderWelcomeMessage(name: string) { return "Welcome " + name; }
`,
};

const SCENARIOS = [
  {
    query: "restore login after browser reload",
    relevant: ["auth.ts:restoreSession", "auth.ts:verifySessionToken"],
  },
  {
    query: "calculate the price after a percentage discount",
    relevant: ["billing.ts:calculateInvoiceTotal", "billing.ts:applyDiscount"],
  },
  {
    query: "email a password recovery link",
    relevant: [
      "notifications.ts:sendPasswordReset",
      "notifications.ts:deliverEmail",
    ],
  },
];

export interface BenchmarkMethod {
  name: "Full Repository" | "Keyword Search" | "Hybrid Search";
  indexingMs: number | null;
  retrievalLatencyMs: number;
  tokenReductionPercent: number;
  precision: number;
  recall: number;
}

export interface BenchmarkReport {
  corpus: {
    files: number;
    functions: number;
    scenarios: number;
    estimatedRepositoryTokens: number;
  };
  generatedAt: string;
  methods: BenchmarkMethod[];
  notes: string[];
}

function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function functionKey(
  fn: Pick<FunctionInfo | SearchResult, "filePath" | "name">,
): string {
  return `${fn.filePath}:${fn.name}`;
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function metricsFor(
  resultsByScenario: SearchResult[][],
  allFunctions: FunctionInfo[],
  repositoryTokens: number,
): Pick<
  BenchmarkMethod,
  "retrievalLatencyMs" | "tokenReductionPercent" | "precision" | "recall"
> {
  const precisions: number[] = [];
  const recalls: number[] = [];
  const reductions: number[] = [];
  for (let index = 0; index < SCENARIOS.length; index++) {
    const returned = resultsByScenario[index];
    const relevant = new Set(SCENARIOS[index].relevant);
    const returnedKeys = new Set(returned.map(functionKey));
    const hits = [...returnedKeys].filter((key) => relevant.has(key)).length;
    precisions.push(returned.length === 0 ? 0 : hits / returned.length);
    recalls.push(hits / relevant.size);
    const contextTokens = returned.reduce((total, result) => {
      const fn = allFunctions.find(
        (candidate) => functionKey(candidate) === functionKey(result),
      );
      return total + (fn ? estimatedTokens(fn.code) : 0);
    }, 0);
    reductions.push(100 * (1 - contextTokens / repositoryTokens));
  }
  return {
    retrievalLatencyMs: 0,
    tokenReductionPercent: average(reductions),
    precision: average(precisions),
    recall: average(recalls),
  };
}

async function timedQueries(
  queries: (query: string) => Promise<SearchResult[]> | SearchResult[],
): Promise<{ results: SearchResult[][]; averageMs: number }> {
  const results: SearchResult[][] = [];
  const timings: number[] = [];
  for (const scenario of SCENARIOS) {
    const start = performance.now();
    results.push(await queries(scenario.query));
    timings.push(performance.now() - start);
  }
  return { results, averageMs: average(timings) };
}

export async function runBenchmark(): Promise<BenchmarkReport> {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "contextpilot-benchmark-"),
  );
  try {
    for (const [filePath, content] of Object.entries(BENCHMARK_FILES)) {
      fs.writeFileSync(path.join(rootDir, filePath), content);
    }
    const indexStart = performance.now();
    await indexProject(rootDir, { force: true });
    const indexingMs = performance.now() - indexStart;

    const db = openDb(rootDir);
    const allFunctions = getAllFunctions(db);
    db.close();
    const repositoryTokens = Object.values(BENCHMARK_FILES).reduce(
      (total, content) => total + estimatedTokens(content),
      0,
    );

    const full = await timedQueries(() =>
      allFunctions.map((fn) => ({
        name: fn.name,
        filePath: fn.filePath,
        startLine: fn.startLine,
        endLine: fn.endLine,
        className: fn.className,
        score: 1,
      })),
    );
    const keyword = await timedQueries((query) =>
      searchKeyword(rootDir, query, 3),
    );
    const hybrid = await timedQueries((query) => search(rootDir, query, 3));

    const fullMetrics = metricsFor(
      full.results,
      allFunctions,
      repositoryTokens,
    );
    fullMetrics.tokenReductionPercent = 0;
    const keywordMetrics = metricsFor(
      keyword.results,
      allFunctions,
      repositoryTokens,
    );
    const hybridMetrics = metricsFor(
      hybrid.results,
      allFunctions,
      repositoryTokens,
    );
    return {
      corpus: {
        files: Object.keys(BENCHMARK_FILES).length,
        functions: allFunctions.length,
        scenarios: SCENARIOS.length,
        estimatedRepositoryTokens: repositoryTokens,
      },
      generatedAt: new Date().toISOString(),
      methods: [
        {
          name: "Full Repository",
          indexingMs: null,
          ...fullMetrics,
          retrievalLatencyMs: full.averageMs,
        },
        {
          name: "Keyword Search",
          indexingMs,
          ...keywordMetrics,
          retrievalLatencyMs: keyword.averageMs,
        },
        {
          name: "Hybrid Search",
          indexingMs,
          ...hybridMetrics,
          retrievalLatencyMs: hybrid.averageMs,
        },
      ],
      notes: [
        "The fixed fixture corpus and relevance labels make results reproducible.",
        "Token counts use ceil(characters / 4), a stable approximation for comparing context size.",
        "Keyword and Hybrid Search share one index; Hybrid Search adds local embedding similarity to keyword ranking.",
      ],
    };
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const indexingSpeed = (value: number | null) =>
    value === null
      ? "N/A"
      : `${(report.corpus.functions / (value / 1000)).toFixed(1)} funcs/s (${value.toFixed(1)} ms)`;
  return [
    "# ContextPilot Benchmark Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Corpus: ${report.corpus.files} files, ${report.corpus.functions} functions, ${report.corpus.scenarios} queries, ~${report.corpus.estimatedRepositoryTokens} repository tokens.`,
    "",
    "| Method | Indexing speed | Retrieval latency | Token reduction | Precision@3 | Recall@3 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.methods.map(
      (method) =>
        `| ${method.name} | ${indexingSpeed(method.indexingMs)} | ${method.retrievalLatencyMs.toFixed(1)} ms | ${method.tokenReductionPercent.toFixed(1)}% | ${percent(method.precision)} | ${percent(method.recall)} |`,
    ),
    "",
    ...report.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}

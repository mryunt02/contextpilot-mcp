import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBenchmarkReport } from "../benchmark";

test("formats all benchmark comparison metrics as Markdown", () => {
  const report = formatBenchmarkReport({
    generatedAt: "2026-07-13T00:00:00.000Z",
    corpus: { files: 3, functions: 10, scenarios: 3, estimatedRepositoryTokens: 200 },
    methods: [
      { name: "Full Repository", indexingMs: null, retrievalLatencyMs: 1, tokenReductionPercent: 0, precision: 0.2, recall: 1 },
      { name: "Keyword Search", indexingMs: 12, retrievalLatencyMs: 2, tokenReductionPercent: 80, precision: 0.6, recall: 0.8 },
      { name: "Hybrid Search", indexingMs: 12, retrievalLatencyMs: 3, tokenReductionPercent: 75, precision: 0.8, recall: 1 },
    ],
    notes: ["fixed corpus"],
  });
  assert.match(report, /Indexing speed/);
  assert.match(report, /Hybrid Search/);
  assert.match(report, /80\.0%/);
  assert.match(report, /100\.0%/);
});

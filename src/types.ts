export interface FunctionInfo {
  id?: number;
  name: string;
  kind: "function" | "arrow" | "method" | "class";
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  className?: string;
  embedding?: Float32Array;
}

export interface SearchResult {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  className?: string;
  relationship?: "calls" | "called-by";
  expansionDepth?: number;
}

export interface IndexStats {
  filesScanned: number;
  functionsIndexed: number;
}

export interface CallEdge {
  callerId: number;
  calleeId: number;
}

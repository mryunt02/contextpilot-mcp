export interface FunctionInfo {
  name: string;
  kind: "function" | "arrow" | "method" | "class";
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  className?: string;
}

export interface SearchResult {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  className?: string;
}

export interface IndexStats {
  filesScanned: number;
  functionsIndexed: number;
}

export interface FunctionInfo {
  name: string;
  kind: "function" | "arrow" | "method" | "class";
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  className?: string;
  embedding?: Float32Array;
}

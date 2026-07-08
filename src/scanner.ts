import fg from "fast-glob";
import path from "path";

/**
 * Scans a project root and returns relative paths of all source files
 * we know how to parse. Kept deliberately narrow for the v0.1 MVP:
 * JS/TS/JSX/TSX only. More languages (Python, Go, etc.) can be added
 * to SUPPORTED_EXTENSIONS + parser.ts without touching this file.
 */
const SUPPORTED_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**",
  "**/*.d.ts",
  "**/*.min.js",
];

export interface ScanOptions {
  ignore?: string[];
}

export async function scanProject(
  rootDir: string,
  options: ScanOptions = {}
): Promise<string[]> {
  const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*.${ext}`);
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];

  const files = await fg(patterns, {
    cwd: rootDir,
    ignore,
    onlyFiles: true,
    dot: false,
  });

  return files.map((f) => path.normalize(f));
}

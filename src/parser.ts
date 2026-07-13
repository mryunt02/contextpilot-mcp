import ts from "typescript";
import path from "node:path";
import { FunctionInfo } from "./types";

export interface CallReference {
  name: string;
  receiver?: string;
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx": return ts.ScriptKind.TSX;
    case ".jsx": return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs": return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function sourceFile(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
}

function propertyNameText(name: ts.PropertyName | undefined, file: ts.SourceFile): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(file);
}

function assignedName(node: ts.FunctionExpression | ts.ArrowFunction, file: ts.SourceFile): string | undefined {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent)) return propertyNameText(parent.name as ts.PropertyName, file);
  if (ts.isPropertyAssignment(parent)) return propertyNameText(parent.name, file);
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return parent.left.getText(file);
  }
  if (ts.isExportAssignment(parent)) return "default";
  return undefined;
}

function functionName(node: ts.FunctionLikeDeclaration, file: ts.SourceFile): string {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return assignedName(node, file) ?? "<anonymous>";
  }
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (
    ts.isFunctionDeclaration(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  ) return "default";
  if ("name" in node) return propertyNameText(node.name, file) ?? "<anonymous>";
  return "<anonymous>";
}

function containingClassName(node: ts.Node, file: ts.SourceFile): string | undefined {
  let current = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      return current.name?.text ?? "<anonymous class>";
    }
    current = current.parent;
  }
  return undefined;
}

function functionKind(node: ts.FunctionLikeDeclaration): FunctionInfo["kind"] {
  if (ts.isArrowFunction(node)) return "arrow";
  if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return "method";
  return "function";
}

/**
 * Extracts every executable function-like declaration using the TypeScript
 * compiler AST. Unlike the previous line scanner, this follows the language
 * grammar and preserves exact source offsets, including decorators/modifiers.
 */
export function extractFunctions(filePath: string, content: string): FunctionInfo[] {
  const file = sourceFile(filePath, content);
  const results: FunctionInfo[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      // Signatures and abstract methods have no implementation to provide as context.
      if (node.body) {
        const startOffset = node.getStart(file);
        const endOffset = node.getEnd();
        results.push({
          name: functionName(node, file),
          kind: functionKind(node),
          filePath,
          startLine: file.getLineAndCharacterOfPosition(startOffset).line + 1,
          endLine: file.getLineAndCharacterOfPosition(Math.max(startOffset, endOffset - 1)).line + 1,
          startOffset,
          endOffset,
          code: content.slice(startOffset, endOffset),
          className: containingClassName(node, file),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return results;
}

/** Extract call sites via the AST so declarations, generics, and comments are never mistaken for calls. */
export function extractCallReferences(code: string): CallReference[] {
  const file = sourceFile("snippet.ts", code);
  const calls = new Map<string, CallReference>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      let name: string | undefined;
      let receiver: string | undefined;
      if (ts.isIdentifier(node.expression)) {
        name = node.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        name = node.expression.name.text;
        const expression = node.expression.expression;
        if (expression.kind === ts.SyntaxKind.ThisKeyword) receiver = "this";
        else if (ts.isIdentifier(expression)) receiver = expression.text;
      }
      if (name) calls.set(`${receiver ?? ""}:${name}`, { name, receiver });
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return [...calls.values()];
}

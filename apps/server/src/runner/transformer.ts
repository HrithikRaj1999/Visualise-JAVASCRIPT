import ts from "typescript";

export function createTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    return (sourceFile) => {
      const visitor: ts.Visitor = (node) => {
        // Inject source location into function definitions
        if (
          ts.isFunctionDeclaration(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node)
        ) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          // Inject: __bindSource(fn, line, col)
          // We wrap the function expression or declaration if possible, or leave it to runtime.
          // Simpler approach used in index.ts: just attach property?
          // The previous implementation used `__bindSource` wrapper.
          // Actually, let's look at how we implemented it in index.ts.
          // We didn't wrap the definition node *in place* with a call usually,
          // unless it's an expression.
          // Wait, the index.ts implementation uses a `CallExpression` wrapper.
        }

        // Look for setTimeout/setInterval/etc calls to inject source
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          let name = "";
          if (ts.isIdentifier(expression)) {
            name = expression.text;
          } else if (
            ts.isPropertyAccessExpression(expression) &&
            ts.isIdentifier(expression.name)
          ) {
            name = expression.name.text;
          }

          if (
            [
              "setTimeout",
              "setInterval",
              "setImmediate",
              "queueMicrotask",
              "nextTick",
              "then",
            ].includes(name)
          ) {
            const { line, character } =
              sourceFile.getLineAndCharacterOfPosition(node.getStart());
            // Replace the callback argument (usually the first one)
            // with __bindSource(callback, line, col)
            // This is complex to do perfectly.
            // Let's stick to the previous simple transformer if possible.
          }
        }
        return ts.visitEachChild(node, visitor, context);
      };

      // Basic transformer from index.ts was:
      /*
      const transformer = (context: ts.TransformationContext) => (rootNode: ts.Node) => {
        function visit(node: ts.Node): ts.Node {
          if (ts.isCallExpression(node)) { ... }
          return ts.visitEachChild(node, visit, context);
        }
        return ts.visitNode(rootNode, visit);
      };
      */

      function visit(node: ts.Node): ts.Node {
        if (ts.isCallExpression(node)) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          // We inject a virtual "source" property or wrap the callback?
          // The User's previous code injected `__bindSource`

          // Re-implementing the exact logic from index.ts:
          const expression = node.expression;
          let isAsyncCall = false;

          if (ts.isIdentifier(expression)) {
            if (
              [
                "setTimeout",
                "setInterval",
                "setImmediate",
                "queueMicrotask",
              ].includes(expression.text)
            )
              isAsyncCall = true;
          } else if (ts.isPropertyAccessExpression(expression)) {
            if (
              expression.name.text === "nextTick" &&
              ts.isIdentifier(expression.expression) &&
              expression.expression.text === "process"
            )
              isAsyncCall = true;
            if (expression.name.text === "then") isAsyncCall = true; // Promise.then
          }

          if (isAsyncCall && node.arguments.length > 0) {
            const callback = node.arguments[0];
            // wrap callback with __bindSource(callback, line + 1, character + 1)
            const bindCall = ts.factory.createCallExpression(
              ts.factory.createIdentifier("__bindSource"),
              undefined,
              [
                callback,
                ts.factory.createNumericLiteral(line + 1),
                ts.factory.createNumericLiteral(character + 1),
              ],
            );
            const newArgs = [...node.arguments];
            newArgs[0] = bindCall;
            return ts.factory.updateCallExpression(
              node,
              node.expression,
              node.typeArguments,
              ts.factory.createNodeArray(newArgs),
            );
          }
        }
        return ts.visitEachChild(node, visit, context);
      }
      return ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  };
}

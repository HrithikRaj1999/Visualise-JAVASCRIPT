import { WebSocketServer } from "ws";
import { Worker } from "node:worker_threads";
import { transform } from "esbuild";
import type { VisualizerEvent } from "@jsv/protocol";
import ts from "typescript";

type ClientCommand =
  | { type: "SUBSCRIBE" }
  | {
      type: "RUN_CODE";
      payload: { code: string; language?: "js" | "ts"; maxEvents?: number };
    };

// --- AST Transformer for Source Mapping ---
import fs from "node:fs";

function createTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    return (sourceFile) => {
      const visitor: ts.Visitor = (node) => {
        if (ts.isCallExpression(node)) {
          let targetName = "";

          if (ts.isIdentifier(node.expression)) {
            targetName = node.expression.text;
          } else if (ts.isPropertyAccessExpression(node.expression)) {
            // Handle process.nextTick, Promise.resolve().then
            if (ts.isIdentifier(node.expression.name)) {
              const prop = node.expression.name.text;
              if (ts.isIdentifier(node.expression.expression as any)) {
                const obj = (node.expression.expression as any).text;
                if (obj === "process" && prop === "nextTick")
                  targetName = "process.nextTick";
                if (obj === "console") return node; // Skip console
              } else if (prop === "then") {
                // Promise.then detection is loose but acceptable for this MVP
                targetName = "Promise.then";
              }
            }
          }

          if (
            [
              "setTimeout",
              "setInterval",
              "setImmediate",
              "process.nextTick",
              "queueMicrotask",
              "Promise.then",
            ].includes(targetName) &&
            node.arguments.length > 0
          ) {
            fs.appendFileSync(
              "debug.log",
              `Transformer matched: ${targetName}\n`,
            );
            // Identify the callback argument position
            let callbackIndex = 0; // Default first arg
            if (["setTimeout", "setInterval"].includes(targetName)) {
              callbackIndex = 0;
            }
            // For Promise.then(onFulfilled, onRejected), we might want both?
            // MVP: just wrap the first one.

            if (
              node.arguments.length > callbackIndex &&
              (ts.isArrowFunction(node.arguments[callbackIndex]) ||
                ts.isFunctionExpression(node.arguments[callbackIndex]) ||
                ts.isIdentifier(node.arguments[callbackIndex]))
            ) {
              const callback = node.arguments[callbackIndex];
              const { line, character } =
                sourceFile.getLineAndCharacterOfPosition(node.getStart());

              // Inject __bindSource(callback, line, col)
              const wrapped = ts.factory.createCallExpression(
                ts.factory.createIdentifier("__bindSource"),
                undefined,
                [
                  callback,
                  ts.factory.createNumericLiteral(line + 1),
                  ts.factory.createNumericLiteral(character + 1),
                ],
              );

              const newArgs = [...node.arguments];
              newArgs[callbackIndex] = wrapped;

              return ts.factory.updateCallExpression(
                node,
                node.expression,
                node.typeArguments,
                newArgs,
              );
            }
          }
        }
        return ts.visitEachChild(node, visitor, context);
      };
      return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
    };
  };
}

async function transpileCode(
  code: string,
  language: "js" | "ts",
): Promise<{ js: string; diagnostics: VisualizerEvent[] }> {
  // Always use TS transpileModule to apply our transformer
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: false, // Loose for snippets
      allowJs: true,
      sourceMap: false,
    },
    reportDiagnostics: true,
    transformers: {
      before: [createTransformer()],
    },
  });

  const diagnostics: VisualizerEvent[] = result.diagnostics?.length
    ? [
        {
          type: "TS_DIAGNOSTIC",
          ts: Date.now(),
          diagnostics: result.diagnostics.map((diagnostic) => {
            const position = diagnostic.file?.getLineAndCharacterOfPosition(
              diagnostic.start ?? 0,
            );
            return {
              message: ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                "\n",
              ),
              line: (position?.line ?? 0) + 1,
              col: (position?.character ?? 0) + 1,
            };
          }),
        },
      ]
    : [];

  return { js: result.outputText, diagnostics };
}

function createWorkerScript(js: string, maxEvents: number): string {
  return `
const { parentPort } = require('node:worker_threads');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

let counter = 0;
let events = 0;

const emit = (event) => {
  events += 1;
  if (events > ${maxEvents}) {
    parentPort.postMessage({ type: 'RUNTIME_ERROR', ts: Date.now(), message: 'Max event limit reached.' });
    process.exit(0);
  }
  parentPort.postMessage(event);
};

// --- Source Binding Helper ---
const __bindSource = (fn, line, col) => {
  if (typeof fn === 'function') {
    fn.source = { line, col };
  }
  return fn;
};

const wrapTask = (queue, label, callback) => {
  const taskId = queue + ':' + (++counter);
  const source = callback.source; // Extract source
  emit({ type: 'ENQUEUE_TASK', queue, taskId, label, source, ts: Date.now() });
  
  return (...args) => {
    emit({ type: 'PHASE_ENTER', phase: queue === 'io' ? 'io' : queue, ts: Date.now() });
    emit({ type: 'DEQUEUE_TASK', queue, taskId, ts: Date.now() });
    emit({ type: 'CALLBACK_START', taskId, label, source, ts: Date.now() });
    try {
      callback(...args);
    } finally {
      emit({ type: 'CALLBACK_END', taskId, ts: Date.now() });
      emit({ type: 'DRAIN_MICROTASKS_START', ts: Date.now() });
      emit({ type: 'DRAIN_MICROTASKS_END', ts: Date.now() });
      emit({ type: 'PHASE_EXIT', phase: queue === 'io' ? 'io' : queue, ts: Date.now() });
    }
  };
};

const wrapMicrotask = (queue, label, callback) => {
  const id = queue + ':' + (++counter);
  const source = callback.source;
  emit({ type: 'ENQUEUE_MICROTASK', queue, id, label, source, ts: Date.now() });
  return () => {
    emit({ type: 'DEQUEUE_MICROTASK', queue, id, ts: Date.now() });
    callback();
  };
};

const patchedFs = {
  ...fs,
  readFile(path, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? undefined : options;
    return fs.readFile(path, opts, wrapTask('io', 'fs.readFile callback', cb));
  },
};

const originalOn = EventEmitter.prototype.on;
EventEmitter.prototype.on = function patchedOn(event, listener) {
  if (event === 'close') {
    return originalOn.call(this, event, wrapTask('close', 'close handler', listener));
  }
  return originalOn.call(this, event, listener);
};

const context = {
  __bindSource, // Expose helper
  console: {
    log: (...args) => emit({ type: 'CONSOLE', level: 'log', args, ts: Date.now() }),
    warn: (...args) => emit({ type: 'CONSOLE', level: 'warn', args, ts: Date.now() }),
    error: (...args) => emit({ type: 'CONSOLE', level: 'error', args, ts: Date.now() }),
  },
  setTimeout: (cb, ms, ...args) => setTimeout(wrapTask('timers', 'setTimeout callback', cb), ms, ...args),
  setInterval: (cb, ms, ...args) => setInterval(wrapTask('timers', 'setInterval callback', cb), ms, ...args),
  setImmediate: (cb, ...args) => setImmediate(wrapTask('check', 'setImmediate callback', cb), ...args),
  queueMicrotask: (cb) => queueMicrotask(wrapMicrotask('promise', 'queueMicrotask callback', cb)),
  process: {
    ...process,
    nextTick: (cb, ...args) => process.nextTick(wrapMicrotask('nextTick', 'process.nextTick callback', cb), ...args),
  },
  require: (moduleId) => {
    if (moduleId === 'node:fs' || moduleId === 'fs') return patchedFs;
    return require(moduleId);
  },
  fs: patchedFs,
  fetch: (...args) => {
    const wrapped = wrapTask('io', 'fetch callback', () => {});
    return fetch(...args).then((result) => {
      wrapped();
      return result;
    });
  },
};

emit({ type: 'SCRIPT_START', ts: Date.now() });
try {
  vm.runInNewContext(${JSON.stringify(js)}, context, { timeout: 5000 });
  emit({ type: 'DRAIN_MICROTASKS_START', ts: Date.now() });
  emit({ type: 'DRAIN_MICROTASKS_END', ts: Date.now() });
  setTimeout(() => process.exit(0), 20);
} catch (error) {
  emit({ type: 'RUNTIME_ERROR', ts: Date.now(), message: error.message, stack: error.stack });
  process.exit(1);
}
`;
}

function startWorker(
  js: string,
  send: (event: VisualizerEvent) => void,
  maxEvents: number,
): Worker {
  const script = createWorkerScript(js, maxEvents);
  const worker = new Worker(script, { eval: true });
  worker.on("message", (event: VisualizerEvent) => send(event));
  return worker;
}

export function createServer(port = 8080) {
  const wss = new WebSocketServer({ port });

  wss.on("listening", () => {
    console.log(`[server] WebSocket listening on ws://localhost:${port}`);
  });

  wss.on("error", (error: NodeJS.ErrnoException) => {
    console.error("[server] Failed to start WebSocket server:", error);
    if (error.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${port} is already in use. Stop the old process or run with PORT=<new-port>.`,
      );
      process.exit(1);
    }
  });

  wss.on("connection", (socket) => {
    console.log("[server] Client connected");
    socket.on("message", async (raw) => {
      let command: ClientCommand;
      try {
        command = JSON.parse(raw.toString()) as ClientCommand;
      } catch {
        return;
      }

      if (command.type === "SUBSCRIBE") {
        return;
      }

      if (command.type !== "RUN_CODE") {
        return;
      }

      const language = command.payload.language ?? "js";
      const maxEvents = command.payload.maxEvents ?? 2000;
      const { js, diagnostics } = await transpileCode(
        command.payload.code,
        language,
      );

      diagnostics.forEach((event) => socket.send(JSON.stringify(event)));
      if (!js.trim()) {
        socket.send(JSON.stringify({ type: "SCRIPT_END", ts: Date.now() }));
        return;
      }

      const worker = startWorker(
        js,
        (event) => socket.send(JSON.stringify(event)),
        maxEvents,
      );
      worker.once("exit", () => {
        socket.send(JSON.stringify({ type: "SCRIPT_END", ts: Date.now() }));
      });
    });
  });

  return wss;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8080);
  console.log(`[server] Starting backend on port ${port}...`);
  const server = createServer(port);
  const shutdown = () => {
    server.close(() => {
      console.log("[server] Shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

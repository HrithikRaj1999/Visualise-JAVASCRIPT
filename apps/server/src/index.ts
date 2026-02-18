import { WebSocketServer } from 'ws';
import { Worker } from 'node:worker_threads';
import { transform } from 'esbuild';
import type { VisualizerEvent } from '@jsv/protocol';
import ts from 'typescript';

type ClientCommand =
  | { type: 'SUBSCRIBE' }
  | { type: 'RUN_CODE'; payload: { code: string; language?: 'js' | 'ts'; maxEvents?: number } };

async function transpileCode(code: string, language: 'js' | 'ts'): Promise<{ js: string; diagnostics: VisualizerEvent[] }> {
  if (language === 'js') {
    return { js: code, diagnostics: [] };
  }

  const tsDiagnostics = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
    reportDiagnostics: true,
  });

  let js = '';
  try {
    const result = await transform(code, {
      loader: 'ts',
      format: 'cjs',
      sourcemap: true,
      target: 'node20',
    });
    js = result.code;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to transpile TypeScript.';
    return {
      js: '',
      diagnostics: [
        {
          type: 'TS_DIAGNOSTIC',
          ts: Date.now(),
          diagnostics: [{ message, line: 1, col: 1 }],
        },
      ],
    };
  }

  const diagnostics: VisualizerEvent[] =
    tsDiagnostics.diagnostics?.length
      ? [
          {
            type: 'TS_DIAGNOSTIC',
            ts: Date.now(),
            diagnostics: tsDiagnostics.diagnostics.map((diagnostic) => {
              const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
              return {
                message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                line: (position?.line ?? 0) + 1,
                col: (position?.character ?? 0) + 1,
              };
            }),
          },
        ]
      : [];

  return { js, diagnostics };
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

const wrapTask = (queue, label, callback) => {
  const taskId = queue + ':' + (++counter);
  emit({ type: 'ENQUEUE_TASK', queue, taskId, label, ts: Date.now() });
  return (...args) => {
    emit({ type: 'PHASE_ENTER', phase: queue === 'io' ? 'io' : queue, ts: Date.now() });
    emit({ type: 'DEQUEUE_TASK', queue, taskId, ts: Date.now() });
    emit({ type: 'CALLBACK_START', taskId, label, ts: Date.now() });
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
  emit({ type: 'ENQUEUE_MICROTASK', queue, id, label, ts: Date.now() });
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
  console: {
    log: (...args) => emit({ type: 'CONSOLE', level: 'log', args, ts: Date.now() }),
    warn: (...args) => emit({ type: 'CONSOLE', level: 'warn', args, ts: Date.now() }),
    error: (...args) => emit({ type: 'CONSOLE', level: 'error', args, ts: Date.now() }),
  },
  setTimeout: (cb, ms, ...args) => setTimeout(wrapTask('timers', 'setTimeout callback', () => cb(...args)), ms),
  setInterval: (cb, ms, ...args) => setInterval(wrapTask('timers', 'setInterval callback', () => cb(...args)), ms),
  setImmediate: (cb, ...args) => setImmediate(wrapTask('check', 'setImmediate callback', () => cb(...args))),
  queueMicrotask: (cb) => queueMicrotask(wrapMicrotask('promise', 'queueMicrotask callback', cb)),
  process: {
    ...process,
    nextTick: (cb, ...args) => process.nextTick(wrapMicrotask('nextTick', 'process.nextTick callback', () => cb(...args))),
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

function startWorker(js: string, send: (event: VisualizerEvent) => void, maxEvents: number): Worker {
  const script = createWorkerScript(js, maxEvents);
  const worker = new Worker(script, { eval: true });
  worker.on('message', (event: VisualizerEvent) => send(event));
  return worker;
}

export function createServer(port = 8080) {
  const wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    console.log(`[server] WebSocket listening on ws://localhost:${port}`);
  });

  wss.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[server] Failed to start WebSocket server:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`[server] Port ${port} is already in use. Stop the old process or run with PORT=<new-port>.`);
      process.exit(1);
    }
  });

  wss.on('connection', (socket) => {
    console.log('[server] Client connected');
    socket.on('message', async (raw) => {
      let command: ClientCommand;
      try {
        command = JSON.parse(raw.toString()) as ClientCommand;
      } catch {
        return;
      }

      if (command.type === 'SUBSCRIBE') {
        return;
      }

      if (command.type !== 'RUN_CODE') {
        return;
      }

      const language = command.payload.language ?? 'js';
      const maxEvents = command.payload.maxEvents ?? 2000;
      const { js, diagnostics } = await transpileCode(command.payload.code, language);

      diagnostics.forEach((event) => socket.send(JSON.stringify(event)));
      if (!js.trim()) {
        socket.send(JSON.stringify({ type: 'SCRIPT_END', ts: Date.now() }));
        return;
      }

      const worker = startWorker(js, (event) => socket.send(JSON.stringify(event)), maxEvents);
      worker.once('exit', () => {
        socket.send(JSON.stringify({ type: 'SCRIPT_END', ts: Date.now() }));
      });
    });
  });

  return wss;
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 8080);
  console.log(`[server] Starting backend on port ${port}...`);
  const server = createServer(port);
  const shutdown = () => {
    server.close(() => {
      console.log('[server] Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

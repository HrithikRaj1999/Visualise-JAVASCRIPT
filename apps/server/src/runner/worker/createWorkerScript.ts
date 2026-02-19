export function createWorkerScript(js: string, maxEvents: number): string {
  return `
const { parentPort } = require('node:worker_threads');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

let counter = 0;
let events = 0;
let currentSource = undefined;
let currentPhase = null;
let pollWaiting = false;
let callbackDepth = 0;

const activeHandles = new Map();
const activeRequests = new Map();
const timeoutHandleMap = new Map();
const intervalHandleMap = new Map();
const immediateHandleMap = new Map();

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

const inferSourceFromStack = () => {
  try {
    const stack = String(new Error().stack || '');
    const lines = stack.split('\\n');
    let firstMatch = undefined;
    for (const line of lines) {
      const match =
        line.match(/evalmachine\\.<anonymous>:(\\d+):(\\d+)/) ||
        line.match(/<anonymous>:(\\d+):(\\d+)/);
      if (!match) {
        continue;
      }
      const source = { line: Number(match[1]), col: Number(match[2]) };
      if (!firstMatch) {
        firstMatch = source;
      }
      if (
        line.includes('emitConsoleWithFrame') ||
        line.includes('Object.log') ||
        line.includes('Object.warn') ||
        line.includes('Object.error')
      ) {
        continue;
      }
      return source;
    }
    return firstMatch;
  } catch {
    return undefined;
  }
};

const emitConsoleWithFrame = (level, args) => {
  const source = currentSource || inferSourceFromStack();
  if (callbackDepth > 0) {
    emit({ type: 'CONSOLE', level, args, source, ts: Date.now() });
    return;
  }

  const taskId = 'sync-console:' + (++counter);
  emit({
    type: 'CALLBACK_START',
    taskId,
    label: 'sync execution',
    source,
    ts: Date.now(),
  });
  callbackDepth += 1;
  try {
    emit({ type: 'CONSOLE', level, args, source, ts: Date.now() });
  } finally {
    emit({ type: 'CALLBACK_END', taskId, ts: Date.now() });
    emit({
      type: 'MICROTASK_CHECKPOINT',
      scope: 'after_callback',
      detail: 'sync console emission finished',
      ts: Date.now(),
    });
    callbackDepth = Math.max(0, callbackDepth - 1);
  }
};

const phaseForQueue = (queue) => (queue === 'io' ? 'poll' : queue);

const openHandle = (kind, label, source) => {
  const id = 'h:' + (++counter);
  activeHandles.set(id, { kind, label });
  emit({ type: 'HANDLE_OPEN', id, kind, label, source, ts: Date.now() });
  if (!pollWaiting) {
    emit({ type: 'POLL_WAIT_START', reason: 'Waiting for async work', ts: Date.now() });
    pollWaiting = true;
  }
  return id;
};

const closeHandle = (id) => {
  if (!id) return;
  if (!activeHandles.has(id)) return;
  activeHandles.delete(id);
  emit({ type: 'HANDLE_CLOSE', id, ts: Date.now() });
  if (pollWaiting && activeHandles.size === 0 && activeRequests.size === 0) {
    emit({ type: 'POLL_WAIT_END', reason: 'No active handles/requests', ts: Date.now() });
    pollWaiting = false;
  }
};

const startRequest = (kind, label, source) => {
  const id = 'r:' + (++counter);
  activeRequests.set(id, { kind, label });
  emit({ type: 'REQUEST_START', id, kind, label, source, ts: Date.now() });
  emit({
    type: 'WEBAPI_SCHEDULE',
    kind: 'io',
    requestId: id,
    job: label,
    source,
    ts: Date.now(),
  });
  if (!pollWaiting) {
    emit({ type: 'POLL_WAIT_START', reason: 'Waiting for I/O completion', ts: Date.now() });
    pollWaiting = true;
  }
  return id;
};

const endRequest = (id, status = 'ok') => {
  if (!id) return;
  if (!activeRequests.has(id)) return;
  activeRequests.delete(id);
  emit({ type: 'REQUEST_END', id, status, ts: Date.now() });
  if (pollWaiting && activeHandles.size === 0 && activeRequests.size === 0) {
    emit({ type: 'POLL_WAIT_END', reason: 'No active handles/requests', ts: Date.now() });
    pollWaiting = false;
  }
};

const enterPhase = (phase) => {
  if (currentPhase === phase) {
    return;
  }
  if (currentPhase) {
    emit({
      type: 'MICROTASK_CHECKPOINT',
      scope: 'phase_transition',
      detail: 'Leaving ' + currentPhase + ' phase',
      ts: Date.now(),
    });
    emit({ type: 'PHASE_EXIT', phase: currentPhase, ts: Date.now() });
  }
  emit({ type: 'PHASE_ENTER', phase, ts: Date.now() });
  currentPhase = phase;
};

const leavePhaseSoon = (phase) => {
  queueMicrotask(() => {
    if (currentPhase === phase) {
      emit({ type: 'PHASE_EXIT', phase, ts: Date.now() });
      currentPhase = null;
    }
  });
};

const runTask = (queue, taskId, label, source, callback, args, options = {}) => {
  const phase = phaseForQueue(queue);
  if (phase === 'poll' && pollWaiting) {
    emit({ type: 'POLL_WAIT_END', reason: 'Poll callback is ready', ts: Date.now() });
    pollWaiting = false;
  }
  enterPhase(phase);
  emit({ type: 'DEQUEUE_TASK', queue: phase, taskId, ts: Date.now() });
  emit({ type: 'CALLBACK_START', taskId, label, source, ts: Date.now() });
  callbackDepth += 1;
  const previousSource = currentSource;
  currentSource = source || previousSource;
  const safeCallback = typeof callback === 'function' ? callback : () => {};
  try {
    safeCallback(...args);
  } finally {
    emit({ type: 'CALLBACK_END', taskId, ts: Date.now() });
    emit({
      type: 'MICROTASK_CHECKPOINT',
      scope: 'after_callback',
      detail: label + ' finished',
      ts: Date.now(),
    });
    callbackDepth = Math.max(0, callbackDepth - 1);
    currentSource = previousSource;
    if (options.closeHandleId) {
      closeHandle(options.closeHandleId);
    }
    leavePhaseSoon(phase);
  }
};

const wrapReadyTask = (queue, label, callback, options = {}) => {
  const source = callback && callback.source;
  const taskId = options.taskId || phaseForQueue(queue) + ':' + (++counter);
  return (...args) => {
    const normalizedQueue = phaseForQueue(queue);
    emit({ type: 'ENQUEUE_TASK', queue: normalizedQueue, taskId, label, source, ts: Date.now() });
    runTask(normalizedQueue, taskId, label, source, callback, args, options);
  };
};

const wrapMicrotask = (queue, label, callback) => {
  const id = queue + ':' + (++counter);
  const source = callback && callback.source;
  emit({ type: 'ENQUEUE_MICROTASK', queue, id, label, source, ts: Date.now() });
  return (...args) => {
    emit({ type: 'DRAIN_MICROTASKS_START', ts: Date.now() });
    emit({ type: 'DEQUEUE_MICROTASK', queue, id, ts: Date.now() });
    emit({ type: 'CALLBACK_START', taskId: id, label, source, ts: Date.now() });
    callbackDepth += 1;
    const previousSource = currentSource;
    currentSource = source || previousSource;
    const safeCallback = typeof callback === 'function' ? callback : () => {};
    try {
      safeCallback(...args);
    } finally {
      emit({ type: 'CALLBACK_END', taskId: id, ts: Date.now() });
      emit({
        type: 'MICROTASK_CHECKPOINT',
        scope: 'after_callback',
        detail: label + ' finished',
        ts: Date.now(),
      });
      callbackDepth = Math.max(0, callbackDepth - 1);
      currentSource = previousSource;
      emit({ type: 'DRAIN_MICROTASKS_END', ts: Date.now() });
    }
  };
};

const nativeSetTimeout = setTimeout;
const nativeSetInterval = setInterval;
const nativeSetImmediate = setImmediate;
const nativeClearTimeout = clearTimeout;
const nativeClearInterval = clearInterval;
const nativeClearImmediate = clearImmediate;

const patchedFs = {
  ...fs,
  readFile(path, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? undefined : options;
    const source = cb && cb.source;
    const requestId = startRequest('fs', 'fs.readFile callback', source);
    const wrapped = (...args) => {
      const hasError = !!args[0];
      endRequest(requestId, hasError ? 'error' : 'ok');
      const task = wrapReadyTask('poll', 'fs.readFile callback', cb);
      task(...args);
    };
    return fs.readFile(path, opts, wrapped);
  },
};

const originalOn = EventEmitter.prototype.on;
EventEmitter.prototype.on = function patchedOn(event, listener) {
  if (event === 'close') {
    return originalOn.call(this, event, wrapReadyTask('close', 'close handler', listener));
  }
  return originalOn.call(this, event, listener);
};

const context = {
  __bindSource, // Expose helper
  console: {
    log: (...args) => emitConsoleWithFrame('log', args),
    warn: (...args) => emitConsoleWithFrame('warn', args),
    error: (...args) => emitConsoleWithFrame('error', args),
  },
  setTimeout: (cb, ms = 0, ...args) => {
    const source = cb && cb.source;
    const safeMs = Number(ms) || 0;
    const handleId = openHandle('timer', 'setTimeout(' + safeMs + ')', source);
    const timerId = 'tm:' + (++counter);
    const taskId = 'timers:' + (++counter);
    emit({
      type: 'WEBAPI_SCHEDULE',
      kind: 'timer',
      handleId,
      job: 'setTimeout',
      source,
      ts: Date.now(),
    });
    emit({
      type: 'TIMER_HEAP_SCHEDULE',
      timerId,
      label: 'setTimeout callback',
      dueInMs: safeMs,
      source,
      ts: Date.now(),
    });
    const nativeHandle = nativeSetTimeout(() => {
      emit({
        type: 'TIMER_HEAP_READY',
        timerId,
        taskId,
        label: 'setTimeout callback',
        source,
        ts: Date.now(),
      });
      const ready = wrapReadyTask('timers', 'setTimeout callback', cb, {
        taskId,
        closeHandleId: handleId,
      });
      ready(...args);
    }, safeMs);
    timeoutHandleMap.set(nativeHandle, handleId);
    return nativeHandle;
  },
  clearTimeout: (id) => {
    closeHandle(timeoutHandleMap.get(id));
    timeoutHandleMap.delete(id);
    return nativeClearTimeout(id);
  },
  setInterval: (cb, ms = 0, ...args) => {
    const source = cb && cb.source;
    const safeMs = Number(ms) || 0;
    const handleId = openHandle('interval', 'setInterval(' + safeMs + ')', source);
    const timerId = 'tm:' + (++counter);
    emit({
      type: 'WEBAPI_SCHEDULE',
      kind: 'timer',
      handleId,
      job: 'setInterval',
      source,
      ts: Date.now(),
    });
    emit({
      type: 'TIMER_HEAP_SCHEDULE',
      timerId,
      label: 'setInterval callback',
      dueInMs: safeMs,
      source,
      ts: Date.now(),
    });
    const nativeHandle = nativeSetInterval(() => {
      const taskId = 'timers:' + (++counter);
      emit({
        type: 'TIMER_HEAP_READY',
        timerId,
        taskId,
        label: 'setInterval callback',
        source,
        ts: Date.now(),
      });
      const ready = wrapReadyTask('timers', 'setInterval callback', cb, { taskId });
      ready(...args);
    }, safeMs);
    intervalHandleMap.set(nativeHandle, handleId);
    return nativeHandle;
  },
  clearInterval: (id) => {
    closeHandle(intervalHandleMap.get(id));
    intervalHandleMap.delete(id);
    return nativeClearInterval(id);
  },
  setImmediate: (cb, ...args) => {
    const source = cb && cb.source;
    const handleId = openHandle('immediate', 'setImmediate', source);
    emit({
      type: 'WEBAPI_SCHEDULE',
      kind: 'immediate',
      handleId,
      job: 'setImmediate',
      source,
      ts: Date.now(),
    });
    const wrapped = wrapReadyTask('check', 'setImmediate callback', cb, {
      closeHandleId: handleId,
    });
    const nativeHandle = nativeSetImmediate(wrapped, ...args);
    immediateHandleMap.set(nativeHandle, handleId);
    return nativeHandle;
  },
  clearImmediate: (id) => {
    closeHandle(immediateHandleMap.get(id));
    immediateHandleMap.delete(id);
    return nativeClearImmediate(id);
  },
  queueMicrotask: (cb) => queueMicrotask(wrapMicrotask('promise', 'queueMicrotask callback', cb)),
  __queuePendingCallback: (cb, label = 'pending callback') => {
    const wrapped = wrapReadyTask('pending', label, cb);
    return queueMicrotask(() => wrapped());
  },
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
    const requestId = startRequest('network', 'fetch', undefined);
    return fetch(...args).then(
      (result) => {
        endRequest(requestId, 'ok');
        return result;
      },
      (error) => {
        endRequest(requestId, 'error');
        throw error;
      },
    );
  },
};

emit({ type: 'SCRIPT_START', ts: Date.now() });
try {
  vm.runInNewContext(${JSON.stringify(js)}, context, { timeout: 5000 });
  if (activeHandles.size > 0 || activeRequests.size > 0) {
    emit({ type: 'POLL_WAIT_START', reason: 'Awaiting async callback', ts: Date.now() });
    pollWaiting = true;
  }
  setTimeout(() => process.exit(0), 25);
} catch (error) {
  emit({ type: 'RUNTIME_ERROR', ts: Date.now(), message: error.message, stack: error.stack });
  process.exit(1);
}
`;
}

import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createServer } from '../index';

function collectEvents(code: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    const port = 8091;
    const server = createServer(port);
    const ws = new WebSocket(`ws://localhost:${port}`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'RUN_CODE', payload: { code, language: 'js' } }));
    });

    ws.on('message', (raw) => {
      const event = JSON.parse(raw.toString());
      events.push(event);
      if (event.type === 'SCRIPT_END') {
        ws.close();
        server.close(() => resolve(events));
      }
    });

    ws.on('error', (error) => reject(error));
  });
}

describe('server runtime', () => {
  it('streams timers and microtasks', async () => {
    const events = await collectEvents(`setTimeout(() => console.log('t'), 0); process.nextTick(() => {}); Promise.resolve().then(() => {});`);
    expect(events.some((e) => e.type === 'ENQUEUE_TASK' && e.queue === 'timers')).toBe(true);
    expect(events.some((e) => e.type === 'ENQUEUE_MICROTASK' && e.queue === 'nextTick')).toBe(true);
    expect(events.some((e) => e.type === 'SCRIPT_END')).toBe(true);
  });

  it('emits TS diagnostics for invalid TypeScript', async () => {
    const events = await new Promise<any[]>((resolve, reject) => {
      const result: any[] = [];
      const port = 8092;
      const server = createServer(port);
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'RUN_CODE', payload: { code: 'const a: number = ;', language: 'ts' } }));
      });
      ws.on('message', (raw) => {
        const event = JSON.parse(raw.toString());
        result.push(event);
        if (event.type === 'SCRIPT_END') {
          ws.close();
          server.close(() => resolve(result));
        }
      });
      ws.on('error', reject);
    });

    expect(events.some((e) => e.type === 'TS_DIAGNOSTIC')).toBe(true);
  });
});

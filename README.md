# JavaScript Visualizer 9000

Try it out: [jsv9000.app](https://jsv9000.app)

![Demo of the JavaScript Visualizer 9000](demo.gif)

## What This Repo Contains
- `apps/web`: frontend visualizer (Vite + React)
- `apps/server`: websocket backend that emits execution events
- `packages/protocol`: shared event/state types
- `packages/explain`: explanation helpers

## Prerequisites
- Node.js 20+
- npm 10+

## Local Development
1. Install dependencies:
```bash
npm ci
```
2. Start frontend:
```bash
npm run dev:web
```
3. Start backend (optional, if you are testing server):
```bash
npm run dev:server
```

## Build
```bash
npm run build
```

## Test
```bash
npm run test
```

## Deployment
For full Cloudflare Pages + Render setup, use:
- [`DEPLOYMENT.md`](DEPLOYMENT.md)

Quick commands after setup:
- Deploy frontend: `npm run deploy:web`
- Deploy backend now: `npm run deploy:server`
- Start deployment flow: `npm run deploy:start`
- Stop backend service on Render: `npm run deploy:stop`

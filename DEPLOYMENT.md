# Deployment Guide

## Overview
- Frontend: Cloudflare Pages (free)
- Backend: Render Web Service (free)
- Domain: point frontend and backend subdomains with DNS records

## 0) One-Time Prerequisites
1. Install dependencies:
```bash
npm ci
```
2. Create your local env file:
```bash
cp .env.example .env
```
On Windows PowerShell:
```powershell
Copy-Item .env.example .env
```
3. Fill `.env` with:
- `CLOUDFLARE_PAGES_PROJECT`
- `CLOUDFLARE_PAGES_BRANCH` (usually `main`)
- `VITE_SERVER_WS_URL` (local: `ws://localhost:8080`, prod: `wss://api.yourdomain.com`)
- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`
4. Note: deploy scripts auto-read `.env`.

## 1) Cloudflare Pages Setup (frontend)
1. Install Wrangler:
```bash
npm i -D wrangler
```
2. Authenticate:
```bash
npx wrangler login
```
3. In Cloudflare dashboard, create a Pages project.
4. Use these build settings:
- Build command: `npm run build -w @jsv/web`
- Build output directory: `apps/web/dist`
- Root directory: repository root
5. Set `CLOUDFLARE_PAGES_PROJECT` in `.env`.
6. Deploy frontend:
```bash
npm run deploy:web
```

## 2) Render Setup (backend)
1. In Render, create a service from this repo using `render.yaml`.
2. Confirm service settings:
- Type: Web Service
- Plan: Free
- Health check path: `/health`
- Auto deploy trigger: off
3. Copy from Render dashboard:
- API key
- Service ID (`srv-...`)
4. Put both values in `.env`:
- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`
5. Check status:
```bash
npm run deploy:server:status
```
6. Deploy backend:
```bash
npm run deploy:server
```

## 3) Daily Commands
- Full deploy flow (frontend + backend):
```bash
npm run deploy:start
```
- Stop backend service:
```bash
npm run deploy:stop
```
- Backend-only commands:
```bash
npm run deploy:server:status
npm run deploy:server:start
npm run deploy:server:stop
```

Important:
- Cloudflare Pages stays active.
- `deploy:stop` only suspends Render backend.

## 4) Domain Setup
1. Frontend:
- Connect `@` or `www` to Cloudflare Pages custom domain.
2. Backend:
- Create `api.yourdomain.com` CNAME to your Render hostname.
3. WebSocket endpoint:
- Use `wss://api.yourdomain.com` from frontend.
4. Frontend runtime env:
- Set `VITE_SERVER_WS_URL=wss://api.yourdomain.com` before deploying web.

## 5) Verify Deployment
1. Open frontend URL and verify app loads.
2. Open backend health URL:
- `https://api.yourdomain.com/health`
- Expected: `{"ok":true}`
3. Check Render logs and confirm clean startup.

## 6) Troubleshooting
- `Missing CLOUDFLARE_PAGES_PROJECT`
  - Set it in `.env`, then rerun command.
- `Missing RENDER_API_KEY or RENDER_SERVICE_ID`
  - Set both in `.env`, then rerun command.
- Local port in use:
```powershell
$env:PORT=8090; npm run dev:server
```
- Free Render cold starts:
  - Free services sleep after idle.
  - Cold starts cannot be fully removed on free plan.
  - Use paid always-on plan to avoid cold starts.

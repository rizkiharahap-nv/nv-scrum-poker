# Run Scrum Poker locally

How to run and test on your machine (macOS / Linux, Node 22+). This repo targets **Substrait** (Node server + container); it does not include Cloudflare Workers.

## Prereqs

- Node.js 22+ and npm (npm workspaces).
- No database or other services.

```bash
cd /path/to/nv-scrum-poker
npm install
cp .env.example .env   # optional
```

The server loads `.env` from the repo root (`PORT`, `STATIC_DIR`).

---

## Option A — Built SPA + Node server (recommended for manual testing)

One process serves static files and WebSocket `/ws`.

```bash
npm run build
npm start
```

Open the logged URL (default `http://localhost:8000`, or your `PORT` in `.env`).

- Create a room → share invite link → join from incognito.
- Vote → Reveal → Re-vote; refresh tab to test `room:resume`.

---

## Option B — Vite HMR + Node server

For frontend edits with hot reload.

Terminal 1:

```bash
npm run dev -w apps/server
```

Terminal 2:

```bash
npm run dev -w apps/web
```

Open **http://localhost:5173**. Vite proxies `/ws` to `ws://127.0.0.1:5174` in [`apps/web/vite.config.ts`](../apps/web/vite.config.ts). If your server `PORT` is not 5174, update that proxy target.

---

## Tests / checks

```bash
npm test
npm run typecheck
npm run build
```

## Manual checklist

1. Create room → invite URL + copy.
2. Second browser joins via link.
3. Face-down votes; reveal shows consensus or spread.
4. Re-vote clears votes, keeps participants.
5. Refresh preserves identity (~8s grace on disconnect).

## Troubleshooting

- **Port in use** → change `PORT` in `.env` or stop the other process (`lsof -ti:<port> | xargs kill`).
- **Option A shows stale UI** → `npm run build -w apps/web` again.
- **Rooms vanish after deploy/restart** → expected (in-memory, single replica).

## Where things live

| Piece | Path |
| --- | --- |
| SPA | `apps/web/src` |
| WebSocket client | `apps/web/src/realtime/` |
| Node server | `apps/server/src/index.ts` |
| Room logic | `packages/room/` |
| Protocol | `packages/protocol/` |
| Container | `Dockerfile` |

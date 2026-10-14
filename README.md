# Scrum Hold'em Poker (Substrait)

Real-time planning poker with a Texas Hold’em table. Create a room, share a 6-digit invite, vote face-down, reveal together, and see consensus or the spread.

No accounts. Display name only. Rooms are ephemeral live sessions.

## Features

- **Create / join** via crypto-random 6-digit room code
- **Face-down voting** on Fibonacci deck `1 · 2 · 3 · 5 · 8 · 13 · 21` + Pass (☕)
- **Anyone can Reveal** — simultaneous flip for the whole table
- **Consensus or spread** — agreement ring + bottom results drawer
- **Re-vote** keeps participants, clears votes
- **Resume on refresh** — same seat/identity via session storage
- **Poker-table UI** — stadium felt, host top-center, fanned hand

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Svelte 5 + Vite + TypeScript (plain CSS) |
| Realtime | Native WebSocket (JSON envelopes + acks) |
| Production | [Substrait platform](https://app.substrait.build) — backend-only Node image (SPA + `/ws`) |
| Shared logic | `packages/room`, `packages/protocol` |

## Deploy on Substrait

This repo is initialized for the **Substrait upload contract** (`substrait.yaml`, `cicd/Dockerfile.backend`, `AGENTS.md`). There is **no** separate `frontend/` service: one backend serves the built SPA, `GET /health`, `GET /api/health`, and WebSocket `/ws` on port **8000**.

### Cursor plugin workflow

1. `/substrait:login` — authenticate (set portal URL if prompted).
2. Create an app in the Substrait portal (or use an existing one).
3. `/substrait:link` — link this folder to that app.
4. `/substrait:deploy` — upload source and deploy (`--watch` to follow the build).

Config is stored in `.substrait/config.json` (gitignored). See [`AGENTS.md`](AGENTS.md) for contract essentials.

### Local container smoke test

```bash
docker build -f cicd/Dockerfile.backend -t nv-scrum-poker .
docker run --rm -p 8000:8000 nv-scrum-poker
```

Open http://localhost:8000 — same origin serves the SPA and the WebSocket endpoint `/ws` (browsers use `wss` when the page is served over HTTPS).

| Env | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | HTTP + WebSocket (Substrait readiness probe) |
| `STATIC_DIR` | `apps/web/dist` locally; `/app/apps/web/dist` in image | Built SPA |

- **Health:** `GET /health` or `GET /healthz` → `200 ok`; `GET /api/health` → `{"ok":true}`
- **WebSocket:** server pings ~every 30s on idle connections
- **Graceful shutdown:** `SIGTERM` closes sockets before exit

Local dev loads [`.env`](.env) from the repo root. Copy [`.env.example`](.env.example) to get started.

### Single-instance semantics

Room state is in-process memory. The platform should run **one backend replica** for correct realtime behaviour; scaling out splits rooms across pods. Restarts clear live rooms (by design).

## Quick start (development)

**Prereqs:** Node.js 22+, npm

```bash
npm install
cp .env.example .env   # optional; edit PORT
```

### Dev (HMR) — Vite + Node server

```bash
# terminal 1
npm run dev -w apps/server

# terminal 2
npm run dev -w apps/web       # :5173 → proxies /ws (PORT from .env)
```

Open http://localhost:5173

### Production-like locally (built SPA + Node)

```bash
npm run build
npm start
```

Open the URL shown in the log (default http://localhost:8000).

## Scripts

```bash
npm test              # vitest (unit + DOM + integration)
npm run typecheck
npm run build         # SPA → apps/web/dist
npm start             # Node server (after build)
```

## Repo map

```
apps/web/              Svelte SPA (built into backend image)
apps/server/           Node server (SPA + WebSocket)
cicd/Dockerfile.backend   Substrait backend image
substrait.yaml         App manifest (description; no database)
packages/room/         Room state machine
packages/protocol/     Wire envelopes
docs/                  PRD, architecture
qa/                    Playwright e2e helpers + evidence
```

More detail: [`docs/local-run.md`](docs/local-run.md) · [`docs/architecture/architecture.md`](docs/architecture/architecture.md)

## License

Private / internal use unless noted otherwise.

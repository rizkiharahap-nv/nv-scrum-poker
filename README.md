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
| Production | One Node 22 container: SPA + `/ws`, in-memory rooms |
| Shared logic | `packages/room`, `packages/protocol` |

## Deploy on Substrait (GKE)

Build a container from this repo and run it on Substrait behind Kong.

### Container

```bash
docker build -t nv-scrum-poker .
docker run --rm -p 8080:8080 nv-scrum-poker
```

Open http://localhost:8080 — same origin serves the SPA and `ws://…/ws`.

| Env | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP + WebSocket listen port |
| `STATIC_DIR` | `apps/web/dist` (relative to server) | Built SPA assets; set to `/app/apps/web/dist` in the image |

- **Health probe:** `GET /healthz` → `200 ok`
- **WebSocket:** server sends periodic pings (~30s) so ingress idle timeouts do not drop quiet tables
- **Graceful shutdown:** `SIGTERM` closes connections before exit

Local dev loads [`.env`](.env) from the repo root automatically (`PORT`, `STATIC_DIR`). Copy [`.env.example`](.env.example) to get started.

### Platform checklist (outside this repo)

1. Service Desk / Orchestrator: new **Web** service on Substrait, **no database**, **no AAA** — [New Service Spin Up](https://ninjavan-tech.atlassian.net/wiki/spaces/EP/pages/544342033)
2. Bamboo: build this `Dockerfile`, deploy to **substrait** only
3. Helm: container port **8080**, liveness/readiness **`/healthz`**, Kong route with **WebSocket upgrade** and a long proxy read timeout
4. Internal hostname on Substrait ingress (no app-level auth)

### Hard requirement: one replica

Room state lives in process memory (`Map`). **Replicas must be 1.** Multiple pods split rooms (create on pod A, join on pod B → `ROOM_NOT_FOUND`). A pod restart or deploy clears all live rooms (product semantics: ephemeral sessions).

## Quick start (development)

**Prereqs:** Node.js 22+, npm

```bash
npm install
cp .env.example .env   # optional; edit PORT
```

### Dev (HMR) — Vite + Node server

```bash
# terminal 1
npm run dev -w apps/server    # PORT from .env (default 8080)

# terminal 2
npm run dev -w apps/web       # :5173 → proxies /ws to server port in vite.config
```

Open http://localhost:5173

### Production-like locally (built SPA + Node)

```bash
npm run build
npm start
```

Open the URL shown in the log (e.g. http://localhost:9000 if `PORT=9000` in `.env`).

## Scripts

```bash
npm test              # vitest (unit + DOM + integration)
npm run typecheck
npm run build         # SPA → apps/web/dist
npm start             # Node server (after build)
```

## Repo map

```
apps/web/          Svelte SPA
apps/server/       Node server (SPA + WebSocket)
packages/room/     Room state machine
packages/protocol/ Wire envelopes
docs/              PRD, architecture (some notes reference legacy Cloudflare path)
qa/                Playwright e2e helpers + evidence
Dockerfile         Substrait image
```

More detail: [`docs/local-run.md`](docs/local-run.md) · [`docs/architecture/architecture.md`](docs/architecture/architecture.md)

## License

Private / internal use unless noted otherwise.

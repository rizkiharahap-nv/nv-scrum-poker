# Change Request: Frontend stack (no SSR) + HTTP-stream realtime

- **ID:** CR-2026-08-17-01
- **Date:** 2026-08-17
- **Requester:** Rizki (human)
- **Lanes affected:** `docs/constitution.md` §Stack (lines 5–10), `docs/architecture/ADR-001-realtime-transport.md`
- **Status:** OPEN — research assigned (`researcher`), then `architect` re-evaluates ADR

## Requested change

1. **Frontend:** Prefer a no-SSR, easy-to-build stack (Vite + React + TS SPA) over the current "Next.js preferred" line. Constitution §Stack line 6 should reflect the SPA choice.
2. **Realtime:** Evaluate HTTP streaming (SSE / fetch streams) as an alternative to the accepted Socket.IO transport (ADR-001). Provide pros/cons + a verdict for this app. If evidence supports it, update ADR-001 (or add ADR-002) and constitution line 7. Note: SSE is push, not polling — the constitution "no polling" rule is unaffected.

## Context

- Gate 3 (`t_12f14f3d`) is blocked awaiting human approval of design + plan.
- ADR-001 currently ACCEPTED: Socket.IO on a small Node server (spike 16/16).
- Human wants: easy to build, no SSR; asks whether HTTP stream can replace WebSocket for realtime.

## Deliverables (researcher)

- `docs/research/frontend-stack-brief.md` — Vite+React SPA vs Next.js SSR tradeoffs (build/dev complexity, deploy, realtime coexistence), recommendation.
- `docs/research/realtime-http-stream-brief.md` — SSE/fetch-stream vs WebSocket/Socket.IO: latency, reconnection, browser connection limits, proxy/CDN behavior, serverless fit, server-authoritative state fit; verdict for scrum-poker.

## Next owner

`architect` — re-evaluate ADR-001 + constitution §6–7 → human gate `t_12f14f3d`.

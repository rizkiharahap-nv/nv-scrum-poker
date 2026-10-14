# Research brief — Realtime transport: HTTP streaming (SSE / fetch streams) vs WebSocket / Socket.IO

- **Status:** COMPLETE (research pass for CR-2026-08-17-01)
- **Date:** 2026-08-17 · **Owner:** researcher · **Appetite:** S
- **Inputs:** `docs/architecture/ADR-001-realtime-transport.md`, `docs/architecture/architecture.md`, `docs/PRD.md` Feature 5, `docs/constitution.md` §Stack line 7
- **Next owner:** architect (re-evaluate ADR-001 + constitution §6–7)

## TL;DR / verdict

**SSE/fetch-stream is a credible alternative to Socket.IO for scrum-poker — but
the current Socket.IO choice is still the lower-risk option for Phase 1.** SSE
is a good fit for the *server→client* push half (room state), yet the app also
needs *client→server* commands (vote, reveal, re-vote) with acks — SSE is
one-way by design, so those commands would be plain HTTP POSTs with no
built-in ack/reconnect semantics. The deciding factors for scrum-poker are:
(1) commands+acks are first-class in Socket.IO and already spiked/validated;
(2) the current deployment target is a persistent Node process, so WebSocket
cold-start/SSE-proxy concerns don't apply; (3) server-authoritative state fits
both transports equally. **Recommendation: keep Socket.IO for Phase 1; record
SSE + POST as a documented alternative (ADR-002) if the team later prefers
serverless or HTTP-only hosting.**

## 1. What the change request actually asks

- CR-2026-08-17-01 item 2: "Evaluate HTTP streaming (SSE / fetch streams) as an
  alternative to the accepted Socket.IO transport (ADR-001). Provide pros/cons
  + a verdict for this app."
- Note in the CR: "SSE is push, not polling — the constitution no-polling rule
  is unaffected." **Confirmed:** SSE is a persistent HTTP response the server
  writes to; it is push, not polling.[16][7]

## 2. Latency per message

- Timeplus benchmark (Chrome, HTTP/2, real-world scenarios): "Our tests didn't
  show much of a performance difference between SSE and WS across these
  scenarios"; max throughput WS ~4M EPS vs SSE ~3.1M EPS at CPU saturation —
  for practical loads, transport is not the bottleneck.[4]
- GetStream's field numbers: "WebSocket's binary framing runs about 1-3ms per
  message, compared to 5-10ms for SSE" — but adds that network RTT, JSON
  serialization, and backend processing dominate the budget by orders of
  magnitude before framing overhead matters.[6]
- For scrum-poker's traffic (a handful of room-state snapshots per minute,
  ≤15 participants), the 1–10ms per-message difference is invisible next to
  the 2s/10s PRD targets (AC-F5.1/F5.2).

**Verdict on latency:** parity for this app; both meet ACs with huge margin.

## 3. Reconnect / resume

- SSE (EventSource) reconnects automatically by default; on reconnect it sends
  `Last-Event-ID` so the server can replay missed events. Zero application
  code for reconnection.[16][6][15]
- WebSocket has **no built-in reconnection** — the client must implement
  backoff + state resync itself (or use Socket.IO, which "automatically
  reconnects with an exponential back-off delay" and buffers packets while
  disconnected).[5][17]
- For scrum-poker's AC-F5.5 (reconnect resync), both paths need a `room:resume`
  re-sync (architecture §8; internal): SSE gives transport-level replay for
  free, Socket.IO gives connection-level auto-reconnect + app-level resync.

**Verdict on reconnect/resume:** SSE is marginally simpler for resume; Socket.IO
is equivalent once the app-level `room:resume` exists (already planned;
internal).

## 4. Browser connection limits

- Under HTTP/1.1, browsers limit ~6 concurrent connections per origin; each SSE
  stream permanently occupies one slot, so multiple tabs can exhaust the pool.
  MDN: "the limit is per browser and is set to a very low number (6)".[16][8]
- HTTP/2 multiplexing lifts this: all streams share one TCP connection, default
  ~100 concurrent streams.[16][6][8]
- WebSocket connections exit HTTP and are not subject to the 6-connection cap
  (though each tab still opens one). Socket.IO also has an HTTP long-polling
  fallback that behaves like HTTP.[17][6]
- Scrum-poker users are 3–15 per room, one tab per participant, plus the host's
  invite-link tab (PRD target users; internal). Even under HTTP/1.1, one SSE
  stream per tab is fine; the risk only appears with many tabs/streams on the
  same origin.[unverified — scale assessment from PRD + [16]]

**Verdict on connection limits:** a non-issue at this scale (and moot under
HTTP/2); just don't open multiple SSE streams per tab.

## 5. Proxy / CDN buffering

- SSE is just HTTP, so it "works transparently with every proxy, CDN, and load
  balancer in existence" — but reverse proxies buffer by default and will batch
  events until buffer fill unless configured. Standard fix: `proxy_buffering
  off;` + `proxy_read_timeout` long + `X-Accel-Buffering: no`.[6][9][10]
- OneUpTime's nginx table: default `proxy_buffering on` → "Events batched
  instead of streamed"; default `proxy_read_timeout 60s` → "Connection closes
  after idle time". Required config: `proxy_buffering off`, long
  `proxy_read_timeout`, keepalive/HTTP/1.1, disable gzip for event streams.[9]
- WebSocket requires explicit `Connection: Upgrade` forwarding + extended read
  timeouts; SSE requires disabling response buffering. Both need proxy
  configuration; SSE's is simpler (no upgrade handshake).[6][10]
- CDN: SSE "works transparently" through CDNs; WebSocket connections "have to
  terminate at the origin" because CDNs don't transparently proxy them.[6]

**Verdict on proxy/CDN:** SSE has a small edge for CDN transparency; both need
explicit proxy config. This app runs behind a single internal reverse proxy —
either works with correct config.

## 6. Serverless fit

- SSE is feasible on serverless only with **response streaming** support:
  AWS Lambda response streaming lets functions return up to 200 MB and stream
  incrementally (vs 6 MB buffered), but requires Node.js managed runtime +
  function URL/API Gateway proxy + configuring long timeouts.[18]
- Vercel functions (serverless) have max durations: "up to 5 minutes on free
  plans and up to roughly 13 minutes on paid plans" (Fluid Compute), so a
  long-lived SSE room stream must fit within that or be re-established.[19]
- W3Tweaks: "Serverless timeouts cut long-lived connections" — a classic
  pitfall for SSE on serverless platforms.[15]
- WebSockets on serverless platforms are worse: they need a persistent
  connection, sticky sessions, or a provider (Ably/Socket.IO adapters); Vercel
  pins a WS to one function instance, capped at 5 min by default.[6][5]
- **This project's deployment is a persistent Node process** (ADR-001:
  "serverless cold start kills WebSockets"; architecture §12 risk 4; internal).
  So the serverless fit question is moot for Phase 1 — but if the team ever
  wants serverless, SSE + response streaming is the more compatible of the
  two.[18][15]

**Verdict on serverless:** SSE wins if serverless is ever desired; neither is
needed for the current persistent-process target.

## 7. Server-authoritative state fit

- Both transports can carry a server-authoritative `room:state` snapshot. The
  architectural pattern (server owns the state machine, broadcasts full
  snapshot after each mutation) is transport-agnostic (architecture §7;
  internal).
- With SSE, client→server commands (vote/reveal/reset) would be **plain HTTP
  POSTs** with no built-in ack or retry; with Socket.IO they are events with
  ack callbacks and automatic reconnection/packet buffering.[17][5]
- Face-down guarantee (no vote values pre-reveal) is enforced server-side
  regardless of transport — neither SSE nor WS weakens it (architecture §7.2;
  internal).

**Verdict on server-authoritative state:** both fit; Socket.IO gives the
command/ack path for free; SSE + POST requires hand-rolling acks/retries.

## 8. Comparison table

| Criterion | SSE / fetch-stream | WebSocket / Socket.IO | Scrum-poker impact |
|---|---|---|---|
| Direction | Server→client only (one-way); client commands = separate POSTs[7][16] | Full-duplex; commands + acks on one channel[17][5] | Votes/reveal/reset are client→server — needs acks; Socket.IO wins |
| Latency/message | ~5–10ms framing[6] | ~1–3ms framing[6] | Parity at our volume; PRD 2s/10s targets |
| Reconnect | Built-in + Last-Event-ID resume[16][6] | Manual on raw WS; Socket.IO auto-reconnect[5][17] | Both OK with `room:resume`; SSE slightly simpler |
| Browser limit | 6/origin under HTTP/1.1; lifted on HTTP/2[16][8] | Not subject to 6-cap[6] | Non-issue at 3–15 users/tab |
| Proxy/CDN | HTTP-native; needs buffering off; CDN-transparent[6][9][10] | Needs upgrade forwarding; CDNs terminate at origin[6][10] | Small SSE edge; both need proxy config |
| Serverless | Feasible w/ response streaming (Lambda 200MB, Vercel ≤5–13min)[18][19][15] | Hostile (cold start, sticky sessions, 5-min caps)[6] | Moot for persistent Node deploy; SSE wins if ever serverless |
| Server-authoritative state | Works; commands via POST, no ack semantics[7] | Works; acks + reconnection built-in[17] | Socket.IO stronger on command path |
| Spiked/validated | Not yet spiked | Spike 001: 16/16 assertions green, sub-ms RTT (ADR-001; internal) | Socket.IO has evidence in-repo |

## 9. Verdict for this app

**Keep Socket.IO (ADR-001) for Phase 1.** Reasons:

1. **The app is not one-way.** Voting/reveal/re-vote are client→server commands
   that need acks and retries; SSE's one-way model pushes those into plain
   POSTs with hand-rolled ack/reconnect logic.[7][17]
2. **Spike evidence exists.** ADR-001 records a validated Socket.IO spike
   (16/16 assertions, sub-ms RTT) (internal). Switching transports without a
   spike is a new unknown — appetite S says avoid that.[unverified — project
   decision applied to evidence]
3. **Deployment target is a persistent Node process** (ADR-001 consequences;
   internal), where Socket.IO's model is a proven fit; serverless (SSE's
   advantage) is not on the roadmap.[18][15]
4. **Constitution "no polling" is unaffected either way** — SSE is push, not
   polling.[16][7]

**Recommended follow-up (not required for Phase 1):** add **ADR-002 —
Alternative: SSE + HTTP POST command endpoint** documenting this analysis, so
if the team later prefers serverless/HTTP-only hosting (or hits proxy pain with
WS), the swap path is pre-decided: server keeps `room:state` broadcast, commands
become POSTs, client replaces `socket.ts` with an `EventSource` + `fetch`
adapter. The transport-agnostic `room:state` contract already in architecture
§7.2 makes this a thin adapter, per ADR-001 §Alternatives (internal).[unverified
— proposal based on internal docs]

**Implication for ADR-001:** keep ACCEPTED for Phase 1; optionally add the
SSE alternative to the "Alternatives considered" table with a pointer to this
brief (internal).[unverified — proposed implication]

**Implication for constitution §Stack line 7:** no change required for Phase 1;
if architect agrees, add a parenthetical "(SSE+POST documented as alternative,
see ADR-002)" to keep the door open without churning the accepted transport
(internal).[unverified — proposed implication]

## Sources

[4] https://www.timeplus.com/post/websocket-vs-sse — WebSocket vs SSE: A Performance Comparison
[5] https://ably.com/blog/websockets-vs-sse — WebSockets vs Server-Sent Events: Key differences
[6] https://getstream.io/blog/websocket-sse — WebSocket vs Server-Sent Events - Key Differences
[7] https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l — SSE Beat WebSockets for 95% of Real-Time Apps
[8] https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html — WebSockets vs SSE vs Long-Polling vs WebRTC vs WebTransport
[9] https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view — How to Configure Server-Sent Events Through Nginx
[10] https://www.besthub.dev/articles/mastering-nginx-production-ready-sse-websocket-proxy-configuration-a713ffa47d4f — Mastering Nginx: Production-Ready SSE & WebSocket Proxy Config
[15] https://www.w3tweaks.com/javascript/javascript-polling-websockets-sse — Polling vs WebSockets vs SSE
[16] https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — MDN: Using server-sent events
[17] https://socket.io/docs/v4 — Socket.IO docs: Introduction
[18] https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html — AWS Lambda response streaming
[19] https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out — Vercel: Functions timing out

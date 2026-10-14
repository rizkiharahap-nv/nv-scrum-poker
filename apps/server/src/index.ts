/**
 * Node WebSocket server — Substrait / GKE production path and local test adapter.
 *
 * Serves the built SPA and `/ws` on one process (in-memory rooms). Room codes are
 * assigned on `room:create` (6-digit, AC-F1.2).
 */

import { createServer, type IncomingMessage } from "node:http";
import { Buffer } from "node:buffer";
import { randomBytes, randomInt } from "node:crypto";
import { statSync, readFileSync, existsSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientCommand, ErrorCode } from "@scrum-poker/protocol";
import { Room, type RoomState } from "@scrum-poker/room";

/**
 * Ack payload — the union of every success/error ack shape. Kept loose (all
 * fields optional) so adapters can spread it; the wire contract is documented
 * in architecture §7.1.
 */
export interface AckBody {
  ok: boolean;
  roomId?: string;
  participantId?: string;
  isHost?: boolean;
  state?: RoomState;
  error?: { code: ErrorCode };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const repoEnvFile = join(__dirname, "..", "..", "..", ".env");
if (existsSync(repoEnvFile)) {
  loadEnvFile(repoEnvFile);
}

/** One room per connection map — in-memory, ephemeral (architecture §4). */
const rooms = new Map<string, Room>();

interface Conn {
  ws: WebSocket;
  roomId: string | null;
  participantId: string | null;
}

const conns = new Map<WebSocket, Conn>();

/**
 * Leave-grace (slice 2, architecture §9): after a disconnect the participant
 * stays in the room for this long so a quick refresh can re-bind the same
 * participantId via `room:resume` (PRD decision 5); then they are evicted and
 * a final `room:state` broadcast makes them gone (AC-F5.2, ≤10s).
 */
let leaveGraceMs = 8000;

/** Pending eviction per participantId (cancelled by room:resume). */
const leaveTimers = new Map<
  string,
  { roomId: string; timer: ReturnType<typeof setTimeout> }
>();

function cancelLeaveTimer(participantId: string): void {
  const entry = leaveTimers.get(participantId);
  if (entry) {
    clearTimeout(entry.timer);
    leaveTimers.delete(participantId);
  }
}

/** Is this participant bound to a LIVE connection right now? */
function isConnected(participantId: string): boolean {
  for (const conn of conns.values()) {
    if (conn.participantId === participantId) return true;
  }
  return false;
}

/** The grace-eviction step — shared by the timer and the test hook. */
function evictParticipant(roomId: string, participantId: string): void {
  if (isConnected(participantId)) return; // reconnected within grace → keep identity
  const room = rooms.get(roomId);
  if (!room || !room.hasParticipant(participantId)) return;
  room.removeParticipant(participantId);
  broadcast(room, room.state());
  if (room.totalCount === 0) rooms.delete(roomId); // ephemeral: last connection gone
}

/** Schedule grace eviction; no-ops if the participant reconnected in time. */
function scheduleEviction(roomId: string, participantId: string): void {
  cancelLeaveTimer(participantId);
  const timer = setTimeout(() => {
    leaveTimers.delete(participantId);
    evictParticipant(roomId, participantId);
  }, leaveGraceMs);
  leaveTimers.set(participantId, { roomId, timer });
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function ack(
  ws: WebSocket,
  id: string,
  type: ClientCommand["type"],
  body: AckBody,
): void {
  send(ws, { id, type, ...body } as AckBody);
}

function broadcast(room: Room, state: RoomState): void {
  for (const conn of conns.values()) {
    if (conn.roomId === room.id)
      send(conn.ws, { id: "", type: "room:state", payload: state });
  }
}

/**
 * room:create — server generates the 6-digit room code + participantId
 * (test adapter only; AC-F1.2, CR-2026-08-18-06). A drawn code that a live
 * room already owns is a collision: ack ROOM_NOT_FOUND so the client retries
 * with a fresh code (bounded ≤5) — an occupied code never grants entry and
 * never overwrites the live room.
 *
 * Optional `payload.roomId` mirrors the Cloudflare path, where the client
 * picks the code before connecting (`/ws?room=<code>` and the DO id IS the
 * code): if the client supplies a 6-digit code, the adapter uses it instead
 * of drawing a fresh one (test-only convenience — the real client never
 * sends roomId on create).
 */
function handleCreate(
  ws: WebSocket,
  id: string,
  payload: { name?: unknown; roomId?: unknown },
): void {
  const requested =
    typeof payload.roomId === "string" && /^\d{6}$/.test(payload.roomId)
      ? payload.roomId
      : null;
  const code = requested ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (rooms.has(code)) {
    ack(ws, id, "room:create", {
      ok: false,
      error: { code: "ROOM_NOT_FOUND" },
    });
    return;
  }
  const participantId = Buffer.from(randomBytes(16)).toString("base64url");
  const result = Room.create(
    code,
    participantId,
    typeof payload.name === "string" ? payload.name : "",
  );
  if (!result.ok) {
    ack(ws, id, "room:create", { ok: false, error: { code: result.code } });
    return;
  }
  const room = result.room;
  rooms.set(room.id, room);
  const conn = conns.get(ws);
  if (conn) {
    conn.roomId = room.id;
    conn.participantId = participantId;
  }
  ack(ws, id, "room:create", {
    ok: true,
    roomId: room.id,
    participantId,
    isHost: true,
    state: room.state(),
  });
}

/** room:join — guest joins an existing room by link (AC-F1.4 join gate). */
function handleJoin(
  ws: WebSocket,
  id: string,
  payload: { roomId?: unknown; name?: unknown },
): void {
  const room =
    typeof payload.roomId === "string" ? rooms.get(payload.roomId) : undefined;
  if (!room) {
    ack(ws, id, "room:join", { ok: false, error: { code: "ROOM_NOT_FOUND" } });
    return;
  }
  const participantId = Buffer.from(randomBytes(16)).toString("base64url");
  const result = room.join(
    participantId,
    typeof payload.name === "string" ? payload.name : "",
  );
  if (!result.ok) {
    ack(ws, id, "room:join", { ok: false, error: { code: result.code } });
    return;
  }
  const conn = conns.get(ws);
  if (conn) {
    conn.roomId = room.id;
    conn.participantId = participantId;
  }
  ack(ws, id, "room:join", {
    ok: true,
    roomId: room.id,
    participantId,
    isHost: false,
    state: result.state,
  });
  broadcast(room, result.state);
}

/** room:resume — refresh / reconnect re-binds the same participant (AC-F5.5). */
function handleResume(
  ws: WebSocket,
  id: string,
  payload: { roomId?: unknown; participantId?: unknown },
): void {
  const room =
    typeof payload.roomId === "string" ? rooms.get(payload.roomId) : undefined;
  if (!room) {
    ack(ws, id, "room:resume", {
      ok: false,
      error: { code: "ROOM_NOT_FOUND" },
    });
    return;
  }
  const pid =
    typeof payload.participantId === "string" ? payload.participantId : "";
  const result = room.resume(pid);
  if (!result.ok) {
    ack(ws, id, "room:resume", { ok: false, error: { code: result.code } });
    return;
  }
  // Re-bound within the grace window → cancel the pending eviction so the
  // participant keeps their identity (name/vote/host — PRD decision 5).
  cancelLeaveTimer(pid);
  const conn = conns.get(ws);
  if (conn) {
    conn.roomId = room.id;
    conn.participantId = pid;
  }
  ack(ws, id, "room:resume", {
    ok: true,
    roomId: room.id,
    participantId: pid,
    isHost: pid === room.hostId,
    state: result.state,
  });
  broadcast(room, result.state);
}

function handleRoomCommand(
  ws: WebSocket,
  id: string,
  type: "vote:submit" | "room:reveal" | "room:reset",
  payload: { value?: unknown },
): void {
  const conn = conns.get(ws);
  const room = conn?.roomId ? rooms.get(conn.roomId) : undefined;
  if (!room || !conn?.participantId) {
    ack(ws, id, type, { ok: false, error: { code: "NOT_IN_ROOM" } });
    return;
  }
  let result: ReturnType<Room["submitVote"]>;
  if (type === "vote:submit") {
    // The shared room module validates (deck value or pass — INVALID_VALUE otherwise).
    result = room.submitVote(
      conn.participantId,
      (payload.value ?? Number.NaN) as import("@scrum-poker/room").VoteValue,
    );
  } else if (type === "room:reveal") {
    result = room.reveal(conn.participantId);
  } else {
    result = room.reset(conn.participantId);
  }
  if (!result.ok) {
    ack(ws, id, type, { ok: false, error: { code: result.code } });
    return;
  }
  ack(ws, id, type, { ok: true, state: result.state });
  broadcast(room, result.state);
}

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: ClientCommand;
  try {
    msg = JSON.parse(raw) as ClientCommand;
  } catch {
    return; // malformed frames are dropped (no ack — no valid request id)
  }
  if (typeof msg.id !== "string" || typeof msg.type !== "string") return;
  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  switch (msg.type) {
    case "room:create":
      handleCreate(ws, msg.id, payload);
      break;
    case "room:join":
      handleJoin(ws, msg.id, payload);
      break;
    case "room:resume":
      handleResume(ws, msg.id, payload);
      break;
    case "vote:submit":
    case "room:reveal":
    case "room:reset":
      handleRoomCommand(ws, msg.id, msg.type, payload);
      break;
    default: {
      // Unknown / unimplemented command type — drop (no ack; the request id is
      // unknown to the client's protocol anyway).
      break;
    }
  }
}

// --- static SPA serving (same origin as /ws; Vite `dist` output) ---

const WS_PING_INTERVAL_MS = 30_000;

/** Built SPA root; override with STATIC_DIR in containers (e.g. /app/apps/web/dist). */
function staticRoot(): string {
  const root =
    process.env.STATIC_DIR ?? join(__dirname, "..", "..", "web", "dist");
  return normalize(root);
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function writeHealth(
  req: IncomingMessage,
  res: import("node:http").ServerResponse,
): void {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  if (req.method === "HEAD") res.end();
  else res.end("ok");
}

function handleHttp(
  req: IncomingMessage,
  res: import("node:http").ServerResponse,
): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (
    (url.pathname === "/health" || url.pathname === "/healthz") &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    writeHealth(req, res);
    return;
  }
  if (
    url.pathname === "/api/health" &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (req.method === "HEAD") res.end();
    else res.end(JSON.stringify({ ok: true }));
    return;
  }
  serveStatic(req, res);
}

function serveStatic(
  req: IncomingMessage,
  res: import("node:http").ServerResponse,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const dist = staticRoot();
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  // SPA history fallback: any non-asset route serves index.html
  const ext = extname(pathname);
  if (!ext || pathname.endsWith("/")) {
    pathname = "/index.html";
  }
  const file = normalize(join(dist, pathname));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(readFileSync(file));
}

/**
 * Start the test-adapter server. Returns `{ port, close }` so tests can bind an
 * ephemeral port and tear down in-process. `leaveGraceMs` (default 8000) is the
 * disconnect grace window (AC-F5.2); tests may pass a small value, or a large
 * one plus `fireLeaveTimers` to assert eviction deterministically.
 */
export function startTestServer(
  opts: { port?: number; host?: string; leaveGraceMs?: number } = {},
): Promise<{
  port: number;
  close: () => Promise<void>;
  /** Clear pending eviction timers without running them. */
  flushLeaveTimers: () => void;
  /** Run the eviction logic for every pending leave timer now (test hook). */
  fireLeaveTimers: () => void;
}> {
  if (typeof opts.leaveGraceMs === "number") leaveGraceMs = opts.leaveGraceMs;
  const httpServer = createServer(handleHttp);
  const wss = new WebSocketServer({ noServer: true });
  let pingTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.ping();
    }
  }, WS_PING_INTERVAL_MS);

  const stopPing = (): void => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }
    socket.destroy();
  });

  wss.on("connection", (ws) => {
    conns.set(ws, { ws, roomId: null, participantId: null });
    ws.on("message", (data) => handleMessage(ws, data.toString()));
    ws.on("close", () => {
      const conn = conns.get(ws);
      if (conn?.roomId && conn.participantId) {
        // Grace eviction (AC-F5.2): the participant stays listed while a quick
        // refresh reconnects; only after leaveGraceMs are they removed.
        scheduleEviction(conn.roomId, conn.participantId);
      }
      conns.delete(ws);
    });
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => {
      const address = httpServer.address();
      if (address === null || typeof address === "string") {
        reject(new Error("failed to bind test server"));
        return;
      }
      resolve({
        port: address.port,
        flushLeaveTimers: () => {
          for (const entry of leaveTimers.values()) clearTimeout(entry.timer);
          leaveTimers.clear();
        },
        fireLeaveTimers: () => {
          const pending = [...leaveTimers.entries()];
          leaveTimers.clear();
          for (const [participantId, entry] of pending) {
            clearTimeout(entry.timer);
            evictParticipant(entry.roomId, participantId);
          }
        },
        close: () =>
          new Promise<void>((res) => {
            stopPing();
            for (const entry of leaveTimers.values()) clearTimeout(entry.timer);
            leaveTimers.clear();
            for (const conn of conns.values()) conn.ws.terminate();
            conns.clear();
            rooms.clear();
            wss.close(() => {
              httpServer.close(() => res());
            });
          }),
      });
    });
  });
}

/** CLI entry (local dev, Substrait container). */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8000);
  startTestServer({ port, host: "0.0.0.0" }).then((server) => {
    console.log(`scrum-poker listening on http://0.0.0.0:${server.port}`);
    const shutdown = (): void => {
      server.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  });
}

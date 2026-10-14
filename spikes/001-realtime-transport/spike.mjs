// Spike 001: Socket.IO realtime transport round-trip for Scrum Poker.
// Runs an in-process Socket.IO server + two socket.io-client instances and
// exercises the exact walking-skeleton path from tasks.md slice 0:
//   connect -> create room -> join -> vote -> broadcast (no reveal) -> reveal -> reset
// plus a raw ping/pong latency check.
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { randomBytes } from 'node:crypto';

const DECK = [1, 2, 3, 5, 8, 13, 21];
const log = (...a) => console.log(...a);
let failures = 0;
const assert = (cond, msg) => {
  if (cond) log(`  PASS  ${msg}`);
  else { failures += 1; log(`  FAIL  ${msg}`); }
};

// ---- minimal room state (server-authoritative, in-memory, ephemeral) ----
const rooms = new Map(); // roomId -> {id, hostId, phase, votes, participants}

function newRoom(hostName) {
  const roomId = randomBytes(16).toString('base64url'); // >=128 bits
  const hostId = randomBytes(16).toString('base64url');
  const room = {
    id: roomId,
    hostId,
    phase: 'voting',
    votes: new Map(),
    participants: new Map([[hostId, { id: hostId, name: hostName, hasVoted: false }]]),
  };
  rooms.set(roomId, room);
  return room;
}

function stateFor(room) {
  const participants = [...room.participants.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
    hasVoted: p.hasVoted,
  }));
  const st = {
    roomId: room.id,
    phase: room.phase,
    participants,
    votedCount: room.votes.size,
    totalCount: room.participants.size,
  };
  if (room.phase === 'revealed') {
    st.votes = [...room.votes.entries()].map(([pid, value]) => ({
      participantId: pid,
      value,
    }));
    st.consensus = detectConsensus(Object.fromEntries(room.votes));
  }
  return st;
}

function detectConsensus(votes) {
  const values = Object.values(votes);
  const distribution = {};
  for (const v of values) distribution[v] = (distribution[v] ?? 0) + 1;
  const hasConsensus = values.length > 0 && new Set(values).size === 1;
  return { hasConsensus, value: hasConsensus ? values[0] : null, distribution };
}

// ---- server ----
const httpServer = createServer();
const sio = new Server(httpServer, { cors: { origin: '*' } });

sio.on('connection', (socket) => {
  socket.on('ping', (payload, ack) => { ack({ pong: payload, t: Date.now() }); });

  socket.on('room:create', (payload, ack) => {
    const room = newRoom(payload?.name ?? 'Host');
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.participantId = room.hostId;
    const st = stateFor(room);
    ack({ ok: true, roomId: room.id, participantId: room.hostId, isHost: true, state: st });
    socket.to(room.id).emit('room:state', st); // no-op for single participant
  });

  socket.on('room:join', (payload, ack) => {
    const room = rooms.get(payload?.roomId);
    if (!room) return ack({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    const pid = randomBytes(16).toString('base64url');
    room.participants.set(pid, { id: pid, name: String(payload.name ?? 'Guest').slice(0, 40), hasVoted: false });
    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.participantId = pid;
    const st = stateFor(room);
    ack({ ok: true, roomId: room.id, participantId: pid, isHost: false, state: st });
    sio.to(room.id).emit('room:state', st);
  });

  socket.on('vote:submit', (payload, ack) => {
    const room = rooms.get(socket.data.roomId);
    const pid = socket.data.participantId;
    if (!room || !pid) return ack({ ok: false, error: { code: 'NOT_IN_ROOM' } });
    if (room.phase !== 'voting') return ack({ ok: false, error: { code: 'NOT_VOTING_PHASE' } });
    if (!DECK.includes(payload?.value)) return ack({ ok: false, error: { code: 'INVALID_VALUE' } });
    room.votes.set(pid, payload.value);
    room.participants.get(pid).hasVoted = true;
    const st = stateFor(room);
    ack({ ok: true, state: st });
    sio.to(room.id).emit('room:state', st);
  });

  socket.on('room:reveal', (payload, ack) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return ack({ ok: false, error: { code: 'NOT_IN_ROOM' } });
    if (socket.data.participantId !== room.hostId) return ack({ ok: false, error: { code: 'NOT_HOST' } });
    if (room.phase !== 'voting') return ack({ ok: false, error: { code: 'NOT_VOTING_PHASE' } });
    if (room.votes.size === 0) return ack({ ok: false, error: { code: 'ZERO_VOTES' } });
    room.phase = 'revealed';
    const st = stateFor(room);
    ack({ ok: true, state: st });
    sio.to(room.id).emit('room:state', st);
  });

  socket.on('room:reset', (payload, ack) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return ack({ ok: false, error: { code: 'NOT_IN_ROOM' } });
    if (socket.data.participantId !== room.hostId) return ack({ ok: false, error: { code: 'NOT_HOST' } });
    if (room.phase !== 'revealed') return ack({ ok: false, error: { code: 'NOT_REVEALED_PHASE' } });
    room.phase = 'voting';
    room.votes.clear();
    for (const p of room.participants.values()) p.hasVoted = false;
    const st = stateFor(room);
    ack({ ok: true, state: st });
    sio.to(room.id).emit('room:state', st);
  });

  socket.on('disconnect', () => {
    // Presence leave: for the spike just note it; real server evicts after grace.
    const room = rooms.get(socket.data.roomId);
    if (room) sio.to(room.id).emit('room:state', stateFor(room));
  });
});

await new Promise((resolve) => httpServer.listen(0, resolve));
const port = httpServer.address().port;
log(`[server] listening on :${port}`);

// ---- clients ----
const clientA = Client(`http://localhost:${port}`, { transports: ['websocket'] });
const clientB = Client(`http://localhost:${port}`, { transports: ['websocket'] });

const ack = (fn) => (res) => fn(res);
const waitFor = (emitter, event, timeout = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    emitter.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
const waitForState = (emitter, predicate, timeout = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for matching room:state')), timeout);
    const handler = (payload) => {
      if (predicate(payload)) { clearTimeout(t); emitter.off('room:state', handler); resolve(payload); }
    };
    emitter.on('room:state', handler);
  });

const [aConnected, bConnected] = await Promise.all([
  waitFor(clientA, 'connect'),
  waitFor(clientB, 'connect'),
]);
assert(clientA.connected && clientB.connected, 'both clients connect over WebSocket transport');

// 1. raw ping/pong latency (the literal walking-skeleton round trip)
const latencies = [];
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  await new Promise((resolve) => clientA.emit('ping', { n: i }, () => resolve()));
  latencies.push(Date.now() - t0);
}
const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
log(`[latency] ping/pong RTT (local, websocket): ${latencies.join('ms, ')}ms, avg ${avg.toFixed(1)}ms`);
assert(avg < 100, `round-trip latency below 100ms locally (avg ${avg.toFixed(1)}ms)`);

// 2. room:create -> ack has crypto-random roomId
const createRes = await new Promise((resolve) =>
  clientA.emit('room:create', { name: 'Alice' }, ack(resolve)));
const roomId = createRes.roomId;
assert(createRes.ok && createRes.isHost === true, 'A creates room, becomes host');
assert(/^[A-Za-z0-9_-]{22}$/.test(roomId), `roomId is 128-bit base64url token (got ${roomId})`);

// 3. room:join -> B joins, both converge on same state
const bStatePromise = waitFor(clientB, 'room:state');
const joinRes = await new Promise((resolve) =>
  clientB.emit('room:join', { roomId, name: 'Bob' }, ack(resolve)));
assert(joinRes.ok && joinRes.state.participants.length === 2, 'B joins; ack state has 2 participants');
const bSeen = await bStatePromise;
assert(bSeen.participants.length === 2, 'B receives room:state broadcast with 2 participants');

// 4. vote:submit -> B sees votedCount but NO vote values pre-reveal
const aVote = clientA.emit('vote:submit', { value: 5 }, ack(() => {}));
const bStateVote = await waitFor(clientB, 'room:state');
assert(bStateVote.votedCount === 1 && bStateVote.votes === undefined,
  'after A votes, B sees votedCount=1 and NO values (face-down enforced at protocol level)');
assert(bStateVote.participants.find((p) => p.name === 'Alice').hasVoted === true,
  'B sees who voted (hasVoted flag) without the value');

// 5. guest cannot reveal
const guestReveal = await new Promise((resolve) =>
  clientB.emit('room:reveal', {}, ack(resolve)));
assert(guestReveal.ok === false && guestReveal.error.code === 'NOT_HOST',
  'guest reveal rejected by server (host-only enforcement)');

// 6. host reveal -> single broadcast carries all values + consensus
const bRevealed = waitForState(clientB, (s) => s.phase === 'revealed');
const revealRes = await new Promise((resolve) =>
  clientA.emit('room:reveal', {}, ack(resolve)));
assert(revealRes.ok && revealRes.state.phase === 'revealed', 'host reveal succeeds, phase=revealed');
const revealedState = await bRevealed;
assert(revealedState.votes !== undefined && revealedState.votes.length === 1,
  'reveal broadcast carries votes to all clients in one event');
assert(revealedState.consensus.hasConsensus === true && revealedState.consensus.value === 5,
  'consensus detected: single submitted vote => consensus at 5');

// 7. reset -> clears votes, back to voting
const bReset = waitFor(clientB, 'room:state');
const resetRes = await new Promise((resolve) =>
  clientA.emit('room:reset', {}, ack(resolve)));
assert(resetRes.ok && resetRes.state.phase === 'voting' && resetRes.state.votedCount === 0,
  'host reset returns to voting with zero votes');
const resetState = await bReset;
assert(resetState.votes === undefined && resetState.votedCount === 0,
  'reset broadcast reaches B: votes cleared, no values in state');

// 8. mixed votes -> no-consensus + distribution
await new Promise((resolve) => clientA.emit('vote:submit', { value: 3 }, ack(resolve)));
const bRevealed2 = waitForState(clientB, (s) => s.phase === 'revealed' && s.votedCount === 2);
await new Promise((resolve) => clientB.emit('vote:submit', { value: 8 }, ack(resolve)));
await new Promise((resolve) => clientA.emit('room:reveal', {}, ack(resolve)));
const revealed2 = await bRevealed2;
assert(revealed2.consensus.hasConsensus === false,
  'mixed votes => no-consensus');
assert(JSON.stringify(revealed2.consensus.distribution) === JSON.stringify({ 3: 1, 8: 1 }),
  'distribution {3:1, 8:1} surfaced for discussion');

clientA.disconnect();
clientB.disconnect();
sio.close();

log('');
if (failures === 0) {
  log('SPIKE VERDICT: VALIDATED — Socket.IO supports the full walking-skeleton path end-to-end.');
  process.exit(0);
} else {
  log(`SPIKE VERDICT: FAILED — ${failures} assertion(s) failed.`);
  process.exit(1);
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { TRACKS, sampleTrack } from '../../shared/tracks.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const TICK_MS = 50;
const SESSION_TTL = 60_000;
const TRACK_START_T = -Math.PI / 2;
const TRACK_ID = TRACKS[0].id;
const RECHARGE_PROGRESS = [0.48, 1.32, 2.18, 3.05, 3.95, 4.88, 5.68];
const RECHARGE_OFFSETS = [-21, 18, -16, 22, -20, 17, -14];
function rechargeZones(trackId) {
  return RECHARGE_PROGRESS.map((progress, index) => {
    const t = TRACK_START_T + progress, before = sampleTrack(trackId, t - 0.001), after = sampleTrack(trackId, t + 0.001);
    const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length, nz = dx / length, offset = RECHARGE_OFFSETS[index];
    const point = sampleTrack(trackId, t);
    return [600 + point.x + nx * offset, 470 + point.z + nz * offset];
  });
}
const rooms = new Map();
const clients = new Map();
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('method not allowed'); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end('bad request'); return; }
  let file = pathname === '/' ? path.join(webRoot, 'index.html') : path.resolve(webRoot, `.${pathname}`);
  if (!file.startsWith(`${webRoot}${path.sep}`) && file !== path.join(webRoot, 'index.html')) { res.writeHead(404); res.end('not found'); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(webRoot, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); res.end('TiltRace web build is missing.'); return; }
  res.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
});
const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });

function code() { return randomBytes(4).toString('hex').toUpperCase(); }
function roomSnapshot(room) {
  return { room: room.code, phase: room.phase, startedAt: room.startedAt, trackId: room.trackId, players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: !!p.ws && p.ws.readyState === WebSocket.OPEN, latency: p.latency, nitro: p.nitro, score: p.score })) };
}
function send(ws, type, data = {}) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data })); }
function broadcast(room, type, data = {}) { const packet = JSON.stringify({ type, ...data }); for (const ws of room.browsers) if (ws.readyState === WebSocket.OPEN) ws.send(packet); for (const p of room.players.values()) if (p.ws?.readyState === WebSocket.OPEN) p.ws.send(packet); }
function announce(room) { broadcast(room, 'room', { state: roomSnapshot(room) }); }
function getRoom(id) { return typeof id === 'string' ? rooms.get(id.toUpperCase()) : null; }
function safeName(value) { return typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 18) || 'Racer' : 'Racer'; }
function onMessage(ws, raw) {
  let m; try { m = JSON.parse(raw.toString()); } catch { return send(ws, 'error', { message: 'Invalid JSON.' }); }
  if (!m || typeof m.type !== 'string') return send(ws, 'error', { message: 'Malformed message.' });
  const context = clients.get(ws);
  if (m.type === 'create') {
    if (context) return send(ws, 'error', { message: 'This connection already joined a room.' });
    let id; do { id = code(); } while (rooms.has(id));
    const room = { code: id, browsers: new Set([ws]), players: new Map(), phase: 'lobby', startedAt: null, trackId: TRACK_ID, rechargeZones: rechargeZones(TRACK_ID), stateAt: 0, lastState: [] };
    rooms.set(id, room); clients.set(ws, { role: 'browser', room });
    return send(ws, 'created', { room: id, state: roomSnapshot(room) });
  }
  if (m.type === 'join') {
    if (context) return send(ws, 'error', { message: 'This connection already joined a room.' });
    const room = getRoom(m.room); if (!room) return send(ws, 'error', { message: 'Room not found. Check the code and try again.' });
    if (room.phase !== 'lobby') return send(ws, 'error', { message: 'This race has already started.' });
    const resume = typeof m.playerId === 'string' && room.players.get(m.playerId);
    if (resume && Date.now() - resume.disconnectedAt < SESSION_TTL) {
      resume.ws?.close(); resume.ws = ws; resume.disconnectedAt = null; clients.set(ws, { role: 'player', room, playerId: resume.id });
      send(ws, 'joined', { playerId: resume.id, name: resume.name, resumed: true, browserConnected: room.browsers.size > 0, state: roomSnapshot(room) }); announce(room); return;
    }
    if (room.players.size >= 8) return send(ws, 'error', { message: 'Room is full (8 racers maximum).' });
    const player = { id: randomUUID(), name: safeName(m.name), ws, ready: false, latency: null, nitro: 100, score: 0, input: { steer: 0, throttle: 0, brake: false, jump: false, nitro: false }, lastInputAt: 0, disconnectedAt: null };
    room.players.set(player.id, player); clients.set(ws, { role: 'player', room, playerId: player.id });
    send(ws, 'joined', { playerId: player.id, name: player.name, resumed: false, browserConnected: room.browsers.size > 0, state: roomSnapshot(room) }); announce(room); return;
  }
  if (!context) return send(ws, 'error', { message: 'Join or create a room first.' });
  const { room } = context;
  if (m.type === 'ping') return send(ws, 'pong', { id: m.id, sentAt: m.sentAt, serverAt: Date.now() });
  if (m.type === 'pong' && context.role === 'player') { const p = room.players.get(context.playerId); if (p && Number.isFinite(Number(m.sentAt))) { p.latency = Math.max(0, Math.min(9999, Date.now() - Number(m.sentAt))); announce(room); } return; }
  if (context.role === 'browser') {
    if (m.type === 'start') { if (room.players.size < 1 && !m.keyboard) return send(ws, 'error', { message: 'At least one phone or keyboard racer is required.' }); room.phase = 'racing'; room.startedAt = Date.now(); announce(room); return; }
    if (m.type === 'finish') { if (room.phase === 'racing') { room.phase = 'finished'; announce(room); } return; }
    if (m.type === 'restart') { room.phase = 'lobby'; room.startedAt = null; for (const p of room.players.values()) { p.ready = false; p.nitro = 100; p.score = 0; p.input = { steer: 0, throttle: 0, brake: false, jump: false, nitro: false }; } announce(room); return; }
    if (m.type === 'state' && Array.isArray(m.cars)) {
      // Browser submits only position/score claims. The server owns nitro and validates pickup zones.
      const now = Date.now(); if (now - room.stateAt < 45) return; room.stateAt = now;
      const cars = [];
      for (const claim of m.cars.slice(0, 8)) {
        const p = room.players.get(claim.id); if (!p) continue;
        const x = Number(claim.x), y = Number(claim.y); if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 3000 || Math.abs(y) > 3000) continue;
        const pickup = room.rechargeZones.some(([px,py]) => Math.hypot(x-px,y-py) < 48);
        if (pickup && now - (p.lastPickup || 0) > 1500) { p.nitro = Math.min(100, p.nitro + 35); p.lastPickup = now; send(p.ws, 'recharge', { nitro: p.nitro }); }
        p.score = Math.max(0, Math.min(999999, Number(claim.score) || 0));
        cars.push({ id: p.id, x, y, angle: Number(claim.angle) || 0, score: p.score, nitro: p.nitro });
      }
      room.lastState = cars; for (const browser of room.browsers) send(browser, 'gameState', { cars, at: now }); return;
    }
  }
  if (context.role === 'player') {
    const p = room.players.get(context.playerId); if (!p || p.ws !== ws) return send(ws, 'error', { message: 'Session expired. Rejoin the room.' });
    if (m.type === 'ready') {
      p.ready = !!m.ready;
      send(ws, 'readyAck', { requestId: typeof m.requestId === 'string' ? m.requestId.slice(0, 64) : null, playerId: p.id, ready: p.ready });
      announce(room); return;
    }
    if (m.type === 'input') {
      const now = Date.now(); if (now - p.lastInputAt < 20) return; p.lastInputAt = now;
      const i = m.input || {}; p.input = { steer: clamp(i.steer, -1, 1), throttle: clamp(i.throttle, 0, 1), brake: !!i.brake, jump: !!i.jump, nitro: !!i.nitro && p.nitro > 0, gyro: { x: clamp(i.gyro?.x, -20, 20), y: clamp(i.gyro?.y, -20, 20), z: clamp(i.gyro?.z, -20, 20) } };
      if (p.input.nitro && !p.wasNitro) { p.nitro = Math.max(0, p.nitro - 25); p.input.nitro = p.nitro > 0; }
      p.wasNitro = !!i.nitro; send(ws, 'nitro', { nitro: p.nitro });
      const item = { id: p.id, ...p.input, nitroLevel: p.nitro, at: now };
      for (const browser of room.browsers) send(browser, 'control', { player: item }); return;
    }
  }
}
function clamp(x, min, max) { const n = Number(x); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0; }
wss.on('connection', (ws, req) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) { ws.close(1008, 'Origin not allowed'); return; }
  ws.on('message', data => onMessage(ws, data));
  ws.on('close', () => {
    const c = clients.get(ws); clients.delete(ws); if (!c) return;
    if (c.role === 'browser') { c.room.browsers.delete(ws); if (!c.room.browsers.size) for (const p of c.room.players.values()) send(p.ws, 'browserGone'); }
    else { const p = c.room.players.get(c.playerId); if (p?.ws === ws) { p.ws = null; p.disconnectedAt = Date.now(); announce(c.room); setTimeout(() => { if (p.ws || Date.now() - p.disconnectedAt < SESSION_TTL) return; c.room.players.delete(p.id); announce(c.room); cleanup(c.room); }, SESSION_TTL + 100); } }
  });
  ws.on('error', err => console.warn('WebSocket error:', err.message));
});
function cleanup(room) { if (!room.browsers.size && !room.players.size) rooms.delete(room.code); }
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) for (const p of room.players.values()) if (p.ws?.readyState === WebSocket.OPEN) send(p.ws, 'ping', { id: randomUUID(), sentAt: now });
}, 2000).unref();
server.listen(PORT, HOST, () => console.log(`TiltRace server listening on ws://${HOST}:${PORT}`));

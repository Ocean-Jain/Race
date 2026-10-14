import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const url = process.env.WS_URL || 'ws://127.0.0.1:3001';
function waitFor(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMessage); reject(new Error('Timed out waiting for WebSocket message')); }, timeout);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer); ws.off('message', onMessage); resolve(message);
    }
    ws.on('message', onMessage);
  });
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function open() {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return ws;
}
const browser = await open();
let phone = await open();
let phone2;
try {
  let received = waitFor(browser, m => m.type === 'created'); browser.send(JSON.stringify({ type: 'create' }));
  const created = await received; assert.match(created.room, /^[0-9A-F]{6}$/);
  received = waitFor(phone, m => m.type === 'joined'); phone.send(JSON.stringify({ type: 'join', room: created.room, name: 'Smoke Racer' }));
  const joined = await received;
  received = waitFor(browser, m => m.type === 'room' && m.state.players.length === 1); await received;
  received = waitFor(browser, m => m.type === 'room' && m.state.players[0].ready); phone.send(JSON.stringify({ type: 'ready', ready: true })); await received;
  received = waitFor(browser, m => m.type === 'control'); phone.send(JSON.stringify({ type: 'input', input: { steer: 0.4, throttle: 1, gyro: { x: 0.1, y: 0.2, z: 0.3 } } }));
  assert.equal((await received).player.id, joined.playerId);
  await pause(30);
  received = waitFor(phone, m => m.type === 'nitro' && m.nitro === 75); phone.send(JSON.stringify({ type: 'input', input: { nitro: true } })); await received;
  phone.send(JSON.stringify({ type: 'input', input: { nitro: false } }));
  received = waitFor(phone, m => m.type === 'recharge' && m.nitro === 100);
  browser.send(JSON.stringify({ type: 'state', cars: [{ id: joined.playerId, x: 180, y: 180, score: 10 }] })); await received;
  received = waitFor(phone, m => m.type === 'pong'); phone.send(JSON.stringify({ type: 'ping', id: 'smoke', sentAt: Date.now() })); await received;
  received = waitFor(browser, m => m.type === 'room' && m.state.phase === 'racing'); browser.send(JSON.stringify({ type: 'start' })); await received;
  received = waitFor(browser, m => m.type === 'room' && m.state.phase === 'lobby'); browser.send(JSON.stringify({ type: 'restart' })); await received;
  received = waitFor(browser, m => m.type === 'room' && m.state.players.some(p => p.id === joined.playerId && !p.connected)); phone.close(); await received;
  phone = await open(); received = waitFor(phone, m => m.type === 'joined'); phone.send(JSON.stringify({ type: 'join', room: created.room, name: 'Smoke Racer', playerId: joined.playerId }));
  assert.equal((await received).resumed, true);
  phone2 = await open(); received = waitFor(phone2, m => m.type === 'joined'); phone2.send(JSON.stringify({ type: 'join', room: created.room, name: 'Second Racer' })); await received;
  received = waitFor(browser, m => m.type === 'room' && m.state.players.length === 2); await received;
  console.log('PASS: room creation, two-phone join, reconnect resume, readiness, control relay, nitro spend/recharge, ping/pong, start, restart');
} finally { browser.close(); phone.close(); phone2?.close(); }

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { Race3D, viewColumns } from './race3d.js';
import { TRACKS, sampleTrack } from '../../shared/tracks.js';
import './style.css';

const WS = import.meta.env.VITE_WS_URL || (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.hostname}:3001`);
const PLAYER_COLORS = [0x38d9ff,0xff6c5c,0xc084fc,0xffcb45,0x72e394,0xff78bd,0x8ba5ff,0xff925c];
const CIRCUITS = TRACKS;

function CircuitGlyph({ circuit }) {
  return <svg viewBox="0 0 220 72" aria-hidden="true">
    <g transform="scale(1 .72)">
      <path d={circuit.mapPath}/>
      {circuit.bridge && <g className="track-bridge-mark"><path d="M100 51h20" className="track-bridge-shadow"/><path d="M100 51h20" className="track-bridge-deck"/></g>}
    </g>
  </svg>;
}

function EmptyGridCar() {
  return <svg className="empty-car-art" viewBox="0 0 280 156" aria-hidden="true">
    <defs>
      <linearGradient id="car-trim" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a3ffe0"/><stop offset=".52" stopColor="#46e2d1"/><stop offset="1" stopColor="#38bde8"/></linearGradient>
      <linearGradient id="car-glass" x1=".15" y1="0" x2=".9" y2="1"><stop stopColor="#173441"/><stop offset="1" stopColor="#091721"/></linearGradient>
      <filter id="car-neon" x="-35%" y="-45%" width="170%" height="190%"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse cx="140" cy="132" rx="83" ry="8" fill="#42e5cf" opacity=".13"/>
    <g className="car-speed-lines" fill="none" stroke="url(#car-trim)" strokeLinecap="round" opacity=".55">
      <path d="M40 87H78M30 98H66M42 109H73M240 87h-38m48 11h-38m29 11h-32" strokeWidth="2"/>
      <path d="M58 77h24m140 0h-24" strokeWidth="1.5" opacity=".65"/>
    </g>
    <g filter="url(#car-neon)" stroke="url(#car-trim)" strokeLinejoin="round" strokeLinecap="round">
      <path d="M70 111 75 91Q77 83 86 78L101 69 111 48Q114 42 122 41H158Q166 42 169 48L179 69 194 78Q203 83 205 91L210 111 198 121H82Z" fill="#0d1b25" strokeWidth="2.3"/>
      <path d="m101 68 10-19q2-4 8-4h42q6 0 8 4l10 19-16 4h-46Z" fill="url(#car-glass)" strokeWidth="1.8"/>
      <path d="m140 46 .5 25" fill="none" strokeWidth="1.3" opacity=".65"/>
      <path d="m89 81 18-6h66l18 6-13 8h-76Z" fill="#10232d" strokeWidth="1.5"/>
      <path d="m80 94 16-5 13 3-3 8-25 2Zm120 0-16-5-13 3 3 8 25 2Z" fill="#baffdf" strokeWidth="1.6"/>
      <path d="M76 106q22-5 64-5t64 5l-7 12H83Z" fill="#10212b" strokeWidth="1.8"/>
      <path d="M108 113h64m-54 5h44" fill="none" strokeWidth="1.4" opacity=".8"/>
      <path d="m73 92-8 4m142-4 8 4" fill="none" strokeWidth="2.2"/>
    </g>
    <path d="M118 54h44" stroke="#a5f9e0" strokeWidth="1" opacity=".55"/>
  </svg>;
}

function FooterCarGlyphs() {
  return <span className="footer-car-glyphs" aria-hidden="true">
    <svg viewBox="0 0 40 22"><path d="M3 14h5l4-5h12l5 5h5v4h-4a3 3 0 0 1-6 0h-9a3 3 0 0 1-6 0H3Zm10-5 2-4h7l4 4M2 12h6m24 0h6"/></svg>
    <svg viewBox="0 0 40 22"><path d="M5 14h4l3-6q1-2 3-2h9q3 0 5 3l4 5h3v4h-4a3 3 0 0 1-6 0H15a3 3 0 0 1-6 0H5Zm8-6-2 6m4-7h7l4 7M2 13h5m27 0h4"/></svg>
    <svg viewBox="0 0 40 22"><path d="M3 14h4l4-5q2-2 5-2h12l5 4 4 1v6h-4a3 3 0 0 1-6 0H14a3 3 0 0 1-6 0H3Zm9-5 2-3h13l3 5H11m3-4h9m-20 5H1m36 0h2"/></svg>
  </span>;
}

function TrackWatermark() {
  const track = 'M 28 438 C 20 422 45 248 57 88 C 63 18 80 12 112 52 C 156 105 179 117 211 130 C 238 142 238 157 232 180 C 224 209 253 226 284 246 C 312 264 324 279 296 282 C 243 288 174 274 117 279 C 101 280 105 267 123 250 C 143 231 169 235 205 243 C 267 257 346 262 397 257 C 428 254 435 230 421 201 C 407 172 382 164 350 151 C 318 139 311 113 325 84 C 344 43 360 25 379 43 C 403 67 428 111 455 153 C 489 206 526 271 570 342 C 599 389 626 419 584 431 C 547 442 464 438 390 436 C 303 434 226 429 146 437 C 96 442 55 447 28 438 Z';
  return <svg className="track-watermark" viewBox="0 0 640 480" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <path className="track-watermark-edge" d={track}/>
    <path className="track-watermark-center" d={track}/>
  </svg>;
}

function MiniMap({ players, trackId }) {
  const circuit = CIRCUITS.find(item => item.id === trackId) || CIRCUITS[0];
  const mapPoint = point => ({ x: 110 + point.x * .25, y: 50 + point.z * .17 });
  const trackPath = Array.from({ length: 161 }, (_, index) => {
    const point = mapPoint(sampleTrack(trackId, Math.PI * 2 * index / 160));
    return `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(' ') + ' Z';
  const start = sampleTrack(trackId, -Math.PI / 2);
  const before = sampleTrack(trackId, -Math.PI / 2 - 0.001), after = sampleTrack(trackId, -Math.PI / 2 + 0.001);
  const finishAngle = Math.atan2(after.z - before.z, after.x - before.x) * 180 / Math.PI + 90;
  return <div className="minimap" aria-label="Live race map">
    <div className="minimap-heading">{circuit.name.toUpperCase()} <span>LIVE</span></div>
    <svg viewBox="0 0 220 100" role="img" aria-label={`${circuit.name} track map and racer positions`}>
      <path d={trackPath} className="map-track-outer"/>
      <path d={trackPath} className="map-track-inner"/>
      <path d={trackPath} className="map-track-dash"/>
      <rect x={110 + start.x * .25 - 8} y={50 + start.z * .17 - 2} width="16" height="4" rx="1" className="map-finish" transform={`rotate(${finishAngle} ${110 + start.x * .25} ${50 + start.z * .17})`}/>
      {players.filter(player => Number.isFinite(player.x) && Number.isFinite(player.z)).map(player => {
        const position = mapPoint(player);
        return <g key={player.id} transform={`translate(${position.x} ${position.y}) rotate(${(player.yaw || 0) * 180 / Math.PI}) scale(1.05)`}>
          <circle className="map-player-glow" r="5" fill={player.color || '#ffffff'}/>
          <path className="map-player-marker" d="M0 -8 C2 -8 2.8 -5.7 3.2 -3.6 L4.7 -.6 V3.7 H3.3 V6.8 H-3.3 V3.7 H-4.7 V-.6 L-3.2 -3.6 C-2.8 -5.7 -2 -8 0 -8Z" fill={player.color || '#ffffff'} stroke="#ffffff" strokeWidth="1.3"/>
          <ellipse className="map-player-cockpit" cx="0" cy="-2" rx="1.45" ry="2"/>
          <path className="map-player-wing" d="M-4.6 3.1h9.2"/>
        </g>;
      })}
    </svg>
    <div className="minimap-legend">N <span>● racers</span></div>
  </div>;
}

function Dashboard({ player }) {
  const speed = Math.max(0, Math.min(120, player?.speed || 0));
  const needle = -90 + speed / 120 * 180;
  const nitro = Math.max(0, Math.min(100, player?.nitro ?? 100));
  return <div className="dashboard-shell" aria-label={`Car dashboard, ${speed} kilometers per hour`}>
    <div className="dashboard-panel">
      <div className="dash-readout"><small>GEAR</small><strong>{speed ? 'D' : 'N'}</strong><span>SPORT</span></div>
      <div className="speedometer">
        <svg viewBox="0 0 120 76" aria-hidden="true">
          <path className="gauge-ticks" d="M18 66v-7m4-10 5 2m3-15 4 4m9-13 2 6m19-10v7m18-1-2 6m15 5-4 4m10 11-5 2m10 9v-7"/>
          <path className="gauge-track" d="M18 66 A42 42 0 1 1 102 66"/>
          <path className="gauge-active" d="M18 66 A42 42 0 1 1 102 66" pathLength="100" style={{ strokeDasharray:`${speed / 120 * 100} 100` }}/>
          <g transform={`rotate(${needle} 60 65)`}><path className="gauge-needle" d="M60 65 L60 27"/><circle className="gauge-hub" cx="60" cy="65" r="3.5"/></g>
        </svg>
        <div className="speed-digital"><strong>{speed}</strong><span>KM/H</span></div>
      </div>
      <div className="dash-readout dash-boost"><small>NITRO</small><strong>{Math.round(nitro)}<i>%</i></strong><div className="dash-meter"><i style={{ width:`${nitro}%` }}/></div></div>
    </div>
  </div>;
}

function App() {
  const stageRef = useRef(null), gameRef = useRef(null), wsRef = useRef(null), shellRef = useRef(null);
  const finishedRef = useRef(false);
  const [room,setRoom] = useState(''), [players,setPlayers] = useState([]), [phase,setPhase] = useState('welcome');
  const trackId = 'infinity';
  const [qr,setQr] = useState(''), [hud,setHud] = useState([]), [error,setError] = useState('');
  const [connected,setConnected] = useState(false), [timer,setTimer] = useState(0), [keyboardOn,setKeyboardOn] = useState(false);
  const [immersive,setImmersive] = useState(false);

  useEffect(() => { const onHud = e => setHud(e.detail); window.addEventListener('hud', onHud); return () => window.removeEventListener('hud', onHud); }, []);
  useEffect(() => {
    const syncFullscreen = () => setImmersive(document.fullscreenElement === shellRef.current);
    const onKeyDown = event => { if (event.key === 'Escape' && document.fullscreenElement !== shellRef.current) setImmersive(false); };
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('fullscreenchange', syncFullscreen); window.removeEventListener('keydown', onKeyDown); };
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [immersive]);
  useEffect(() => {
    const stage = stageRef.current;
    if (phase !== 'racing' || !stage) return;
    const game = new Race3D(stage, trackId); gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, [phase === 'racing', trackId]);

  const racers = useMemo(() => [
    ...players.map((player, i) => ({ ...player, color: `#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16).padStart(6, '0')}` })),
    ...(keyboardOn ? [{ id:'keyboard', name:'Keyboard', ready:true, connected:true, latency:null, nitro:100, color:`#${PLAYER_COLORS[3].toString(16)}` }] : []),
  ], [players, keyboardOn]);

  useEffect(() => { if (phase === 'racing') gameRef.current?.setPlayers(racers); }, [phase, racers]);
  useEffect(() => {
    if (phase !== 'racing') return;
    const id = setInterval(() => setTimer(value => {
      if (value + 1 >= 120) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          window.sendRoom?.({ type:'finish' });
          setPhase('finished');
        }
        return 120;
      }
      return value + 1;
    }), 1000);
    return () => clearInterval(id);
  }, [phase]);

  function connect() {
    const ws = new WebSocket(WS); wsRef.current = ws;
    ws.onopen = () => { setConnected(true); setError(''); ws.send(JSON.stringify({ type:'create' })); };
    ws.onclose = () => { setConnected(false); setError('Server disconnected. Refresh to create a new room.'); };
    ws.onerror = () => setError(`Could not connect to ${WS}. Start the server and check the laptop firewall.`);
    ws.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'created') {
        setRoom(message.room); setPhase('lobby');
        const join = `tiltrace://join?server=${encodeURIComponent(WS)}&room=${message.room}`;
        QRCode.toDataURL(join, { width:210, margin:1, color:{ dark:'#08121c', light:'#ffffff' } }).then(setQr);
      }
      if (message.type === 'room') {
        setPlayers(message.state.players);
        if (message.state.phase === 'racing' && !finishedRef.current) setPhase('racing');
        if (message.state.phase === 'finished') { finishedRef.current = true; setPhase('finished'); }
        if (message.state.phase === 'lobby') { finishedRef.current = false; setPhase('lobby'); }
      }
      if (message.type === 'control') gameRef.current?.control(message.player);
      if (message.type === 'gameState') gameRef.current?.applyServerState(message.cars);
      if (message.type === 'error') setError(message.message);
    };
    window.sendRoom = message => wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(message));
  }

  function start() {
    finishedRef.current = false;
    window.sendRoom?.({ type:'start', keyboard:keyboardOn });
    setTimer(0); setPhase('racing');
  }
  async function toggleImmersive() {
    if (immersive) {
      if (document.fullscreenElement === shellRef.current) await document.exitFullscreen?.();
      setImmersive(false);
      return;
    }
    try {
      if (shellRef.current?.requestFullscreen) await shellRef.current.requestFullscreen();
      else setError('Browser fullscreen is unavailable; using immersive layout. Press Escape to exit.');
      setImmersive(true);
    } catch {
      setImmersive(true);
      setError('Browser fullscreen was blocked. Immersive layout is active; press Escape to exit.');
    }
  }
  function restart() { finishedRef.current = false; window.sendRoom?.({ type:'restart' }); if (document.fullscreenElement === shellRef.current) document.exitFullscreen?.(); setImmersive(false); setTimer(0); setPhase('lobby'); }
  function addKeyboard() { setKeyboardOn(true); setError('Keyboard racer added: WASD or arrows to drive, Space for nitro, Shift to jump.'); }

  const hudById = new Map(hud.map(player => [player.id, player]));
  const columns = viewColumns(Math.max(1, racers.length));
  const clock = phase === 'finished' ? 0 : 120 - timer;
  const finalResults = [...hud].sort((a, b) => b.score - a.score || (b.laps || 0) - (a.laps || 0) || a.name.localeCompare(b.name));
  const activeCircuit = CIRCUITS[0];

  return <main ref={shellRef} className={`shell${immersive ? ' immersive' : ''}`}>
    <TrackWatermark/>
    <header className="top">
      <a className="brand" href="#"><span className="logo">T</span><span>TILT<span className="accent">RACE</span></span></a>
      <span className={`server ${connected ? 'online' : ''}`}><i/>{connected ? 'SERVER CONNECTED' : 'SERVER OFFLINE'}</span>
    </header>
    {phase === 'welcome' && <section className="welcome">
      <div className="eyebrow">3D ARCADE RACING · PHONE MOTION CONTROLS</div>
      <h1>Race with a<br/><em>new perspective.</em></h1>
      <p>Turn your phone into a steering wheel. Join the room, lean into the corners, and race your friends on the big screen.</p>
      <button className="primary" onClick={connect}>Create a race room <span>↗</span></button>
      <div className="features"><span>◉ Tilt steering</span><span>⌁ Multiplayer</span><span>ϟ Nitro pickups</span></div>
      <div className="connect-note">Browser connects to <code>{WS}</code><br/>Each racer gets a horizon-forward chase camera, their own color, and a live dashboard.</div>
    </section>}
    {phase === 'lobby' && <section className="lobby">
      <div className="lobby-title"><div><div className="eyebrow">ROOM READY</div><h1>Get your crew<br/><em>on the grid.</em></h1></div><div className="room-pill"><small>ROOM CODE</small><strong>{room}</strong></div></div>
      <div className="track-banner" aria-label="Race track: Infinity Circuit">
        <span className="track-banner-label">RACE TRACK</span>
        <CircuitGlyph circuit={activeCircuit}/>
        <div><strong>{activeCircuit.name}</strong><small>ONE LOOP · BRIDGE CROSSING</small></div>
      </div>
      <div className="pair-grid">
        <div className="qr-panel"><div className="qrwrap">{qr && <img src={qr} alt={`QR code to join room ${room}`}/>}</div><h2>Scan to join</h2><p>Open your phone camera and point it at the code.</p><button className="copy" onClick={() => navigator.clipboard?.writeText(room)}>Copy room code</button></div>
        <div className={`players-panel ${players.length === 0 ? 'waiting-panel' : ''}`}><div className="panel-heading">PLAYERS <span>{players.length} / 8</span></div>
          {players.length === 0 ? <div className="empty empty-state"><EmptyGridCar/><b>Waiting for racers</b><span>Join from your phone to appear here.</span></div> : <div className="roster">{players.map((player,i) => <div className="racer" key={player.id}><i style={{background:`#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16)}`}}/><span><b>{player.name}</b><small>{player.connected ? 'Connected' : 'Reconnecting'} · {player.latency ?? '—'} ms</small></span><strong className={player.ready ? 'ready' : ''}>{player.ready ? 'READY' : 'JOINED'}</strong></div>)}</div>}
          {keyboardOn && <div className="racer"><i style={{background:'#ffcb45'}}/><span><b>Keyboard</b><small>WASD / arrows</small></span><strong className="ready">READY</strong></div>}
          <div className="lobby-actions"><button className="secondary" onClick={addKeyboard}>＋ Add keyboard racer</button><button className="primary" disabled={(!players.length && !keyboardOn) || players.some(player => !player.ready || !player.connected)} onClick={start}>Start race <span>→</span></button></div>
        </div>
      </div>
      <p className="lobby-foot">QR server: <code>{WS}</code>. Scan to connect, then tap <b>Ready to race</b>.</p>
    </section>}
    {(phase === 'racing' || phase === 'finished') && <section className="race-view">
      <div className="race-head"><div><div className="race-meta"><span className="race-meta-badge room-meta"><small>ROOM</small><b>{room}</b></span><span className="race-meta-badge circuit-meta"><small>CIRCUIT</small><b>{activeCircuit.flag} {activeCircuit.name}</b></span><span className="race-meta-badge racer-meta"><b>{racers.length}</b><small>RACER{racers.length === 1 ? '' : 'S'}</small></span></div><h1>{phase === 'finished' ? <>Round <em>complete</em></> : <>Race <em>in progress</em></>}</h1></div><div className="race-tools"><span className="timer">⏱ {String(Math.floor(clock/60)).padStart(2,'0')}:{String(clock%60).padStart(2,'0')}</span><button className="secondary" onClick={restart}>↻ {phase === 'finished' ? 'Race again' : 'New round'}</button><button className="secondary immersive-toggle" onClick={toggleImmersive} aria-pressed={immersive} title={immersive ? 'Exit immersive mode' : 'Enter immersive mode'}><span aria-hidden="true">⛶</span> {immersive ? 'Exit fullscreen' : 'Fullscreen'}</button></div></div>
      {phase === 'racing' ? <>
        <div className="race-stage" ref={stageRef}>
          <div className="race-panels" style={{ '--view-columns':columns }}>
            {racers.map(player => { const live = hudById.get(player.id); return <div className="race-player-cell" key={player.id}>
              <div className="cell-name"><i style={{background:live?.color || player.color}}/><span>{live?.name || player.name}</span></div>
              <div className="cell-stats"><b className="cell-speed">{live?.speed ?? 0}<small> km/h</small></b><span className="cell-results"><b>{live?.score ?? 0}<small>PTS</small></b><i/><b>{live?.laps ?? 0}<small>LAPS</small></b></span>{live?.penaltyRemaining > 0 && <span className="penalty-badge">PENALTY · {live.penaltyRemaining.toFixed(1)}s</span>}<div className="cell-meter"><i style={{width:`${live?.nitro ?? player.nitro ?? 100}%`}}/></div></div>
              <Dashboard player={live}/>
            </div>; })}
          </div>
          <MiniMap players={hud.filter(player => player.id !== 'keyboard' || keyboardOn)} trackId={trackId}/>
          <div className="three-caption"><span>WASD / arrows · Accelerate · Brake · Nitro · Jump</span><span>CHASE CAM · SPLIT VIEW</span></div>
        </div>
        <div className="hud-list">{hud.map((player,i) => <div className="hud-item" key={player.id}><i style={{background:player.color || `#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16)}`}}/><div className="hud-name"><b>{player.name}</b><small>{player.connected ? 'ONLINE' : 'OFFLINE'} · {player.latency ?? '—'} ms</small></div><div className="meter"><span style={{width:`${player.nitro}%`}}/></div><strong>{player.score} pts</strong></div>)}</div>
      </> : <div className="finish-panel"><div className="eyebrow">CHECKERED FLAG · RANKED BY POINTS</div><h2>That’s the round.</h2>{finalResults.map((player,i) => <div className="finish-player" key={player.id}><b>#{i+1}　{player.name}<small>{player.laps || 0} {player.laps === 1 ? 'lap' : 'laps'}</small></b><span>{player.score} pts</span></div>)}</div>}
    </section>}
    {error && <div role="status" className="toast" onClick={() => setError('')}>{error}<button aria-label="Dismiss">×</button></div>}
    <footer><div className="footer-brandline"><FooterCarGlyphs/><span className="footer-wordmark">TILT<span className="accent">RACE</span><small>ONE TRACK, EVERY RACER.</small></span></div><span className="footer-signoff">ONE LAP AT A TIME</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);

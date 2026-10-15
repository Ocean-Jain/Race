import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { Race3D, viewColumns } from './race3d.js';
import './style.css';

const WS = import.meta.env.VITE_WS_URL || (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.hostname}:3001`);
const PLAYER_COLORS = [0x38d9ff,0xff6c5c,0xc084fc,0xffcb45,0x72e394,0xff78bd,0x8ba5ff,0xff925c];

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

function FormulaCarWatermark() {
  return <svg className="formula-car-watermark" viewBox="0 0 620 420" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Rear wing and tapered engine cover */}
      <path d="M113 247 157 237 203 242 253 228 291 203 337 191 388 200 435 222 493 231 534 244 565 248"/>
      <path d="m91 235 69-9 25 4 17 13m-75 5-15 19 47 6 26-16m362-20 35 6-3 16-38 1"/>
      <path d="m161 226 7-29 13-7 13 11 7 36m-23-46-2-17 20-2 8 17"/>
      {/* Cockpit halo and driver */}
      <path d="m234 234 14-39 22-26 33-10 39 7 29 22 13 29"/>
      <path d="m254 203 18-24 28-9 24 5 20 17 10 23-25-4-20-14-20 3-18 13Z"/>
      <path d="m282 190 4-17 14-11 16 3 8 11-8 13-18 5Zm3-17 21 4 10-9m-57 29-15-9-13 4-9 23m123-32 21 4 18 16"/>
      {/* Nose, front wing and suspension */}
      <path d="m264 232 25 10 33 7 40 1 38-7 23-13 30 11 22 12-5 11-47 3-26-5-26 12-40 7-49-5-35-13-45 3-35-6 16-13 38-12 43-3Z"/>
      <path d="m282 241 27-14 22-2 23 9 26 9m-87-3-18 17m128-18 22 11m-168-13-28 12-22 1m245-13 30 8 14 9-38 2"/>
      {/* Exposed wheels, rims and small speed details */}
      <path d="M195 242c-18-4-34 7-38 24-4 18 7 34 24 38 18 4 34-7 38-24 4-18-7-34-24-38Zm240-5c-18-4-34 7-38 24-4 18 7 34 24 38 18 4 34-7 38-24 4-18-7-34-24-38Z"/>
      <path d="M192 254c-10-2-19 4-21 14-2 10 4 19 14 21 10 2 19-4 21-14 2-10-4-19-14-21Zm240-5c-10-2-19 4-21 14-2 10 4 19 14 21 10 2 19-4 21-14 2-10-4-19-14-21Z"/>
      <path d="m302 232 13 13m44-4 12-15m-174 63-19 10m264-12 24 11m-347-43h38m-30 13h27m342-20h39m-31 14h28"/>
      {/* Fine technical contour accents */}
      <path d="m196 214 31-8m165 13 38 7m-189 47 38 5m115 7 38-5" strokeWidth="1"/>
    </g>
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
  const track = 'M 55 250 C 55 78 278 60 390 250 C 502 440 725 422 725 250 C 725 78 502 60 390 250 C 278 440 55 422 55 250';
  return <svg className="track-watermark" viewBox="0 0 780 500" aria-hidden="true">
    <path className="track-watermark-edge" d={track}/>
    <path className="track-watermark-center" d={track}/>
  </svg>;
}

function MiniMap({ players }) {
  const figureEight = 'M 28 80 C 28 30 88 28 110 80 C 132 132 192 130 192 80 C 192 30 132 28 110 80 C 88 132 28 130 28 80';
  return <div className="minimap" aria-label="Live race map">
    <div className="minimap-heading">TRACK MAP <span>LIVE</span></div>
    <svg viewBox="0 0 220 160" role="img" aria-label="Figure-eight race track and racer positions">
      <path d={figureEight} className="map-track-outer"/>
      <path d={figureEight} className="map-track-inner"/>
      <path d={figureEight} className="map-track-dash"/>
      <path d="M18 74h20v12H18z M182 74h20v12h-20z" className="map-finish"/>
      {players.map(player => <g key={player.id} transform={`translate(${110 + player.x * .24} ${80 + player.z * .25}) rotate(${player.yaw * 180 / Math.PI})`}>
        <path d="M0 -8 L4.5 5 L0 2.5 L-4.5 5 Z" fill={player.color || '#ffffff'} stroke="#06131b" strokeWidth="1.2"/>
      </g>)}
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
  const stageRef = useRef(null), gameRef = useRef(null), wsRef = useRef(null);
  const finishedRef = useRef(false);
  const [room,setRoom] = useState(''), [players,setPlayers] = useState([]), [phase,setPhase] = useState('welcome');
  const [qr,setQr] = useState(''), [hud,setHud] = useState([]), [error,setError] = useState('');
  const [connected,setConnected] = useState(false), [timer,setTimer] = useState(0), [keyboardOn,setKeyboardOn] = useState(false);

  useEffect(() => { const onHud = e => setHud(e.detail); window.addEventListener('hud', onHud); return () => window.removeEventListener('hud', onHud); }, []);
  useEffect(() => {
    const stage = stageRef.current;
    if (phase !== 'racing' || !stage) return;
    const game = new Race3D(stage); gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, [phase === 'racing']);

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
  function restart() { finishedRef.current = false; window.sendRoom?.({ type:'restart' }); setTimer(0); setPhase('lobby'); }
  function addKeyboard() { setKeyboardOn(true); setError('Keyboard racer added: WASD or arrows to drive, Space for nitro, Shift to jump.'); }

  const hudById = new Map(hud.map(player => [player.id, player]));
  const columns = viewColumns(Math.max(1, racers.length));
  const clock = phase === 'finished' ? 0 : 120 - timer;
  const finalResults = [...hud].sort((a, b) => b.score - a.score || (b.laps || 0) - (a.laps || 0) || a.name.localeCompare(b.name));

  return <main className="shell">
    <TrackWatermark/>
    <header className="top">
      <a className="brand" href="#"><span className="logo">T</span><span>TILT<span className="accent">RACE</span></span></a>
      <span className={`server ${connected ? 'online' : ''}`}><i/>{connected ? 'SERVER CONNECTED' : 'SERVER OFFLINE'}</span>
    </header>
    {phase === 'welcome' && <section className="welcome">
      <FormulaCarWatermark/>
      <div className="eyebrow">3D ARCADE RACING · PHONE MOTION CONTROLS</div>
      <h1>Race with a<br/><em>new perspective.</em></h1>
      <p>Turn your phone into a steering wheel. Join the room, lean into the corners, and race your friends on the big screen.</p>
      <button className="primary" onClick={connect}>Create a race room <span>↗</span></button>
      <div className="features"><span>◉ Tilt steering</span><span>⌁ Multiplayer</span><span>ϟ Nitro pickups</span></div>
      <div className="connect-note">Browser connects to <code>{WS}</code><br/>Each racer gets a horizon-forward chase camera, their own color, and a live dashboard.</div>
    </section>}
    {phase === 'lobby' && <section className="lobby">
      <div className="lobby-title"><div><div className="eyebrow">ROOM READY</div><h1>Get your crew<br/><em>on the grid.</em></h1></div><div className="room-pill"><small>ROOM CODE</small><strong>{room}</strong></div></div>
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
      <div className="race-head"><div><div className="eyebrow">ROOM {room} · {racers.length} RACER{racers.length === 1 ? '' : 'S'}</div><h1>{phase === 'finished' ? <>Round <em>complete</em></> : <>Race <em>in progress</em></>}</h1></div><div className="race-tools"><span className="timer">⏱ {String(Math.floor(clock/60)).padStart(2,'0')}:{String(clock%60).padStart(2,'0')}</span><button className="secondary" onClick={restart}>↻ {phase === 'finished' ? 'Race again' : 'New round'}</button></div></div>
      {phase === 'racing' ? <>
        <div className="race-stage" ref={stageRef}>
          <div className="race-panels" style={{ '--view-columns':columns }}>
            {racers.map(player => { const live = hudById.get(player.id); return <div className="race-player-cell" key={player.id}>
              <div className="cell-name"><i style={{background:live?.color || player.color}}/><span>{live?.name || player.name}</span></div>
              <div className="cell-stats"><b>{live?.speed ?? 0}<small> km/h</small></b><span>{live?.score ?? 0} pts · {live?.laps ?? 0} laps</span>{live?.penaltyRemaining > 0 && <span className="penalty-badge">PENALTY · {live.penaltyRemaining.toFixed(1)}s</span>}<div className="cell-meter"><i style={{width:`${live?.nitro ?? player.nitro ?? 100}%`}}/></div></div>
              <Dashboard player={live}/>
            </div>; })}
          </div>
          <MiniMap players={hud.filter(player => player.id !== 'keyboard' || keyboardOn)}/>
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

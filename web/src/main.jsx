import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { Race3D, viewColumns } from './race3d.js';
import './style.css';

const WS = import.meta.env.VITE_WS_URL || (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.hostname}:3001`);
const PLAYER_COLORS = [0x38d9ff,0xff6c5c,0xc084fc,0xffcb45,0x72e394,0xff78bd,0x8ba5ff,0xff925c];

function MiniMap({ players }) {
  return <div className="minimap" aria-label="Live race map">
    <div className="minimap-heading">TRACK MAP <span>LIVE</span></div>
    <svg viewBox="0 0 160 160" role="img" aria-label="Circular race track and racer positions">
      <circle cx="80" cy="80" r="49" className="map-track-outer"/>
      <circle cx="80" cy="80" r="31" className="map-track-inner"/>
      <circle cx="80" cy="80" r="39" className="map-track-dash"/>
      <path d="M76 30h8v14h-8z" className="map-finish"/>
      {players.map(player => <g key={player.id} transform={`translate(${80 + player.x * .128} ${80 + player.z * .128}) rotate(${player.yaw * 180 / Math.PI})`}>
        <path d="M0 -6 L3.5 4 L0 2 L-3.5 4 Z" fill={player.color || '#ffffff'} stroke="#06131b" strokeWidth="1.2"/>
      </g>)}
    </svg>
    <div className="minimap-legend">N <span>● racers</span></div>
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

  return <main className="shell">
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
      <div className="connect-note">Browser connects to <code>{WS}</code><br/>Each racer gets a hood-level first-person camera when the race starts.</div>
    </section>}
    {phase === 'lobby' && <section className="lobby">
      <div className="lobby-title"><div><div className="eyebrow">ROOM READY</div><h1>Get your crew<br/><em>on the grid.</em></h1></div><div className="room-pill"><small>ROOM CODE</small><strong>{room}</strong></div></div>
      <div className="pair-grid">
        <div className="qr-panel"><div className="qrwrap">{qr && <img src={qr} alt={`QR code to join room ${room}`}/>}</div><h2>Scan to join</h2><p>Open your phone camera and point it at the code.</p><button className="copy" onClick={() => navigator.clipboard?.writeText(room)}>Copy room code</button></div>
        <div className="players-panel"><div className="panel-heading">PLAYERS <span>{players.length} / 8</span></div>
          {players.length === 0 ? <div className="empty"><span className="waiting-icon">⌖</span><b>Waiting for racers</b><span>Join from your phone to appear here.</span></div> : <div className="roster">{players.map((player,i) => <div className="racer" key={player.id}><i style={{background:`#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16)}`}}/><span><b>{player.name}</b><small>{player.connected ? 'Connected' : 'Reconnecting'} · {player.latency ?? '—'} ms</small></span><strong className={player.ready ? 'ready' : ''}>{player.ready ? 'READY' : 'JOINED'}</strong></div>)}</div>}
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
              <div className="cell-stats"><b>{live?.speed ?? 0}<small> km/h</small></b><span>{live?.score ?? 0} pts</span><div className="cell-meter"><i style={{width:`${live?.nitro ?? player.nitro ?? 100}%`}}/></div></div>
            </div>; })}
          </div>
          <MiniMap players={hud.filter(player => player.id !== 'keyboard' || keyboardOn)}/>
          <div className="three-caption"><span>WASD / arrows · Accelerate · Brake · Nitro · Jump</span><span>HOOD CAM · SPLIT VIEW</span></div>
        </div>
        <div className="hud-list">{hud.map((player,i) => <div className="hud-item" key={player.id}><i style={{background:player.color || `#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16)}`}}/><div className="hud-name"><b>{player.name}</b><small>{player.connected ? 'ONLINE' : 'OFFLINE'} · {player.latency ?? '—'} ms</small></div><div className="meter"><span style={{width:`${player.nitro}%`}}/></div><strong>{player.score} pts</strong></div>)}</div>
      </> : <div className="finish-panel"><div className="eyebrow">CHECKERED FLAG</div><h2>That’s the round.</h2>{[...hud].sort((a,b) => b.score-a.score).map((player,i) => <div className="finish-player" key={player.id}><b>#{i+1}　{player.name}</b><span>{player.score} pts</span></div>)}</div>}
    </section>}
    {error && <div role="status" className="toast" onClick={() => setError('')}>{error}<button aria-label="Dismiss">×</button></div>}
    <footer><span>TILT<span className="accent">RACE</span> <small>ONE TRACK, EVERY RACER.</small></span><span>ONE LAP AT A TIME</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);

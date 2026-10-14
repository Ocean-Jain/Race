import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import QRCode from 'qrcode';
import './style.css';

const WS = import.meta.env.VITE_WS_URL || (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.hostname}:3001`);
const COLORS = [0x38d9ff,0xff6c5c,0xc084fc,0xffcb45,0x72e394,0xff78bd,0x8ba5ff,0xff925c];
const PICKUPS = [[180,180],[760,180],[1080,470],[750,780],[160,720]];

class Race extends Phaser.Scene {
  constructor() { super('race'); this.cars = new Map(); this.remote = new Map(); this.keys = {}; this.lastSend = 0; this.raceTime = 0; }
  create() {
    this.g = this.add.graphics(); this.paintTrack();
    this.input.keyboard.on('keydown', e => { this.keys[e.code] = true; }); this.input.keyboard.on('keyup', e => { this.keys[e.code] = false; });
    window.raceScene = this;
    this.scale.on('resize', () => this.paintTrack());
  }
  paintTrack() {
    if (!this.g) return; const g=this.g; g.clear();
    g.fillStyle(0x12231f).fillRect(0,0,1240,960);
    g.lineStyle(210,0x38404a,1).strokeEllipse(600,470,930,670);
    g.lineStyle(177,0x202b32,1).strokeEllipse(600,470,930,670);
    g.lineStyle(3,0xc6ccd0,.5).strokeEllipse(600,470,1010,750);
    g.lineStyle(3,0xc6ccd0,.5).strokeEllipse(600,470,850,590);
    // Start/finish stripe on the south straight.
    g.fillStyle(0xf5f7f8,1); for(let i=0;i<10;i++) for(let j=0;j<2;j++) if((i+j)%2===0) g.fillRect(590+i*8,790+j*8,8,8);
    PICKUPS.forEach(([x,y],n)=>{g.fillStyle(0x00e5ae,.16).fillCircle(x,y,42);g.lineStyle(3,0x5cffc5,.9).strokeCircle(x,y,27);g.fillStyle(0x5cffc5,1).fillTriangle(x-8,y+6,x,y-9,x+8,y+6);});
    [[425,235],[830,440],[400,700],[700,650]].forEach(([x,y])=>{g.fillStyle(0xe84e48,1).fillRoundedRect(x-22,y-12,44,24,8);g.fillStyle(0xffb645,1).fillCircle(x,y,5);});
    g.fillStyle(0xffffff,.08).fillEllipse(600,470,570,340);
  }
  makeCar(id,name,color,bot=false) {
    const x=600+(this.cars.size%3)*26, y=825+Math.floor(this.cars.size/3)*24;
    const body=this.add.container(x,y); const gg=this.add.graphics(); gg.fillStyle(color,1).fillRoundedRect(-14,-24,28,48,7); gg.fillStyle(0xdffaff,1).fillRoundedRect(-9,-17,18,13,4); gg.fillStyle(0x18232b,1).fillRoundedRect(-10,7,20,9,3); gg.fillStyle(0x131a20,1).fillRoundedRect(-18,-16,5,12,2).fillRoundedRect(13,-16,5,12,2).fillRoundedRect(-18,7,5,12,2).fillRoundedRect(13,7,5,12,2); body.add(gg);
    const label=this.add.text(0,-34,name,{fontFamily:'Arial',fontSize:'13px',color:'#ffffff',stroke:'#101820',strokeThickness:4}).setOrigin(.5,1); body.add(label);
    const car={id,name,color,body,bot,x,y,angle:0,v:0,nitro:100,score:0,ready:false,latency:null,jump:0};this.cars.set(id,car);return car;
  }
  setPlayers(players) { for(const p of players) {let c=this.cars.get(p.id);if(!c)c=this.makeCar(p.id,p.name,COLORS[this.cars.size%COLORS.length]);c.ready=p.ready;c.connected=p.connected;c.latency=p.latency;c.nitro=p.nitro;} }
  control(p) { this.remote.set(p.id,{...p,receivedAt:Date.now()}); }
  stepCar(c,dt,input) {
    const seconds=Math.min(dt/1000,.04); if(!input){input={steer:0,throttle:0,brake:false,jump:false,nitro:false};}
    const boost=input.nitro&&c.nitro>0;
    const target=input.throttle?input.throttle:0; c.v += (target*(boost?430:260)-(input.brake?420:68))*seconds;
    if(!input.throttle&&!input.brake)c.v*=Math.pow(.985,seconds*60); c.v=Phaser.Math.Clamp(c.v,-75,boost?330:235);
    if(boost)c.nitro=Math.max(0,c.nitro-28*seconds);
    c.angle += input.steer*seconds*(.45+Math.min(Math.abs(c.v)/120,1.2))*Math.sign(c.v||1);
    c.x += Math.sin(c.angle)*c.v*seconds; c.y -= Math.cos(c.angle)*c.v*seconds;
    const radius=Math.hypot((c.x-600)/465,(c.y-470)/335);
    if(radius<.73||radius>1.28){c.v*=.82;c.x-=Math.sin(c.angle)*c.v*seconds*1.7;c.y+=Math.cos(c.angle)*c.v*seconds*1.7;}
    for(const [ox,oy] of [[425,235],[830,440],[400,700],[700,650]])if(Math.hypot(c.x-ox,c.y-oy)<29)c.v*=-.35;
    if(input.jump&&c.jump<=0)c.jump=0.75; c.jump=Math.max(0,c.jump-seconds);
    c.body.setPosition(c.x,c.y).setRotation(c.angle).setScale(c.jump?1.08:1);
    c.score=Math.max(0,Math.floor(c.score+Math.max(c.v,0)*seconds/12));
  }
  update(t,dt) {
    for(const c of this.cars.values()){
      let inp=this.remote.get(c.id); if(inp&&Date.now()-inp.receivedAt>300)inp=null;
      if(!inp&&c.id==='keyboard'){inp={steer:(this.keys.ArrowLeft||this.keys.KeyA?-1:0)+(this.keys.ArrowRight||this.keys.KeyD?1:0),throttle:this.keys.ArrowUp||this.keys.KeyW?1:0,brake:!!(this.keys.ArrowDown||this.keys.KeyS),nitro:!!this.keys.Space,jump:!!this.keys.ShiftLeft};}
      this.stepCar(c,dt,inp);
    }
    if(t-this.lastSend>60){this.lastSend=t;const payload=[...this.cars.values()].filter(c=>!c.bot).map(c=>({id:c.id,x:c.x,y:c.y,angle:c.angle,score:c.score}));if(payload.length)window.sendRoom?.({type:'state',cars:payload});}
    window.dispatchEvent(new CustomEvent('hud',{detail:[...this.cars.values()].map(c=>({id:c.id,name:c.name,nitro:c.nitro,score:c.score,latency:c.latency,connected:c.connected}))}));
  }
}

function App(){
  const gameRef=useRef(null), wsRef=useRef(null); const [room,setRoom]=useState(''),[code,setCode]=useState(''),[players,setPlayers]=useState([]),[phase,setPhase]=useState('welcome'),[qr,setQr]=useState(''),[url,setUrl]=useState(''),[hud,setHud]=useState([]),[error,setError]=useState(''),[connected,setConnected]=useState(false),[timer,setTimer]=useState(0),[keyboardOn,setKeyboardOn]=useState(false);
  useEffect(()=>{const f=e=>setHud(e.detail);window.addEventListener('hud',f);return()=>window.removeEventListener('hud',f)},[]);
  useEffect(()=>{if(!gameRef.current)return;const game=new Phaser.Game({type:Phaser.AUTO,parent:'game-stage',backgroundColor:'#12231f',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:1240,height:960},scene:[Race],render:{antialias:true},fps:{target:60,forceSetTimeOut:true}});gameRef.current=game;return()=>game.destroy(true)},[phase==='racing']);
  useEffect(()=>{if(phase!=='racing')return;const id=setInterval(()=>{const scene=window.raceScene;if(scene){scene.setPlayers(players);if(keyboardOn&&!scene.cars.has('keyboard'))scene.makeCar('keyboard','KEYBOARD',COLORS[3]);clearInterval(id)}},50);return()=>clearInterval(id)},[phase,players,keyboardOn]);
  useEffect(()=>{if(phase!=='racing')return;const id=setInterval(()=>setTimer(s=>{if(s+1>=120){setPhase('finished');return 120}return s+1}),1000);return()=>clearInterval(id)},[phase]);
  function connect(){const ws=new WebSocket(WS);wsRef.current=ws;ws.onopen=()=>{setConnected(true);setError('');ws.send(JSON.stringify({type:'create'}))};ws.onclose=()=>{setConnected(false);if(phase!=='welcome')setError('Server disconnected. Refresh to create a new room.')};ws.onerror=()=>setError(`Could not connect to ${WS}. Start the server and check the laptop firewall.`);ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.type==='created'){setRoom(m.room);setPhase('lobby');const join=`tiltrace://join?server=${encodeURIComponent(WS)}&room=${m.room}`;setUrl(join);QRCode.toDataURL(join,{width:210,margin:1,color:{dark:'#08121c',light:'#ffffff'}}).then(setQr)}if(m.type==='room'){setPlayers(m.state.players);window.raceScene?.setPlayers(m.state.players);if(m.state.phase==='racing')setPhase('racing');if(m.state.phase==='lobby')setPhase('lobby')}if(m.type==='control')window.raceScene?.control(m.player);if(m.type==='gameState'){for(const p of m.cars){const c=window.raceScene?.cars.get(p.id);if(c){c.nitro=p.nitro;c.score=Math.max(c.score,p.score)}}}if(m.type==='error')setError(m.message)};window.sendRoom=m=>wsRef.current?.readyState===1&&wsRef.current.send(JSON.stringify(m))}
  function start(){if(players.length)window.sendRoom?.({type:'start'});setTimer(0);setPhase('racing')}
  function restart(){window.sendRoom?.({type:'restart'});setTimer(0);setPhase('lobby')}
  function keyboard(){setKeyboardOn(true);if(window.raceScene&&!window.raceScene.cars.has('keyboard'))window.raceScene.makeCar('keyboard','KEYBOARD',COLORS[3]);setError('Keyboard racer added: WASD or arrows to drive, Space for nitro, Shift to jump.')}
  const shown=players;
  return (
    <main className="shell">
      <header className="top">
        <a className="brand" href="#"><span className="logo">T</span><span>TILT<span className="accent">RACE</span></span></a>
        <span className={`server ${connected ? 'online' : ''}`}><i/>{connected ? 'SERVER CONNECTED' : 'SERVER OFFLINE'}</span>
      </header>
      {phase === 'welcome' && <section className="welcome">
        <div className="eyebrow">ARCADE RACING · PHONE MOTION CONTROLS</div>
        <h1>Race with a<br/><em>new perspective.</em></h1>
        <p>Turn your phone into a steering wheel. Join the room, lean into the corners, and race your friends on the big screen.</p>
        <button className="primary" onClick={connect}>Create a race room <span>↗</span></button>
        <div className="features"><span>◉ Tilt steering</span><span>⌁ Local multiplayer</span><span>ϟ Nitro pickups</span></div>
        <div className="connect-note">Browser connects to <code>{WS}</code><br/>For play across networks, open the hosted HTTPS game page. Local testing works over the same Wi-Fi.</div>
      </section>}
      {phase === 'lobby' && <section className="lobby">
        <div className="lobby-title"><div><div className="eyebrow">ROOM READY</div><h1>Get your crew<br/><em>on the grid.</em></h1></div><div className="room-pill"><small>ROOM CODE</small><strong>{room}</strong></div></div>
        <div className="pair-grid">
          <div className="qr-panel"><div className="qrwrap">{qr && <img src={qr} alt={`QR code to join room ${room}`}/>}</div><h2>Scan to join</h2><p>Open your phone camera and point it at the code.</p><button className="copy" onClick={() => navigator.clipboard?.writeText(room)}>Copy room code</button></div>
          <div className="players-panel"><div className="panel-heading">PLAYERS <span>{shown.length} / 8</span></div>
            {shown.length === 0 ? <div className="empty"><span className="waiting-icon">⌖</span><b>Waiting for racers</b><span>Join from your phone to appear here.</span></div> : <div className="roster">{shown.map((p,i) => <div className="racer" key={p.id}><i style={{background:`#${COLORS[i%COLORS.length].toString(16)}`}}/><span><b>{p.name}</b><small>{p.connected ? 'Connected' : 'Reconnecting'} · {p.latency ?? '—'} ms</small></span><strong className={p.ready ? 'ready' : ''}>{p.ready ? 'READY' : 'JOINED'}</strong></div>)}</div>}
            <div className="lobby-actions"><button className="secondary" onClick={keyboard}>＋ Add keyboard racer</button><button className="primary" disabled={(!shown.length && !keyboardOn) || shown.some(p => !p.ready || !p.connected)} onClick={start}>Start race <span>→</span></button></div>
          </div>
        </div>
        <p className="lobby-foot">QR server: <code>{WS}</code>. Use the hosted HTTPS page for internet play, or the laptop’s Wi-Fi address for local play. Connect your phone and tap <b>Ready to race</b>.</p>
      </section>}
      {(phase === 'racing' || phase === 'finished') && <section className="race-view">
        <div className="race-head"><div><div className="eyebrow">ROOM {room}</div><h1>{phase === 'finished' ? <>Round <em>complete</em></> : <>Race <em>in progress</em></>}</h1></div><div className="race-tools"><span className="timer">⏱ {String(Math.floor((phase === 'finished' ? 0 : 120-timer)/60)).padStart(2,'0')}:{String((phase === 'finished' ? 0 : 120-timer)%60).padStart(2,'0')}</span><button className="secondary" onClick={restart}>↻ {phase === 'finished' ? 'Race again' : 'New round'}</button></div></div>
        {phase === 'racing' ? <><div className="track-wrap"><div id="game-stage"/><div className="track-caption"><span>WASD / arrows · Space nitro · Shift jump</span><span className="live"><i/> LIVE</span></div></div>
          <div className="hud-list">{hud.filter(p => p.id !== 'keyboard').map((p,i) => <div className="hud-item" key={p.id}><i style={{background:`#${COLORS[i%COLORS.length].toString(16)}`}}/><div className="hud-name"><b>{p.name}</b><small>{p.connected ? 'ONLINE' : 'OFFLINE'} · {p.latency ?? '—'} ms</small></div><div className="meter"><span style={{width:`${p.nitro}%`}}/></div><strong>{p.score} pts</strong></div>)}</div>
        </> : <div className="finish-panel"><div className="eyebrow">CHECKERED FLAG</div><h2>That’s the round.</h2>{[...hud].sort((a,b) => b.score-a.score).map((p,i) => <div className="finish-player" key={p.id}><b>#{i+1}　{p.name}</b><span>{p.score} pts</span></div>)}</div>}
      </section>}
      {error && <div role="status" className="toast" onClick={() => setError('')}>{error}<button aria-label="Dismiss">×</button></div>}
      <footer><span>TILT<span className="accent">RACE</span> <small>LOCAL ARCADE, BIG ENERGY.</small></span><span>ONE LAP AT A TIME</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App/>);

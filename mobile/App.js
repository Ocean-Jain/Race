import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Pressable, Switch, StyleSheet, StatusBar, ScrollView, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import { CameraView, useCameraPermissions } from 'expo-camera';

const COLOR = '#4be0c4';
const INPUT_RATE_MS = 33; // 30 Hz stays below the relay's 50 Hz input limit.
const PING_RATE_MS = 2000;

function parseLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'tiltrace:') return { room: url.searchParams.get('room') || '', server: (url.searchParams.get('server') || '').replace(/^http/, 'ws') };
  } catch {}
  return null;
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [server, setServer] = useState('ws://192.168.1.10:3001');
  const [room, setRoom] = useState(''), [name, setName] = useState('Racer'), [status, setStatus] = useState('disconnected');
  const [latency, setLatency] = useState(null), [joined, setJoined] = useState(false), [playerName, setPlayerName] = useState('Racer');
  const [ready, setReady] = useState(false), [nitro, setNitro] = useState(100), [sensitivity, setSensitivity] = useState(1);
  const [readyPending, setReadyPending] = useState(false), [steerTrackWidth, setSteerTrackWidth] = useState(0);
  const [smoothness, setSmoothness] = useState(0.2), [threshold, setThreshold] = useState(2.8), [vibrate, setVibrate] = useState(true);
  const [camera, setCamera] = useState(false), [permission, requestPermission] = useCameraPermissions(), [error, setError] = useState('');
  const [displaySteer, setDisplaySteer] = useState(0), [sensorOk, setSensorOk] = useState(true);

  const ws = useRef(null), retryCount = useRef(0), closedByUser = useRef(false), playerId = useRef('');
  const timers = useRef({ input: null, ping: null, retry: null });
  const steer = useRef(0), gyroAngle = useRef(0);
  const gyro = useRef({ x: 0, y: 0, z: 0 }), smooth = useRef(0), shakeAt = useRef(0);
  const controls = useRef({ throttle: 0, brake: false, nitro: false }), latencyMap = useRef(new Map());

  function clearNetworkTimers() {
    clearInterval(timers.current.input); clearInterval(timers.current.ping); clearTimeout(timers.current.retry);
    timers.current.input = null; timers.current.ping = null; timers.current.retry = null;
  }

  function send(message) {
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 4096) socket.send(JSON.stringify(message));
  }

  function sendInput(extra = {}) {
    send({ type: 'input', input: {
      steer: steer.current, throttle: controls.current.throttle, brake: controls.current.brake,
      nitro: controls.current.nitro, gyro: gyro.current, ...extra,
    } });
  }

  useEffect(() => {
    ScreenOrientation.lockAsync(joined ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
  }, [joined]);

  useEffect(() => {
    AsyncStorage.multiGet(['room', 'playerId', 'server', 'name']).then(rows => {
      const saved = Object.fromEntries(rows);
      if (saved.room) setRoom(saved.room);
      if (saved.playerId) playerId.current = saved.playerId;
      if (saved.server) setServer(saved.server);
      if (saved.name) setName(saved.name);
    });
    Accelerometer.setUpdateInterval(25);
    Gyroscope.setUpdateInterval(25);
    Accelerometer.isAvailableAsync().then(available => {
      setSensorOk(available);
      if (!available) setError('This phone has no available accelerometer. You can still use the on-screen controls.');
    }).catch(() => setSensorOk(false));
    const acceleration = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude > threshold && Date.now() - shakeAt.current > 1400) {
        shakeAt.current = Date.now(); sendInput({ jump: true });
        if (vibrate) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    });
    const rotation = Gyroscope.addListener(({ x, y, z }) => {
      gyro.current = { x, y, z };
      // Integrate roll around the screen normal to emulate a steering wheel.
      // A small dead zone prevents sensor bias from slowly steering the car.
      const rate = Math.abs(z) > 0.035 ? z : 0;
      gyroAngle.current = Math.max(-0.72, Math.min(0.72, gyroAngle.current + rate * 0.025));
      const target = Math.max(-1, Math.min(1, gyroAngle.current / 0.72 * sensitivity));
      smooth.current += (target - smooth.current) * (1 - smoothness);
      steer.current = smooth.current;
    });
    const display = setInterval(() => setDisplaySteer(steer.current), 50);
    return () => { acceleration.remove(); rotation.remove(); clearInterval(display); };
  }, [sensitivity, smoothness, threshold, vibrate]);

  useEffect(() => () => {
    closedByUser.current = true; clearNetworkTimers(); ws.current?.close();
  }, []);

  function connect(resume = true) {
    closedByUser.current = false;
    const address = server.trim().replace(/^http/, 'ws').replace(/\/$/, '');
    if (!/^wss?:\/\//.test(address)) { setError('Server must start with ws:// or wss://'); return; }
    setStatus(retryCount.current ? 'reconnecting' : 'connecting');
    try {
      const socket = new WebSocket(address); ws.current = socket;
      socket.onopen = () => {
        retryCount.current = 0; setStatus('connected'); setError('');
        socket.send(JSON.stringify({ type: 'join', room: room.toUpperCase(), name, playerId: resume ? playerId.current || undefined : undefined }));
        clearNetworkTimers();
        timers.current.input = setInterval(() => sendInput(), INPUT_RATE_MS);
        timers.current.ping = setInterval(() => {
          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          latencyMap.current.set(id, Date.now()); socket.send(JSON.stringify({ type: 'ping', id, sentAt: Date.now() }));
        }, PING_RATE_MS);
      };
      socket.onmessage = event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'joined') {
          setJoined(true); playerId.current = message.playerId; setPlayerName(message.name);
          setReadyPending(false);
          setReady(message.state?.players?.find(p => p.id === message.playerId)?.ready || false);
          AsyncStorage.multiSet([['room', room.toUpperCase()], ['playerId', message.playerId], ['server', address], ['name', name]]);
        }
        if (message.type === 'pong') {
          const sent = latencyMap.current.get(message.id);
          if (sent) { setLatency(Date.now() - sent); latencyMap.current.delete(message.id); }
        }
        if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong', id: message.id, sentAt: message.sentAt }));
        if (message.type === 'nitro' || message.type === 'recharge') {
          setNitro(message.nitro);
          if (message.type === 'recharge' && vibrate) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        if (message.type === 'room') {
          const player = message.state.players.find(item => item.id === playerId.current);
          if (player) { setReady(player.ready); setReadyPending(false); setNitro(player.nitro); if (player.latency !== null) setLatency(player.latency); }
        }
        if (message.type === 'error') {
          setError(message.message); setReadyPending(false);
          if (message.message.includes('Room not found') || message.message.includes('Session expired')) {
            setJoined(false); playerId.current = ''; AsyncStorage.removeItem('playerId');
          }
        }
      };
      socket.onerror = () => setError('Connection failed. Check the server address and your internet connection.');
      socket.onclose = () => {
        clearNetworkTimers(); setStatus('disconnected'); setReadyPending(false);
        if (!closedByUser.current) {
          setStatus('reconnecting');
          const delay = Math.min(10000, 600 * 2 ** retryCount.current++);
          timers.current.retry = setTimeout(() => connect(true), delay);
        }
      };
    } catch (exception) { setStatus('disconnected'); setError(exception.message); }
  }

  function join() {
    AsyncStorage.multiSet([['room', room.toUpperCase()], ['server', server], ['name', name]]);
    retryCount.current = 0; connect(false);
  }

  function disconnect() {
    closedByUser.current = true; clearNetworkTimers(); ws.current?.close(); setJoined(false); setStatus('disconnected');
    controls.current = { throttle: 0, brake: false, nitro: false };
    setReadyPending(false);
  }

  function calibrate() {
    gyroAngle.current = 0; smooth.current = 0; steer.current = 0; setDisplaySteer(0);
    if (vibrate) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setError('Calibrated. Hold the phone in your preferred neutral position.');
  }

  function toggleReady() {
    if (!joined || ws.current?.readyState !== WebSocket.OPEN || readyPending) return;
    const next = !ready; setReady(next); send({ type: 'ready', ready: next });
    setReadyPending(true);
    if (vibrate) Haptics.selectionAsync();
  }

  function setThrottle(value) { controls.current.throttle = value; sendInput(); }
  function setBrake(value) { controls.current.brake = value; sendInput(); }
  function startNitro() {
    if (nitro <= 0 || controls.current.nitro) return;
    controls.current.nitro = true; sendInput();
    if (vibrate) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
  function stopNitro() { controls.current.nitro = false; sendInput(); }

  async function scan() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { setError('Camera access is needed to scan. Enter the room code instead.'); return; }
    }
    setCamera(true);
  }
  function qrRead(event) {
    const parsed = parseLink(event.data);
    if (parsed) { setRoom(parsed.room); setServer(parsed.server); setCamera(false); setError('QR code loaded. Tap Join room to connect.'); }
    else setError('That QR code is not a TiltRace room.');
  }

  if (camera) return <View style={s.camera}><CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={qrRead}/><Pressable style={s.cancel} onPress={() => setCamera(false)}><Text style={s.btnText}>Cancel scan</Text></Pressable></View>;

  const brand = <View style={[s.brandrow, landscape && joined && s.compactBrand]}><View style={s.logo}><Text style={s.logot}>T</Text></View><Text style={s.brand}>TILT<Text style={{ color: COLOR }}>RACE</Text></Text>{!(landscape && joined) && <View style={s.status}><View style={[s.dot,{ backgroundColor: status === 'connected' ? COLOR : status === 'reconnecting' ? '#f2b84b' : '#eb665f' }]}/><Text style={s.statusText}>{status.toUpperCase()}</Text></View>}</View>;
  const notice = error !== '' && <Pressable style={s.notice} onPress={() => setError('')}><Text style={s.noticeText}>{error}　×</Text></Pressable>;
  const steerTravel = Math.max(0, (steerTrackWidth - 45) / 2);
  const tiltWheel = <View onLayout={event => setSteerTrackWidth(event.nativeEvent.layout.width)} style={[s.steerWheel, landscape && s.steerWheelLarge]}><View style={s.wheelRing}/><View pointerEvents="none" style={[s.steerDot, { transform: [{ translateX: displaySteer * steerTravel }] }]}/><Text style={s.steerLeft}>←</Text><Text style={s.steerRight}>→</Text></View>;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="light-content" hidden={landscape && joined}/>
    {!joined ? <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      {brand}<Text style={s.kicker}>MOTION CONTROLLER</Text><Text style={s.title}>YOUR PHONE.<Text style={{ color: COLOR }}> YOUR WHEEL.</Text></Text>
      <Text style={s.sub}>Join a race and steer by tilting your phone.</Text>
      <View style={s.card}><Text style={s.label}>GAME SERVER ADDRESS</Text><TextInput style={s.input} autoCapitalize="none" value={server} onChangeText={setServer} placeholder="wss://your-game-host.example" placeholderTextColor="#647584"/><Text style={s.hint}>Scan the game QR to fill in the server and room.</Text>
        <Text style={[s.label,{ marginTop: 19 }]}>ROOM CODE</Text><View style={s.joinrow}><TextInput style={[s.input,s.roomInput]} value={room} onChangeText={value => setRoom(value.toUpperCase().slice(0,8))} placeholder="A1B2C3D4" placeholderTextColor="#647584" autoCapitalize="characters" maxLength={8}/><Pressable style={s.scanBtn} onPress={scan}><Text style={s.scanText}>▣ Scan QR</Text></Pressable></View>
        <Text style={[s.label,{ marginTop: 19 }]}>RACER NAME</Text><TextInput style={s.input} value={name} onChangeText={setName} maxLength={18} placeholder="Racer" placeholderTextColor="#647584"/><Pressable style={[s.mainBtn,(!room || !server) && { opacity: 0.45 }]} onPress={join} disabled={!room || !server}><Text style={s.mainText}>JOIN ROOM　→</Text></Pressable>
      </View><View style={s.help}><Text style={s.helpTitle}>PORTRAIT JOIN · LANDSCAPE RACE</Text><Text style={s.helpText}>Scan and connect in portrait. The controller rotates to landscape after joining; calibrate, then rotate the phone like a steering wheel.</Text></View>{notice}
    </ScrollView> : landscape ? <View style={s.landscape}>
      <View style={s.landTop}>{brand}<View style={s.landRoom}><Text style={s.kicker}>ROOM {room}</Text><Text style={s.landPlayer}>{playerName}</Text></View><View style={s.landLatency}><Text style={s.latencyN}>{latency === null ? '—' : latency}</Text><Text style={s.latencyL}>MS PING</Text></View><Pressable onPress={disconnect} style={s.leave}><Text style={s.disconnectText}>LEAVE</Text></Pressable></View>
      <View style={s.controller}>
        <View style={s.leftGrip}><Text style={s.padLabel}>TILT TO STEER</Text>{tiltWheel}<Pressable style={s.calib} onPress={calibrate}><Text style={s.calibText}>⊙　CALIBRATE</Text></Pressable></View>
        <View style={s.centerGrip}><View style={s.statusbar}><Text style={s.statusbarText}>● {status === 'connected' ? 'CONNECTED' : 'RECONNECTING'}</Text><Text style={s.statusbarText}>NITRO {Math.round(nitro)}%</Text></View>
          <View style={s.pedalRow}><Pressable onPressIn={() => setThrottle(1)} onPressOut={() => setThrottle(0)} style={[s.pedal,s.gasPad]}><Text style={s.pedalIcon}>↑</Text><Text style={s.padTitle}>ACCELERATE</Text><Text style={s.padSmall}>HOLD</Text></Pressable><Pressable onPressIn={() => setBrake(true)} onPressOut={() => setBrake(false)} style={[s.pedal,s.brakePad]}><Text style={s.pedalIcon}>↓</Text><Text style={s.padTitle}>BRAKE</Text><Text style={s.padSmall}>HOLD</Text></Pressable></View>
          <View style={s.landTools}><View style={s.miniSetting}><Text style={s.settingTitle}>SENSITIVITY</Text><Pressable onPress={() => setSensitivity(value => Math.max(.5, +(value - .1).toFixed(1)))}><Text style={s.tune}>−</Text></Pressable><Text style={s.tuneValue}>{sensitivity.toFixed(1)}×</Text><Pressable onPress={() => setSensitivity(value => Math.min(2, +(value + .1).toFixed(1)))}><Text style={s.tune}>+</Text></Pressable></View><View style={s.hapticToggle}><Text style={s.settingTitle}>HAPTICS</Text><Switch value={vibrate} onValueChange={setVibrate} trackColor={{ true: '#278c79', false: '#34434e' }} thumbColor={vibrate ? COLOR : '#a9b2b7'}/></View><Pressable disabled={readyPending} style={[s.readyBtn,s.landReadyBtn,readyPending && { opacity: 0.65 }]} onPress={toggleReady}><Text style={s.readyText}>{readyPending ? 'SENDING…' : ready ? '✓ READY' : 'READY TO RACE →'}</Text></Pressable></View>
        </View>
        <View style={s.rightGrip}><Text style={s.padLabel}>BOOST</Text><Pressable onPressIn={startNitro} onPressOut={stopNitro} style={[s.nitroTrigger,nitro <= 0 && { opacity: 0.45 }]}><Text style={s.nitroIcon}>ϟ</Text><Text style={s.nitroText}>NITRO</Text><Text style={s.padSmall}>HOLD TO BOOST</Text></Pressable><View style={s.shakeBadge}><Text style={s.shakeIcon}>↯</Text><Text style={s.settingSub}>SHAKE TO JUMP</Text></View></View>
      </View>{notice}
    </View> : <ScrollView contentContainerStyle={s.wrap}>
      {brand}<View style={s.racebar}><View><Text style={s.kicker}>ROOM {room}</Text><Text style={s.raceName}>{playerName}</Text></View><View style={s.latency}><Text style={s.latencyN}>{latency === null ? '—' : latency}</Text><Text style={s.latencyL}>MS PING</Text></View></View>
      <View style={s.statusbar}><Text style={s.statusbarText}>● {status === 'connected' ? 'CONNECTED' : 'RECONNECTING'}　·　{ready ? 'READY' : 'NOT READY'}</Text><Text style={s.statusbarText}>NITRO {Math.round(nitro)}%</Text></View>
      <View style={s.controls}><Text style={s.controlHint}>TILT TO STEER</Text>{tiltWheel}<Pressable style={s.calib} onPress={calibrate}><Text style={s.calibText}>⊙　CALIBRATE NEUTRAL</Text></Pressable><View style={s.pads}><Pressable style={[s.pad,s.boostPad,nitro <= 0 && { opacity: .4 }]} onPressIn={startNitro} onPressOut={stopNitro}><Text style={s.padIcon}>ϟ</Text><Text style={s.padTitle}>NITRO</Text><Text style={s.padSmall}>HOLD TO BOOST</Text></Pressable><View style={s.rightPads}><Pressable onPressIn={() => setThrottle(1)} onPressOut={() => setThrottle(0)} style={[s.pad,s.gasPad]}><Text style={s.padIcon}>↑</Text><Text style={s.padTitle}>ACCELERATE</Text></Pressable><Pressable onPressIn={() => setBrake(true)} onPressOut={() => setBrake(false)} style={[s.pad,s.brakePad]}><Text style={s.padTitle}>BRAKE</Text></Pressable></View></View></View>
      <View style={s.settings}><View style={s.settingRow}><View><Text style={s.settingTitle}>Vibration feedback</Text><Text style={s.settingSub}>Boost, recharge and calibration</Text></View><Switch value={vibrate} onValueChange={setVibrate} trackColor={{ true: '#278c79', false: '#34434e' }} thumbColor={vibrate ? COLOR : '#a9b2b7'}/></View>
        <View style={s.tuneRow}><Text style={s.settingTitle}>STEERING SENSITIVITY</Text><View style={s.tuneButtons}><Pressable onPress={() => setSensitivity(value => Math.max(.5, +(value - .1).toFixed(1)))}><Text style={s.tune}>−</Text></Pressable><Text style={s.tuneValue}>{sensitivity.toFixed(1)}×</Text><Pressable onPress={() => setSensitivity(value => Math.min(2, +(value + .1).toFixed(1)))}><Text style={s.tune}>+</Text></Pressable></View></View>
        <View style={s.tuneRow}><Text style={s.settingTitle}>SHAKE THRESHOLD</Text><View style={s.tuneButtons}><Pressable onPress={() => setThreshold(value => Math.max(1.5, +(value - .2).toFixed(1)))}><Text style={s.tune}>−</Text></Pressable><Text style={s.tuneValue}>{threshold.toFixed(1)} g</Text><Pressable onPress={() => setThreshold(value => Math.min(5, +(value + .2).toFixed(1)))}><Text style={s.tune}>+</Text></Pressable></View></View>
      </View><Pressable style={s.readyBtn} onPress={toggleReady}><Text style={s.readyText}>{ready ? '✓　READY — TAP TO UNREADY' : 'READY TO RACE　→'}</Text></Pressable><Pressable onPress={disconnect} style={s.disconnect}><Text style={s.disconnectText}>Leave room</Text></Pressable>{notice}
    </ScrollView>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe:{ flex:1, backgroundColor:'#09121c' }, wrap:{ paddingHorizontal:22, paddingTop:12, paddingBottom:26, minHeight:'100%' },
  brandrow:{ height:50, flexDirection:'row', alignItems:'center', gap:9, marginBottom:24 }, compactBrand:{ height:36, marginBottom:0, flexShrink:1 }, logo:{ width:29, height:29, borderRadius:8, backgroundColor:COLOR, alignItems:'center', justifyContent:'center' }, logot:{ fontSize:20, fontWeight:'900', color:'#08151d' }, brand:{ fontWeight:'900', fontSize:16, letterSpacing:1, color:'#f3f7f9' }, status:{ marginLeft:'auto', flexDirection:'row', alignItems:'center', gap:6 }, dot:{ width:7, height:7, borderRadius:9 }, statusText:{ fontSize:9, letterSpacing:1, color:'#91a0aa' }, kicker:{ fontSize:10, color:COLOR, letterSpacing:2, fontWeight:'700' },
  title:{ fontSize:31, lineHeight:35, fontWeight:'900', color:'#f0f5f8', marginTop:10 }, sub:{ fontSize:13, color:'#93a2ad', lineHeight:20, marginTop:10, marginBottom:22 }, card:{ padding:18, backgroundColor:'#111f2b', borderWidth:1, borderColor:'#ffffff16', borderRadius:11 }, label:{ fontSize:9, color:'#83939f', letterSpacing:1.4, fontWeight:'700', marginBottom:8 }, input:{ height:46, borderRadius:6, borderWidth:1, borderColor:'#2a3a47', backgroundColor:'#0b1721', paddingHorizontal:12, color:'#eff6f8', fontSize:13 }, hint:{ fontSize:10, color:'#748591', marginTop:6 }, joinrow:{ flexDirection:'row', gap:8 }, roomInput:{ flex:1, fontFamily:'monospace', fontWeight:'700', letterSpacing:3 }, scanBtn:{ paddingHorizontal:12, justifyContent:'center', borderRadius:6, backgroundColor:'#1b3040' }, scanText:{ fontSize:11, color:COLOR, fontWeight:'700' }, mainBtn:{ height:49, marginTop:22, borderRadius:7, backgroundColor:COLOR, alignItems:'center', justifyContent:'center' }, mainText:{ color:'#06151b', fontWeight:'900', fontSize:13, letterSpacing:1 },
  help:{ padding:17, marginTop:13, borderRadius:9, backgroundColor:'#0e1b26' }, helpTitle:{ fontSize:9, letterSpacing:1.2, color:COLOR, fontWeight:'700' }, helpText:{ fontSize:11, color:'#8e9da8', lineHeight:17, marginTop:7 }, racebar:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:17 }, raceName:{ fontSize:27, fontWeight:'900', color:'#eef5f7', marginTop:4 }, latency:{ alignItems:'center', paddingHorizontal:13, paddingVertical:8, borderRadius:7, backgroundColor:'#11222d' }, latencyN:{ fontSize:20, color:COLOR, fontFamily:'monospace', fontWeight:'700' }, latencyL:{ fontSize:8, color:'#81919c', letterSpacing:1 }, statusbar:{ height:34, flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:10, borderRadius:6, backgroundColor:'#10242e', marginBottom:12 }, statusbarText:{ fontSize:9, color:'#9eafb8', fontFamily:'monospace' },
  controls:{ padding:15, borderRadius:11, borderWidth:1, borderColor:'#ffffff17', backgroundColor:'#111f2b' }, controlHint:{ fontSize:10, color:'#81929e', letterSpacing:1.5, textAlign:'center', fontWeight:'700' }, steerWheel:{ height:64, marginTop:12, borderRadius:40, backgroundColor:'#0a1721', borderWidth:1, borderColor:'#263943', flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:17, position:'relative' }, steerWheelLarge:{ width:190, height:150, alignSelf:'center', borderRadius:80, justifyContent:'space-between', paddingHorizontal:23 }, wheelRing:{ position:'absolute', width:80, height:80, borderWidth:5, borderColor:'#2c4854', borderRadius:50, alignSelf:'center' }, steerLeft:{ fontSize:23, color:'#738894' }, steerRight:{ fontSize:23, color:'#738894' }, steerDot:{ position:'absolute', left:'50%', width:25, height:25, marginLeft:-12, borderRadius:20, backgroundColor:COLOR, shadowColor:COLOR, shadowOpacity:.5, shadowRadius:8, zIndex:2 },
  calib:{ alignSelf:'center', marginVertical:10, paddingVertical:8, paddingHorizontal:13, borderRadius:20, backgroundColor:'#1a2d39' }, calibText:{ color:'#b6c5cc', fontSize:9, fontWeight:'700', letterSpacing:.5 }, pads:{ flexDirection:'row', gap:10 }, pad:{ borderRadius:9, alignItems:'center', justifyContent:'center', minHeight:91 }, boostPad:{ flex:1, backgroundColor:'#513124', borderWidth:1, borderColor:'#e38845' }, padIcon:{ fontSize:25, color:'#ffd079', fontWeight:'900' }, padTitle:{ fontSize:11, color:'#fff1d4', fontWeight:'900', letterSpacing:.6, marginTop:3 }, padSmall:{ fontSize:8, color:'#d8a979', marginTop:3 }, rightPads:{ flex:1.35, gap:8 }, gasPad:{ flex:1, backgroundColor:'#153d3b', borderWidth:1, borderColor:'#248c80', minHeight:57 }, brakePad:{ minHeight:32, backgroundColor:'#26333d' },
  settings:{ marginTop:12, paddingHorizontal:14, paddingVertical:5, borderRadius:9, backgroundColor:'#101d28' }, settingRow:{ minHeight:56, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderBottomColor:'#ffffff12' }, settingTitle:{ fontSize:11, color:'#d7e0e5', fontWeight:'700' }, settingSub:{ fontSize:9, color:'#81919b', marginTop:3 }, tuneRow:{ minHeight:47, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderBottomColor:'#ffffff0d' }, tuneButtons:{ flexDirection:'row', alignItems:'center', gap:15 }, tune:{ fontSize:21, color:COLOR, width:24, textAlign:'center' }, tuneValue:{ fontSize:11, color:'#d7e0e5', fontFamily:'monospace', minWidth:38, textAlign:'center' }, readyBtn:{ height:48, marginTop:12, borderRadius:7, backgroundColor:COLOR, alignItems:'center', justifyContent:'center' }, readyText:{ fontSize:12, fontWeight:'900', color:'#06151b', letterSpacing:.6 }, disconnect:{ alignSelf:'center', padding:11 }, disconnectText:{ fontSize:10, color:'#84949f' }, notice:{ marginTop:8, padding:10, borderRadius:6, backgroundColor:'#422b26' }, noticeText:{ color:'#ffd7be', fontSize:11, lineHeight:17 }, camera:{ flex:1, backgroundColor:'#000' }, cancel:{ position:'absolute', bottom:30, alignSelf:'center', padding:14, borderRadius:7, backgroundColor:'#111f2b' }, btnText:{ color:'#fff' },
  landscape:{ flex:1, paddingHorizontal:16, paddingVertical:6 }, landTop:{ height:44, flexDirection:'row', alignItems:'center', gap:16 }, landTopBrand:{ flex:1 }, landRoom:{ minWidth:112 }, landPlayer:{ color:'#eff7f8', fontSize:15, fontWeight:'800', marginTop:2 }, landLatency:{ alignItems:'center', minWidth:55 }, leave:{ padding:10, backgroundColor:'#152632', borderRadius:7 }, controller:{ flex:1, flexDirection:'row', alignItems:'stretch', gap:12, paddingVertical:4 }, leftGrip:{ width:'25%', minWidth:175, borderRadius:19, backgroundColor:'#111f2b', borderWidth:1, borderColor:'#ffffff15', alignItems:'center', justifyContent:'center', padding:10 }, padLabel:{ color:'#81929e', fontSize:9, letterSpacing:1.6, fontWeight:'800', marginBottom:5 }, centerGrip:{ flex:1, minWidth:230, justifyContent:'center', paddingHorizontal:8 }, rightGrip:{ width:'17%', minWidth:120, borderRadius:19, backgroundColor:'#111f2b', borderWidth:1, borderColor:'#ffffff15', alignItems:'center', justifyContent:'center', padding:10 }, pedalRow:{ flex:1, flexDirection:'row', gap:10 }, pedal:{ flex:1, borderRadius:17, alignItems:'center', justifyContent:'center', borderWidth:1 }, pedalIcon:{ color:'#effbf9', fontSize:30, fontWeight:'900' }, landTools:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8, paddingTop:8 }, landReadyBtn:{ flex:1, minWidth:100, height:42, marginTop:0, paddingHorizontal:4 }, miniSetting:{ flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:8, paddingVertical:5, borderRadius:8, backgroundColor:'#101d28', flexShrink:1 }, hapticToggle:{ flexDirection:'row', alignItems:'center', gap:5, flexShrink:1 }, nitroTrigger:{ width:'100%', flex:1, marginTop:4, borderRadius:18, backgroundColor:'#513124', borderWidth:1, borderColor:'#e38845', alignItems:'center', justifyContent:'center' }, nitroIcon:{ fontSize:40, color:'#ffd079', fontWeight:'900' }, nitroText:{ fontSize:14, color:'#fff1d4', fontWeight:'900', letterSpacing:1 }, shakeBadge:{ alignItems:'center', paddingTop:9 }, shakeIcon:{ color:COLOR, fontSize:20 },
});

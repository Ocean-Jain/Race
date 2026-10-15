import * as THREE from 'three';
import { TRACKS, sampleTrack } from '../../shared/tracks.js';

const COLORS = [0x38d9ff, 0xff6c5c, 0xc084fc, 0xffcb45, 0x72e394, 0xff78bd, 0x8ba5ff, 0xff925c];
const CENTER = 600;
const ROAD_HALF_WIDTH = 58;
const TRACK_START_T = -Math.PI / 2;
const CHECKPOINT_PROGRESS = Math.PI;
const BRIDGE_HEIGHT = 12;
const BRIDGE_RAMP_SPAN = 0.3;
const MAX_STEER_ANGLE = 0.46;
const EFFECTIVE_WHEELBASE = 34;
const TWO_PI = Math.PI * 2;
const wrappedAngleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
let activeTrackId = 'infinity';

export function viewColumns(count) {
  if (count <= 3) return Math.max(1, count);
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function trackPoint(t) {
  return sampleTrack(activeTrackId, t);
}

function trackHeight(t) {
  const track = TRACKS.find(item => item.id === activeTrackId);
  if (!track?.bridge) return 0;
  const distance = Math.abs(wrappedAngleDelta(track.bridgeAt ?? 0, t));
  if (distance >= BRIDGE_RAMP_SPAN) return 0;
  const ramp = 1 - distance / BRIDGE_RAMP_SPAN;
  return BRIDGE_HEIGHT * ramp * ramp * (3 - 2 * ramp);
}

function trackFrame(t) {
  const point = trackPoint(t);
  const before = trackPoint(t - 0.001), after = trackPoint(t + 0.001);
  const dx = after.x - before.x, dz = after.z - before.z;
  const length = Math.hypot(dx, dz) || 1;
  const tangent = { x: dx / length, z: dz / length };
  return { point, height: trackHeight(t), tangent, normal: { x: -tangent.z, z: tangent.x } };
}

function pointOnTrack(t, offset = 0) {
  const frame = trackFrame(t);
  return { x: frame.point.x + frame.normal.x * offset, y: frame.height, z: frame.point.z + frame.normal.z * offset };
}

function projectTrack(x, z, nearT) {
  let bestT = nearT, bestDistance = Infinity;
  const span = 0.32, divisions = 32;
  for (let i = 0; i <= divisions; i++) {
    const t = nearT - span + (2 * span * i / divisions);
    const point = trackPoint(t), distance = (x - point.x) ** 2 + (z - point.z) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestT = t; }
  }
  let step = span / divisions;
  for (let i = 0; i < 7; i++) {
    step *= 0.5;
    for (const t of [bestT - step, bestT + step]) {
      const point = trackPoint(t), distance = (x - point.x) ** 2 + (z - point.z) ** 2;
      if (distance < bestDistance) { bestDistance = distance; bestT = t; }
    }
  }
  const frame = trackFrame(bestT);
  const lateral = (x - frame.point.x) * frame.normal.x + (z - frame.point.z) * frame.normal.z;
  return { ...frame, t: bestT, lateral, distance: Math.sqrt(bestDistance) };
}

function makeNoiseTexture(base, speckle, count, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  let seed = 41;
  for (let i = 0; i < count; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % 256;
    seed = (seed * 16807) % 2147483647;
    const y = seed % 256;
    const alpha = 0.04 + (seed % 18) / 100;
    ctx.fillStyle = `${speckle}${alpha})`;
    ctx.fillRect(x, y, 1 + (seed % 3), 1 + (seed % 3));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function liveryTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath(); ctx.moveTo(73, 0); ctx.lineTo(183, 0); ctx.lineTo(157, 512); ctx.lineTo(99, 512); ctx.fill();
  ctx.fillStyle = '#e7f6ff'; ctx.fillRect(91, 0, 13, 512); ctx.fillRect(151, 0, 13, 512);
  ctx.fillStyle = '#08121a'; ctx.fillRect(0, 198, 256, 115);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 82px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('T', 128, 253);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function carMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: options.metalness ?? 0.35, roughness: options.roughness ?? 0.42, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissive ? 0.5 : 0 });
}

export class Race3D {
  constructor(container, trackId = 'infinity') {
    activeTrackId = TRACKS.some(track => track.id === trackId) ? trackId : 'infinity';
    this.trackId = activeTrackId;
    this.container = container;
    this.cars = new Map();
    this.pickups = [];
    this.remote = new Map();
    this.keys = {};
    this.lastSend = 0;
    this.lastHud = 0;
    this.elapsed = 0;
    this.disposed = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#91a8b4');
    this.scene.fog = new THREE.Fog('#91a8b4', 520, 1150);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1600);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer.setClearColor('#91a8b4');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setScissorTest(true);
    this.renderer.domElement.className = 'race3d-canvas';
    container.appendChild(this.renderer.domElement);
    this.buildWorld();
    this.onKeyDown = e => { this.keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); };
    this.onKeyUp = e => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.lastFrame = performance.now();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
  }

  buildWorld() {
    const sky = new THREE.HemisphereLight(0xe6f6ff, 0x34462d, 2.15);
    this.scene.add(sky);
    const sun = new THREE.DirectionalLight(0xffefd5, 3.2);
    sun.position.set(-180, 320, -100); this.scene.add(sun);

    const grass = makeNoiseTexture('#54794b', 'rgba(202,235,132,', 2600, 16);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.35; this.scene.add(ground);

    const asphalt = makeNoiseTexture('#303740', 'rgba(205,218,226,', 1800, 26);
    this.buildCircuitTrack(asphalt);
    this.addTrackStripe(TRACK_START_T, false);
    this.addTrackStripe(TRACK_START_T + Math.PI, true);
    this.addPickups();
    this.addGrandstands();
  }

  buildCircuitTrack(asphalt) {
    const segments = 320;
    const positions = [], uvs = [], normals = [], indices = [];
    const edgePoints = [-1, 1].map(() => []);
    for (let i = 0; i <= segments; i++) {
      const t = TWO_PI * i / segments, frame = trackFrame(t);
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const x = frame.point.x + frame.normal.x * ROAD_HALF_WIDTH * sign;
        const z = frame.point.z + frame.normal.z * ROAD_HALF_WIDTH * sign;
        positions.push(x, frame.height + 0.015, z); normals.push(0, 1, 0); uvs.push(i / segments * 28, side);
        if (i < segments) edgePoints[side].push(new THREE.Vector3(x, frame.height + 0.08, z));
      }
      if (i < segments) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeometry.setIndex(indices);
    const road = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0.04, side: THREE.DoubleSide }));
    this.scene.add(road);

    const curbMat = new THREE.MeshStandardMaterial({ color: 0xe8ecec, roughness: 0.72 });
    for (const points of edgePoints) {
      const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
      const curb = new THREE.Mesh(new THREE.TubeGeometry(curve, 640, 1.2, 8, true), curbMat);
      this.scene.add(curb);
    }

    const paint = new THREE.MeshStandardMaterial({ color: 0xe2e8df, roughness: 0.65 });
    const dashCount = 112;
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(11, 0.12, 0.85), paint, dashCount);
    const barrierMaterials = [new THREE.MeshStandardMaterial({ color: 0xd84d49, roughness: 0.72 }), curbMat];
    const barrierMeshes = [-1, 1].map(() => barrierMaterials.map(material => new THREE.InstancedMesh(new THREE.BoxGeometry(10, 2.4, 2.7), material, dashCount / 2)));
    const transform = new THREE.Object3D();
    for (let i = 0; i < dashCount; i++) {
      const t = TWO_PI * i / dashCount, frame = trackFrame(t);
      const yaw = Math.atan2(-frame.tangent.z, frame.tangent.x);
      transform.position.set(frame.point.x, frame.height + 0.1, frame.point.z); transform.rotation.set(0, yaw, 0); transform.updateMatrix(); dashes.setMatrixAt(i, transform.matrix);
      for (const [sideIndex, side] of [-1, 1].entries()) {
        const mesh = barrierMeshes[sideIndex][i % 2];
        transform.position.set(frame.point.x + frame.normal.x * (ROAD_HALF_WIDTH + 3) * side, frame.height + 1.1, frame.point.z + frame.normal.z * (ROAD_HALF_WIDTH + 3) * side);
        transform.updateMatrix(); mesh.setMatrixAt(Math.floor(i / 2), transform.matrix);
      }
    }
    this.scene.add(dashes, ...barrierMeshes.flat());

    if (TRACKS.find(track => track.id === this.trackId)?.bridge) {
      // The Infinity Circuit crossing rises above its return line, with
      // approach ramps and supports outside the lower branch.
      const bridgeAt = TRACKS.find(track => track.id === this.trackId)?.bridgeAt ?? 0;
      const bridgeConcrete = new THREE.MeshStandardMaterial({ color: 0x77848a, roughness: 0.78 });
      for (const t of [bridgeAt - 0.18, bridgeAt, bridgeAt + 0.18]) {
        const frame = trackFrame(t);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 8, 1.1, 8), bridgeConcrete);
        beam.position.set(frame.point.x, Math.max(1, frame.height - 0.6), frame.point.z);
        beam.rotation.y = Math.atan2(-frame.normal.z, frame.normal.x); this.scene.add(beam);
        if (Math.abs(t) > 0.01) for (const side of [-1, 1]) {
          const height = Math.max(2, frame.height - 1.15);
          const pier = new THREE.Mesh(new THREE.BoxGeometry(7, height, 7), bridgeConcrete);
          pier.position.set(frame.point.x + frame.normal.x * (ROAD_HALF_WIDTH + 7) * side, height / 2, frame.point.z + frame.normal.z * (ROAD_HALF_WIDTH + 7) * side);
          this.scene.add(pier);
        }
      }
    }
  }

  addTrackStripe(t, checkpoint) {
    const frame = trackFrame(t);
    const dark = new THREE.MeshStandardMaterial({ color: checkpoint ? 0x16899b : 0x101820, roughness: 0.8 });
    const light = new THREE.MeshStandardMaterial({ color: checkpoint ? 0x9df6ef : 0xf4f5ec, roughness: 0.8 });
    const square = new THREE.BoxGeometry(9, 0.16, 9);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 14; col++) {
      const tile = new THREE.Mesh(square, (row + col) % 2 ? dark : light);
      const along = (row - 0.5) * 7;
      const across = -ROAD_HALF_WIDTH + 8 + col * 8;
      tile.position.set(frame.point.x + frame.tangent.x * along + frame.normal.x * across, frame.height + 0.13, frame.point.z + frame.tangent.z * along + frame.normal.z * across);
      this.scene.add(tile);
    }
    if (checkpoint) {
      const gateMat = new THREE.MeshStandardMaterial({ color: 0x32d7e8, emissive: 0x087b8c, emissiveIntensity: 0.65, roughness: 0.42 });
      const gate = new THREE.Group();
      const postGeo = new THREE.BoxGeometry(2.6, 8, 2.6);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, gateMat);
        post.position.set(frame.point.x + frame.normal.x * (ROAD_HALF_WIDTH + 7) * side, 4, frame.point.z + frame.normal.z * (ROAD_HALF_WIDTH + 7) * side);
        gate.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 14, 2.8, 2.8), gateMat);
      beam.position.set(frame.point.x, 8, frame.point.z);
      beam.rotation.y = Math.atan2(-frame.normal.z, frame.normal.x);
      gate.add(beam); this.scene.add(gate);
    }
  }

  addGrandstands() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x69767b, roughness: 0.82 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1c3038, metalness: 0.4, roughness: 0.5 });
    const seatColors = [0xc34d47, 0xe2c04c, 0x46889a, 0xeeeece].map(color => new THREE.Color(color));
    const layouts = [
      { x: -455, z: 0, yaw: -Math.PI / 2 }, { x: 455, z: 0, yaw: Math.PI / 2 },
      { x: -240, z: -310, yaw: 0 }, { x: 240, z: -310, yaw: 0 },
      { x: -240, z: 310, yaw: Math.PI }, { x: 240, z: 310, yaw: Math.PI },
    ];
    for (const layout of layouts) {
      const stand = new THREE.Group(); stand.position.set(layout.x, 0, layout.z); stand.rotation.y = layout.yaw;
      const base = new THREE.Mesh(new THREE.BoxGeometry(152, 2, 38), concrete); base.position.set(0, 1, 8); stand.add(base);
      const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 1.6, 2.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 96);
      const seatTransform = new THREE.Object3D();
      let seatIndex = 0;
      for (let row = 0; row < 4; row++) {
        const y = 2.5 + row * 2.1, z = row * 7;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(144 - row * 6, 1.2, 8), concrete); tier.position.set(0, y, z); stand.add(tier);
        for (let seat = 0; seat < 24; seat++) {
          seatTransform.position.set(-66 + seat * 5.7, y + 1.25, z - 1); seatTransform.updateMatrix();
          seats.setMatrixAt(seatIndex, seatTransform.matrix); seats.setColorAt(seatIndex, seatColors[(seat + row * 2) % seatColors.length]); seatIndex++;
        }
      }
      stand.add(seats);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(160, 2.2, 35), roofMat); roof.position.set(0, 13.2, 10); stand.add(roof);
      for (const x of [-72, 72]) {
        const support = new THREE.Mesh(new THREE.BoxGeometry(2.4, 12, 2.4), roofMat); support.position.set(x, 6.2, 14); stand.add(support);
      }
      this.scene.add(stand);
    }
  }

  addPickups() {
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x66ffd1, emissive: 0x19d99b, emissiveIntensity: 2.3, metalness: 0.3, roughness: 0.22 });
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xc7fff2, emissive: 0x42ffd1, emissiveIntensity: 2.8, roughness: 0.18 });
    const locations = [0.48, 1.32, 2.18, 3.05, 3.95, 4.88, 5.68];
    const offsets = [-21, 18, -16, 22, -20, 17, -14];
    locations.forEach((progress, index) => {
      const point = pointOnTrack(TRACK_START_T + progress, offsets[index]);
      const x = point.x, z = point.z;
      const group = new THREE.Group(); group.position.set(x, point.y + 2, z); this.scene.add(group);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 1.15, 10, 32), ringMat); ring.rotation.x = -Math.PI / 2; group.add(ring);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), orbMat); orb.position.y = 5; group.add(orb);
      this.pickups.push({ group, ring, orb, x, z, point, phase: index * 0.7 });
    });
  }

  makeCar(player, index, color = COLORS[index % COLORS.length]) {
    const group = new THREE.Group();
    const bodyMat = carMaterial(color, { metalness: 0.65, roughness: 0.24 });
    const darkMat = carMaterial(0x111820, { metalness: 0.25, roughness: 0.42 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x94ddf0, metalness: 0.18, roughness: 0.15, transparent: true, opacity: 0.38, depthWrite: false, clearcoat: 0.9 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9e4e9, metalness: 0.85, roughness: 0.22 });
    const headlight = new THREE.MeshStandardMaterial({ color: 0xeafaff, emissive: 0x92eaff, emissiveIntensity: 2.2, roughness: 0.18 });
    const tailLight = new THREE.MeshStandardMaterial({ color: 0xff493c, emissive: 0xff251a, emissiveIntensity: 1.6 });

    const addBox = (geometry, material, x, y, z, parent = group) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.9, 24), new THREE.MeshBasicMaterial({ color: 0x07120e, transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.035; group.add(shadow);
    addBox(new THREE.BoxGeometry(2.05, 0.52, 4.45), darkMat, 0, 0.78, 0);
    addBox(new THREE.BoxGeometry(1.92, 0.44, 3.88), bodyMat, 0, 1.02, 0.05);
    addBox(new THREE.BoxGeometry(1.88, 0.2, 1.15), bodyMat, 0, 1.22, -1.38);
    addBox(new THREE.BoxGeometry(1.84, 0.22, 0.86), bodyMat, 0, 1.2, 1.52);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.52, 1.72), glassMat); roof.position.set(0, 1.53, 0.2); group.add(roof);
    addBox(new THREE.BoxGeometry(1.46, 0.14, 0.86), bodyMat, 0, 1.84, 0.25);
    addBox(new THREE.BoxGeometry(0.76, 0.27, 0.08), darkMat, 0, 0.91, -2.12);
    for (const x of [-0.22, 0, 0.22]) addBox(new THREE.BoxGeometry(0.045, 0.23, 0.035), chrome, x, 0.91, -2.17);
    // Seated racer, visible through the glass from the other players' cameras.
    const driverSuit = carMaterial(color, { metalness: 0.12, roughness: 0.72 });
    const helmetMat = carMaterial(0xf4f4e9, { metalness: 0.2, roughness: 0.3 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x12252d, metalness: 0.65, roughness: 0.16 });
    addBox(new THREE.BoxGeometry(0.76, 0.74, 0.42), driverSuit, 0, 1.44, 0.3);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), helmetMat); helmet.position.set(0, 1.98, 0.02); group.add(helmet);
    addBox(new THREE.BoxGeometry(0.46, 0.17, 0.14), visorMat, 0, 2.01, -0.26);
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 8, 20), darkMat);
    steeringWheel.position.set(0, 1.37, -0.48); steeringWheel.rotation.x = Math.PI / 2.8; group.add(steeringWheel);
    const addArm = side => {
      const start = new THREE.Vector3(side * 0.3, 1.67, 0.12);
      const end = new THREE.Vector3(side * 0.26, 1.42, -0.34);
      const direction = end.clone().sub(start);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, direction.length(), 10), driverSuit);
      arm.position.copy(start).add(end).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      group.add(arm);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), darkMat); glove.position.copy(end); group.add(glove);
    };
    addArm(-1); addArm(1);
    addBox(new THREE.BoxGeometry(1.86, 0.12, 0.16), chrome, 0, 0.9, 2.22);
    const frontWheels = [];
    for (const side of [-1, 1]) {
      const frontAxle = new THREE.Group(); frontAxle.position.z = -1.35; group.add(frontAxle); frontWheels.push(frontAxle);
      for (const [parent, z] of [[frontAxle, 0], [group, 1.42]]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.34, 20), darkMat);
        tire.rotation.z = Math.PI / 2; tire.position.set(side * 1.02, 0.57, z); parent.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.37, 12), chrome);
        hub.rotation.z = Math.PI / 2; hub.position.copy(tire.position); parent.add(hub);
        const hubcap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.39, 10), bodyMat);
        hubcap.rotation.z = Math.PI / 2; hubcap.position.copy(tire.position); parent.add(hubcap);
      }
      addBox(new THREE.BoxGeometry(0.38, 0.19, 0.16), headlight, side * 0.67, 1.08, -2.18);
      addBox(new THREE.BoxGeometry(0.36, 0.18, 0.14), tailLight, side * 0.68, 1.04, 2.2);
      addBox(new THREE.BoxGeometry(0.08, 0.56, 2.35), darkMat, side * 0.91, 1.1, -0.02);
      addBox(new THREE.BoxGeometry(0.13, 0.13, 0.2), chrome, side * 1.11, 1.43, 0.58);
    }
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.58), new THREE.MeshBasicMaterial({ map: liveryTexture(color), transparent: true, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(0, 1.255, -1.16); group.add(decal);
    const numberTag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.38), new THREE.MeshBasicMaterial({ color: 0xf4f8fa }));
    numberTag.rotation.x = -Math.PI / 2; numberTag.position.set(0, 1.258, 0.48); group.add(numberTag);
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 256; labelCanvas.height = 48;
    const drawNameplate = name => {
      const ctx = labelCanvas.getContext('2d');
      ctx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
      ctx.fillStyle = '#08131bdc'; ctx.beginPath(); ctx.roundRect(3, 3, 250, 42, 12); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name.slice(0, 16).toUpperCase(), 128, 24);
    };
    drawNameplate(player.name);
    const labelTex = new THREE.CanvasTexture(labelCanvas); labelTex.colorSpace = THREE.SRGBColorSpace;
    // This is a small rear-facing badge physically attached to the back of the car,
    // rather than a billboard floating above it.
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 0.48), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
    label.position.set(0, 1.28, 2.24); group.add(label);
    this.scene.add(group);

    const trackT = TRACK_START_T - 0.055 - Math.floor(index / 2) * 0.055;
    const spawn = pointOnTrack(trackT, index % 2 ? 17 : -17);
    const tangent = trackFrame(trackT).tangent;
    const car = {
      id: player.id, name: player.name, color, group, x: spawn.x,
      z: spawn.z, yaw: Math.atan2(tangent.x, -tangent.z), speed: 0, nitro: player.nitro ?? 100,
      score: 0, laps: 0, lapProgress: 0, lastTrackT: trackT, checkpointPassed: false,
      ready: player.ready, connected: player.connected, latency: player.latency,
      driveStarted: false, jump: 0, penaltyRemaining: 0, boost: false, index, bodyMat, labelTex, label, frontWheels,
    };
    group.position.set(car.x, trackHeight(trackT), car.z); group.rotation.y = -car.yaw;
    this.cars.set(car.id, car);
    return car;
  }

  setPlayers(players) {
    const wanted = new Set(players.map(p => p.id));
    for (const [id, car] of this.cars) if (!wanted.has(id)) { this.scene.remove(car.group); this.cars.delete(id); }
    const usedColors = new Set([...this.cars.values()].map(car => car.color));
    players.forEach((player, index) => {
      let car = this.cars.get(player.id);
      if (!car) {
        const color = COLORS.find(candidate => !usedColors.has(candidate)) ?? COLORS[index % COLORS.length];
        car = this.makeCar(player, index, color);
        usedColors.add(color);
      }
      if (car.name !== player.name) {
        car.name = player.name;
        const canvas = car.labelTex.image;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#08131bdc'; ctx.beginPath(); ctx.roundRect(3, 3, 250, 42, 12); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(car.name.slice(0, 16).toUpperCase(), 128, 24);
        car.labelTex.needsUpdate = true;
      }
      car.ready = player.ready; car.connected = player.connected;
      car.latency = player.latency; if (Number.isFinite(player.nitro)) car.nitro = player.nitro;
    });
    this.resize();
  }

  control(player) {
    const car = this.cars.get(player.id);
    if (!car) return;
    const input = { steer: THREE.MathUtils.clamp(player.steer || 0, -1, 1), throttle: THREE.MathUtils.clamp(player.throttle || 0, 0, 1), brake: !!player.brake, jump: !!player.jump, nitro: !!player.nitro };
    this.remote.set(player.id, { input, receivedAt: performance.now() });
    car.boost = input.nitro;
  }

  applyServerState(cars) {
    for (const state of cars) {
      const car = this.cars.get(state.id);
      if (car && Number.isFinite(state.nitro)) { car.nitro = state.nitro; car.score = Math.max(car.score, state.score || 0); }
    }
  }

  keyboardInput(car) {
    if (car.id !== 'keyboard') return null;
    return {
      steer: (this.keys.ArrowLeft || this.keys.KeyA ? -1 : 0) + (this.keys.ArrowRight || this.keys.KeyD ? 1 : 0),
      throttle: this.keys.ArrowUp || this.keys.KeyW ? 1 : 0,
      brake: !!(this.keys.ArrowDown || this.keys.KeyS), nitro: !!this.keys.Space, jump: !!this.keys.ShiftLeft,
    };
  }

  stepCar(car, dt) {
    let input = this.keyboardInput(car);
    if (!input) {
      const sample = this.remote.get(car.id);
      input = sample && performance.now() - sample.receivedAt < 320 ? sample.input : { steer: 0, throttle: 0, brake: false, jump: false, nitro: false };
    }
    const seconds = Math.min(dt / 1000, 0.04);
    car.penaltyRemaining = Math.max(0, ((car.penaltyUntil || 0) - performance.now()) / 1000);
    if (car.penaltyRemaining > 0) {
      car.speed = 0;
      car.jump = 0;
      car.frontWheels.forEach(wheel => { wheel.rotation.y = 0; });
      const stoppedTrack = trackFrame(car.lastTrackT);
      car.yaw = Math.atan2(stoppedTrack.tangent.x, -stoppedTrack.tangent.z);
      car.group.position.set(car.x, stoppedTrack.height, car.z);
      car.group.rotation.y = -car.yaw;
      car.group.scale.set(1, 1, 1);
      return;
    }
    const firstThrottleFrame = !car.driveStarted && input.throttle > 0;
    if (input.throttle > 0) car.driveStarted = true;
    const currentTrack = projectTrack(car.x, car.z, car.lastTrackT);
    const trackHeading = Math.atan2(currentTrack.tangent.x, -currentTrack.tangent.z);
    if (!car.driveStarted || firstThrottleFrame) {
      // Ignore tilt until the driver launches and keep the nose tangent to the circuit.
      car.yaw = trackHeading;
    }
    const trackAssist = car.driveStarted && !firstThrottleFrame
      ? THREE.MathUtils.clamp(wrappedAngleDelta(car.yaw, trackHeading) * 22, -0.35, 0.35)
      : 0;
    const steeringGain = car.id === 'keyboard' ? 1 : 2.6;
    const steering = car.driveStarted && !firstThrottleFrame
      ? THREE.MathUtils.clamp(input.steer * steeringGain + trackAssist, -1, 1)
      : 0;
    const boosting = input.nitro && input.throttle > 0 && car.nitro > 0;
    if (input.throttle > 0 && !input.brake) {
      // A gentler throttle ramp keeps acceleration controllable on the small track.
      car.speed += (boosting ? 92 : 46) * input.throttle * seconds;
    } else {
      // Coasting and braking bring the car to a stop instead of creating reverse speed.
      const deceleration = input.brake ? 96 : 24;
      car.speed = Math.max(0, car.speed - deceleration * seconds);
    }
    car.speed = THREE.MathUtils.clamp(car.speed, 0, boosting ? 150 : 112);
    if (boosting) car.nitro = Math.max(0, car.nitro - 28 * seconds);
    // Use a bicycle steering model: the car only yaws while moving, around its turning arc,
    // and the front tires visibly steer into the corner instead of spinning the chassis in place.
    const steerAngle = steering * MAX_STEER_ANGLE;
    car.yaw += car.speed * Math.tan(steerAngle) / EFFECTIVE_WHEELBASE * seconds;
    car.frontWheels.forEach(wheel => { wheel.rotation.y = -steerAngle; });
    const previousX = car.x, previousZ = car.z;
    car.x += Math.sin(car.yaw) * car.speed * seconds;
    car.z -= Math.cos(car.yaw) * car.speed * seconds;
    let trackPosition = projectTrack(car.x, car.z, currentTrack.t);
    const forwardX = Math.sin(car.yaw), forwardZ = -Math.cos(car.yaw);
    const rightX = Math.cos(car.yaw), rightZ = Math.sin(car.yaw);
    const carHalfLength = 2.25, carHalfWidth = 1.05;
    const halfFootprintAcrossRoad = carHalfLength * Math.abs(forwardX * trackPosition.normal.x + forwardZ * trackPosition.normal.z)
      + carHalfWidth * Math.abs(rightX * trackPosition.normal.x + rightZ * trackPosition.normal.z);
    const roadLimit = ROAD_HALF_WIDTH - 0.75 - halfFootprintAcrossRoad;
    if (Math.abs(trackPosition.lateral) > roadLimit) {
      // A boundary hit returns the car to the local track center and applies
      // a stationary two-second penalty before controls are accepted again.
      car.x = trackPosition.point.x;
      car.z = trackPosition.point.z;
      car.speed = 0;
      car.jump = 0;
      car.penaltyUntil = performance.now() + 2000;
      car.penaltyRemaining = 2;
      car.yaw = Math.atan2(trackPosition.tangent.x, -trackPosition.tangent.z);
      car.lastTrackT = trackPosition.t;
      car.frontWheels.forEach(wheel => { wheel.rotation.y = 0; });
      car.group.position.set(car.x, trackPosition.height, car.z);
      car.group.rotation.y = -car.yaw;
      car.group.scale.set(1, 1, 1);
      return;
    }
    const moveX = car.x - previousX, moveZ = car.z - previousZ;
    if (Math.hypot(moveX, moveZ) > 0.0001) car.yaw = Math.atan2(moveX, -moveZ);
    const angleDelta = wrappedAngleDelta(car.lastTrackT, trackPosition.t);
    if (Math.abs(trackPosition.lateral) <= roadLimit && car.speed > 3 && angleDelta > 0) {
      car.lapProgress += angleDelta;
      if (!car.checkpointPassed && car.lapProgress >= CHECKPOINT_PROGRESS) car.checkpointPassed = true;
      if (car.lapProgress >= TWO_PI) {
        const completedLaps = Math.floor(car.lapProgress / TWO_PI);
        car.lapProgress %= TWO_PI;
        if (car.checkpointPassed) {
          car.laps += completedLaps;
          car.score += completedLaps * 2;
        }
        car.checkpointPassed = false;
      }
    }
    car.lastTrackT = trackPosition.t;
    if (input.jump && car.jump <= 0) car.jump = 0.72;
    car.jump = Math.max(0, car.jump - seconds);
    const bob = car.jump ? Math.sin((0.72 - car.jump) / 0.72 * Math.PI) * 2.2 : 0;
    car.group.position.set(car.x, trackPosition.height + bob, car.z); car.group.rotation.y = -car.yaw;
    if (!car.jump) car.group.scale.set(1, 1, 1);
    else car.group.scale.set(1.05, 1.05, 1.05);
  }

  updatePickups(dt) {
    this.elapsed += dt / 1000;
    this.pickups.forEach(pickup => {
      pickup.group.position.y = pickup.point.y + 2.2 + Math.sin(this.elapsed * 2.2 + pickup.phase) * 1.1;
      pickup.group.rotation.y += dt * 0.0007;
      pickup.orb.rotation.x += dt * 0.0005;
    });
  }

  resize() {
    if (!this.container || this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    const count = Math.max(1, this.cars.size);
    const cols = viewColumns(count), rows = Math.ceil(count / cols);
    const cellW = width / cols, cellH = height / rows;
    this.camera.aspect = cellW / cellH; this.camera.updateProjectionMatrix();
  }

  renderViews(deltaSeconds = 0) {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    const cars = [...this.cars.values()];
    if (!width || !height || !cars.length) { this.renderer.setScissorTest(false); this.renderer.setClearColor('#192a34'); this.renderer.clear(); this.renderer.setScissorTest(true); return; }
    const cols = viewColumns(cars.length), rows = Math.ceil(cars.length / cols);
    const cellW = width / cols, cellH = height / rows;
    this.renderer.setScissorTest(false); this.renderer.setClearColor('#34434b'); this.renderer.clear(true, true, true); this.renderer.setScissorTest(true);
    cars.forEach((car, index) => {
      const col = index % cols, row = Math.floor(index / cols);
      const left = Math.round(col * cellW), top = Math.round(row * cellH);
      const w = Math.round((col + 1) * cellW) - left, h = Math.round((row + 1) * cellH) - top;
      const bottom = height - top - h;
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      const forwardX = Math.sin(car.yaw), forwardZ = -Math.cos(car.yaw);
      const chaseDistance = 9.4;
      // Keep a fixed chase distance and pitch, while damping position and aim
      // independently for smooth cornering and penalty resets.
      const desiredPosition = new THREE.Vector3(car.x - forwardX * chaseDistance, car.group.position.y + 4.5 + car.jump * 0.25, car.z - forwardZ * chaseDistance);
      const desiredTarget = new THREE.Vector3(car.x + forwardX * 7.5, car.group.position.y + 1.15 + car.jump * 0.25, car.z + forwardZ * 7.5);
      if (!car.cameraPose) car.cameraPose = { position: desiredPosition.clone(), target: desiredTarget.clone() };
      const followAlpha = 1 - Math.exp(-7.5 * deltaSeconds);
      car.cameraPose.position.lerp(desiredPosition, followAlpha);
      car.cameraPose.target.lerp(desiredTarget, followAlpha);
      this.camera.position.copy(car.cameraPose.position);
      this.camera.lookAt(car.cameraPose.target);
      this.renderer.setViewport(left, bottom, w, h);
      this.renderer.setScissor(left, bottom, w, h);
      this.renderer.render(this.scene, this.camera);
    });
  }

  animate(now) {
    if (this.disposed) return;
    const dt = Math.min(50, now - this.lastFrame); this.lastFrame = now;
    for (const car of this.cars.values()) this.stepCar(car, dt);
    this.updatePickups(dt);
    this.renderViews(dt / 1000);
    if (now - this.lastSend > 60) {
      this.lastSend = now;
      const cars = [...this.cars.values()].filter(car => car.id !== 'keyboard').map(car => ({ id: car.id, x: car.x + CENTER, y: car.z + 470, angle: car.yaw, score: Math.floor(car.score) }));
      if (cars.length) window.sendRoom?.({ type: 'state', cars });
    }
    if (now - this.lastHud > 100) {
      this.lastHud = now;
      window.dispatchEvent(new CustomEvent('hud', { detail: [...this.cars.values()].map(car => ({ id: car.id, name: car.name, nitro: car.nitro, score: Math.floor(car.score), laps: car.laps, latency: car.latency, connected: car.connected, x: car.x, z: car.z, yaw: car.yaw, speed: Math.round(Math.abs(car.speed) * 0.72), penaltyRemaining: car.penaltyRemaining, color: `#${car.color.toString(16).padStart(6, '0')}` })) }));
    }
    this.frame = requestAnimationFrame(this.animate);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp);
    this.scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose(); this.renderer.domElement.remove();
    this.cars.clear(); this.pickups = [];
  }
}

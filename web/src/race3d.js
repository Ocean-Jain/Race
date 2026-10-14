import * as THREE from 'three';

const COLORS = [0x38d9ff, 0xff6c5c, 0xc084fc, 0xffcb45, 0x72e394, 0xff78bd, 0x8ba5ff, 0xff925c];
const CENTER = 600;
const TRACK_RADIUS = 290;
const INNER_EDGE = 222;
const OUTER_EDGE = 358;
const CHECKPOINT_ANGLE = Math.PI;
const MAX_STEER_ANGLE = 0.46;
const EFFECTIVE_WHEELBASE = 34;
const PICKUP_ANGLES = [0, Math.PI * 0.4, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 1.6];
const OBSTACLE_ANGLES = [0.72, 2.15, 3.58, 5.05];
const TWO_PI = Math.PI * 2;
const wrappedAngleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function viewColumns(count) {
  if (count <= 3) return Math.max(1, count);
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

const mapPoint = angle => ({ x: CENTER + Math.sin(angle) * TRACK_RADIUS, y: 470 - Math.cos(angle) * TRACK_RADIUS });

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

function addRing(scene, radius, tube, material, y = 0.08) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 240), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  scene.add(mesh);
  return mesh;
}

function carMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: options.metalness ?? 0.35, roughness: options.roughness ?? 0.42, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissive ? 0.5 : 0 });
}

export class Race3D {
  constructor(container) {
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

    // The same radius is used by the starting grid, physics, pickups and finish stripe.
    const asphalt = makeNoiseTexture('#303740', 'rgba(205,218,226,', 1800, 26);
    const road = new THREE.Mesh(new THREE.RingGeometry(INNER_EDGE, OUTER_EDGE, 256), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0.04 }));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.015; this.scene.add(road);

    const paint = new THREE.MeshStandardMaterial({ color: 0xe2e8df, roughness: 0.65 });
    const curbWhite = new THREE.MeshStandardMaterial({ color: 0xe8ecec, roughness: 0.72 });
    const curbRed = new THREE.MeshStandardMaterial({ color: 0xd84d49, roughness: 0.72 });
    addRing(this.scene, INNER_EDGE, 1.3, curbWhite, 0.12);
    addRing(this.scene, OUTER_EDGE, 1.3, curbWhite, 0.12);
    addRing(this.scene, INNER_EDGE + 8, 0.48, paint, 0.11);
    addRing(this.scene, OUTER_EDGE - 8, 0.48, paint, 0.11);
    const laneDashGeo = new THREE.BoxGeometry(11, 0.12, 0.9);
    const laneDashes = new THREE.InstancedMesh(laneDashGeo, paint, 96);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 96; i++) {
      const angle = i * Math.PI * 2 / 96;
      transform.position.set(Math.sin(angle) * TRACK_RADIUS, 0.1, -Math.cos(angle) * TRACK_RADIUS);
      transform.rotation.set(0, Math.PI - angle, 0); transform.updateMatrix(); laneDashes.setMatrixAt(i, transform.matrix);
    }
    this.scene.add(laneDashes);

    // Alternating low safety blocks define the circular road edge.
    const barrierGeo = new THREE.BoxGeometry(11, 2.4, 2.7);
    for (const radius of [INNER_EDGE - 4, OUTER_EDGE + 4]) for (const [offset, material] of [[0, curbRed], [1, curbWhite]]) {
      const barriers = new THREE.InstancedMesh(barrierGeo, material, 56);
      for (let i = offset; i < 112; i += 2) {
        const angle = i * Math.PI * 2 / 112;
        transform.position.set(Math.sin(angle) * radius, 1.05, -Math.cos(angle) * radius);
        transform.rotation.set(0, Math.PI - angle, 0); transform.updateMatrix(); barriers.setMatrixAt((i - offset) / 2, transform.matrix);
      }
      this.scene.add(barriers);
    }

    // Start / finish line sits across the road at its north end. The cars start just behind it, pointing clockwise.
    const checkerBlack = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.8 });
    const checkerWhite = new THREE.MeshStandardMaterial({ color: 0xf4f5ec, roughness: 0.8 });
    const square = new THREE.BoxGeometry(9, 0.16, 9);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 14; col++) {
      const tile = new THREE.Mesh(square, (row + col) % 2 ? checkerBlack : checkerWhite);
      tile.position.set(-4.5 + row * 9, 0.13, -OUTER_EDGE + 8 + col * 9);
      this.scene.add(tile);
    }

    // A second gate sits opposite the start line. Lap progress only counts once a racer passes it.
    const checkpointBlue = new THREE.MeshStandardMaterial({ color: 0x32d7e8, emissive: 0x087b8c, emissiveIntensity: 0.65, roughness: 0.42 });
    const checkpointWhite = new THREE.MeshStandardMaterial({ color: 0xe9f6ef, roughness: 0.72 });
    for (let row = 0; row < 2; row++) for (let col = 0; col < 14; col++) {
      const tile = new THREE.Mesh(square, (row + col) % 2 ? checkpointBlue : checkpointWhite);
      // At the south side, racers travel east/west, so the checkpoint stripe
      // spans the road's north/south width and crosses the racing line at 90°.
      tile.position.set(-4.5 + row * 9, 0.15, INNER_EDGE + 8 + col * 9);
      this.scene.add(tile);
    }
    const gatePost = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8, 2.6), checkpointBlue);
    for (const z of [INNER_EDGE - 4, OUTER_EDGE + 4]) { const post = gatePost.clone(); post.position.set(0, 4, z); this.scene.add(post); }
    const gateTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 142), checkpointBlue);
    gateTop.position.set(0, 8, TRACK_RADIUS); this.scene.add(gateTop);

    const infield = new THREE.Mesh(new THREE.CircleGeometry(INNER_EDGE - 2, 160), new THREE.MeshStandardMaterial({ color: 0x54794b, map: grass, roughness: 1 }));
    infield.rotation.x = -Math.PI / 2; infield.position.y = 0.025; this.scene.add(infield);
    this.addInfieldDetails();
    this.addPickups();
    this.addObstacles();
  }

  addInfieldDetails() {
    const island = new THREE.Mesh(new THREE.CircleGeometry(76, 72), new THREE.MeshStandardMaterial({ color: 0x426548, roughness: 0.88 }));
    island.rotation.x = -Math.PI / 2; island.position.y = 0.08; this.scene.add(island);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 5, 22, 9), new THREE.MeshStandardMaterial({ color: 0x664b31, roughness: 1 }));
    trunk.position.y = 11; this.scene.add(trunk);
    for (let i = 0; i < 3; i++) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(22 - i * 4, 32, 9), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x326748 : 0x3b7550, roughness: 0.9 }));
      crown.position.set(0, 31 + i * 17, 0); this.scene.add(crown);
    }
    for (let i = 0; i < 22; i++) {
      const a = i * Math.PI * 2 / 22;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + i % 3, 0), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x71816d : 0x8a8068, roughness: 1 }));
      rock.position.set(Math.sin(a) * 92, 1.3, -Math.cos(a) * 92); this.scene.add(rock);
    }
    for (let i = 0; i < 36; i++) {
      const angle = i * Math.PI * 2 / 36;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 8, 8), new THREE.MeshStandardMaterial({ color: 0xa9c39c, emissive: 0x152719, roughness: 0.75 }));
      post.position.set(Math.sin(angle) * 210, 4, -Math.cos(angle) * 210); this.scene.add(post);
    }
  }

  addPickups() {
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x66ffd1, emissive: 0x19d99b, emissiveIntensity: 2.3, metalness: 0.3, roughness: 0.22 });
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xc7fff2, emissive: 0x42ffd1, emissiveIntensity: 2.8, roughness: 0.18 });
    PICKUP_ANGLES.forEach((angle, index) => {
      const point = mapPoint(angle);
      const x = point.x - CENTER, z = point.y - 470;
      const group = new THREE.Group(); group.position.set(x, 2, z); this.scene.add(group);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 1.15, 10, 32), ringMat); ring.rotation.x = -Math.PI / 2; group.add(ring);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), orbMat); orb.position.y = 5; group.add(orb);
      this.pickups.push({ group, ring, orb, x, z, point, phase: index * 0.7 });
    });
  }

  addObstacles() {
    this.obstacles = [];
    OBSTACLE_ANGLES.forEach((angle, index) => {
      const radius = TRACK_RADIUS + (index % 2 ? 30 : -30);
      const x = Math.sin(angle) * radius, z = -Math.cos(angle) * radius;
      const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = Math.PI - angle; this.scene.add(group);
      const body = new THREE.Mesh(new THREE.BoxGeometry(13, 2.2, 7), new THREE.MeshStandardMaterial({ color: index % 2 ? 0xe85b47 : 0xffb63b, roughness: 0.65 }));
      body.position.y = 1.3; group.add(body);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe59a, emissive: 0xff7b24, emissiveIntensity: 1.8 }));
      lamp.position.set(0, 3, 0); group.add(lamp);
      this.obstacles.push({ x, z });
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

    const theta = -0.07 - Math.floor(index / 2) * 0.09;
    const radius = TRACK_RADIUS + (index % 2 ? 19 : -19);
    const car = {
      id: player.id, name: player.name, color, group, x: Math.sin(theta) * radius,
      z: -Math.cos(theta) * radius, yaw: theta + Math.PI / 2, speed: 0, nitro: player.nitro ?? 100,
      score: 0, laps: 0, lapProgress: 0, lastTrackAngle: theta, checkpointPassed: false,
      ready: player.ready, connected: player.connected, latency: player.latency,
      driveStarted: false, jump: 0, boost: false, index, bodyMat, labelTex, label, frontWheels,
    };
    group.position.set(car.x, 0, car.z); group.rotation.y = -car.yaw;
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
    const firstThrottleFrame = !car.driveStarted && input.throttle > 0;
    if (input.throttle > 0) car.driveStarted = true;
    const trackHeading = Math.atan2(car.x, -car.z) + Math.PI / 2;
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
    const radius = Math.hypot(car.x, car.z);
    if (radius < INNER_EDGE + 8 || radius > OUTER_EDGE - 8) {
      const edge = radius < INNER_EDGE + 8 ? INNER_EDGE + 8 : OUTER_EDGE - 8;
      const scale = edge / Math.max(radius, 0.001);
      car.x *= scale; car.z *= scale; car.speed *= 0.16;
    }
    for (const obstacle of this.obstacles) if (Math.hypot(car.x - obstacle.x, car.z - obstacle.z) < 8) car.speed *= 0.28;
    const moveX = car.x - previousX, moveZ = car.z - previousZ;
    if (Math.hypot(moveX, moveZ) > 0.0001) car.yaw = Math.atan2(moveX, -moveZ);
    const trackAngle = Math.atan2(car.x, -car.z);
    const trackRadius = Math.hypot(car.x, car.z);
    const angleDelta = wrappedAngleDelta(car.lastTrackAngle, trackAngle);
    if (trackRadius >= INNER_EDGE + 4 && trackRadius <= OUTER_EDGE - 4 && car.speed > 3 && angleDelta > 0) {
      car.lapProgress += angleDelta;
      if (!car.checkpointPassed && car.lapProgress >= CHECKPOINT_ANGLE) car.checkpointPassed = true;
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
    car.lastTrackAngle = trackAngle;
    if (input.jump && car.jump <= 0) car.jump = 0.72;
    car.jump = Math.max(0, car.jump - seconds);
    const bob = car.jump ? Math.sin((0.72 - car.jump) / 0.72 * Math.PI) * 2.2 : 0;
    car.group.position.set(car.x, bob, car.z); car.group.rotation.y = -car.yaw;
    if (!car.jump) car.group.scale.set(1, 1, 1);
    else car.group.scale.set(1.05, 1.05, 1.05);
  }

  updatePickups(dt) {
    this.elapsed += dt / 1000;
    this.pickups.forEach(pickup => {
      pickup.group.position.y = 2.2 + Math.sin(this.elapsed * 2.2 + pickup.phase) * 1.1;
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

  renderViews() {
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
      // Keep a constant chase-camera offset and height. It follows the car's position and heading
      // without changing its distance or pitch as speed changes.
      this.camera.position.set(car.x - forwardX * chaseDistance, 4.5 + car.jump * 0.25, car.z - forwardZ * chaseDistance);
      this.camera.lookAt(car.x + forwardX * 7.5, 1.15 + car.jump * 0.25, car.z + forwardZ * 7.5);
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
    this.renderViews();
    if (now - this.lastSend > 60) {
      this.lastSend = now;
      const cars = [...this.cars.values()].filter(car => car.id !== 'keyboard').map(car => ({ id: car.id, x: car.x + CENTER, y: car.z + 470, angle: car.yaw, score: Math.floor(car.score) }));
      if (cars.length) window.sendRoom?.({ type: 'state', cars });
    }
    if (now - this.lastHud > 100) {
      this.lastHud = now;
      window.dispatchEvent(new CustomEvent('hud', { detail: [...this.cars.values()].map(car => ({ id: car.id, name: car.name, nitro: car.nitro, score: Math.floor(car.score), laps: car.laps, latency: car.latency, connected: car.connected, x: car.x, z: car.z, yaw: car.yaw, speed: Math.round(Math.abs(car.speed) * 0.72), color: `#${car.color.toString(16).padStart(6, '0')}` })) }));
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

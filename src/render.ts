import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Board } from './board';
import { BiomeDef } from './biomes';
import { CORE, ENEMIES, EnemyId, MATS, MatId, N, PALETTE } from './config';
import { PERF } from './settings';
/** keep in step with sim.ts TOPPLE_SWING (render can't import sim without a cycle) */
const TOPPLE_SWING = 0.4;

const C = (N - 1) / 2;
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** overshoots a little, then settles (follow-through) */
const easeOutBack = (t: number) => { const c = 1.7; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
/** set opacity on every basic material under an object, relative to the opacity it was built with */
function fadeTree(o: THREE.Object3D, k: number) {
  o.traverse(c => {
    const m = (c as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || !('opacity' in m)) return;
    if (c.userData.baseOpacity === undefined) { c.userData.baseOpacity = m.opacity; m.transparent = true; }
    m.opacity = c.userData.baseOpacity * k;
  });
}
function disposeTree(o: THREE.Object3D) {
  o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; m?.dispose(); });
}
const GRAVITY = 38;
/** enemies are drawn larger than their hit size so they read next to the blocks */
const ENEMY_SCALE = 1.3;
export const world = (x: number, y: number, z = 0) => new THREE.Vector3(x - C, z, y - C);

function toonGradient() {
  const data = new Uint8Array([70, 150, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const gradient = toonGradient();
const outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
const noRaycast = () => {};

export function toon(color: number, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra });
}

/** Mesh with an inverted-hull outline child. */
export function outlined(geo: THREE.BufferGeometry, mat: THREE.Material, thickness = 0.06, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  const hull = new THREE.Mesh(geo, outlineMat);
  geo.computeBoundingSphere();
  const r = geo.boundingSphere!.radius || 0.5;
  hull.scale.setScalar(1 + thickness / r);
  hull.raycast = noRaycast;
  m.add(hull);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const GEO = {
  block: new THREE.BoxGeometry(0.94, 0.94, 0.94),
  ghost: new THREE.BoxGeometry(0.98, 0.98, 0.98),
  gem: new THREE.OctahedronGeometry(0.2),
  flame: new THREE.ConeGeometry(0.15, 0.34, 5),
  tree: new THREE.ConeGeometry(0.13, 0.32, 4),
  ring: new THREE.TorusGeometry(0.22, 0.05, 6, 16),
  orb: new THREE.IcosahedronGeometry(0.15, 0),
  tile: new THREE.BoxGeometry(0.98, 0.2, 0.98),
  rangeRing: new THREE.RingGeometry(0.96, 1, 72),
  disc: new THREE.CircleGeometry(1, 48),
  beam: new THREE.CylinderGeometry(0.045, 0.045, 1, 6),
  bolt: new THREE.CylinderGeometry(0.075, 0.075, 1, 6),
  flash: new THREE.IcosahedronGeometry(0.22, 0),
  spark: new THREE.BoxGeometry(0.07, 0.07, 0.07),
  gate: new THREE.TorusGeometry(0.95, 0.1, 8, 32),
  shell: new THREE.IcosahedronGeometry(0.13, 0),
  debris: new THREE.TetrahedronGeometry(0.12),
  strut: new THREE.BoxGeometry(0.98, 0.09, 0.98),
  combo: new THREE.OctahedronGeometry(0.11),
  puff: new THREE.IcosahedronGeometry(0.2, 0),
  arrow: new THREE.ConeGeometry(0.45, 0.9, 3),
  anvil: new THREE.BoxGeometry(0.62, 0.2, 0.34),
  bell: new THREE.ConeGeometry(0.22, 0.32, 8, 1, true),
  mirror: new THREE.BoxGeometry(0.46, 0.46, 0.05),
};

/** A rough boulder: a box with its corners pushed about. */
function boulder() {
  const g = new THREE.BoxGeometry(0.96, 0.94, 0.96, 2, 2, 2);
  const p = g.attributes.position;
  const seed = (i: number) => Math.sin(i * 12.9898) * 43758.5453 % 1;
  for (let i = 0; i < p.count; i++) {
    const k = 0.045;
    p.setXYZ(i, p.getX(i) + seed(i) * k, p.getY(i) + seed(i + 7) * k, p.getZ(i) + seed(i + 13) * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Every material has its own silhouette, so towers read by shape as well as colour:
 * bevelled stone, faceted crystal, a tapered ember brazier, an eight-sided ward, a rough rock.
 */
const BLOCK_GEO: Partial<Record<MatId, THREE.BufferGeometry>> = {
  stone: new RoundedBoxGeometry(0.94, 0.94, 0.94, 2, 0.07),
  crystal: new RoundedBoxGeometry(0.9, 0.94, 0.9, 1, 0.17),
  ember: new THREE.CylinderGeometry(0.67, 0.56, 0.94, 4, 1).rotateY(Math.PI / 4),
  ward: new THREE.CylinderGeometry(0.5, 0.5, 0.94, 8, 1).rotateY(Math.PI / 8),
  beacon: new RoundedBoxGeometry(0.9, 0.94, 0.9, 2, 0.12),
  rock: boulder(),
};

/** Grey-scale face patterns, tinted by the block colour: bricks, facets, a grate, a rune, a lantern. */
function facePattern(mat: MatId): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const shade = (v: number) => `rgb(${v * 255},${v * 255},${v * 255})`;
  g.fillStyle = shade(1); g.fillRect(0, 0, 64, 64);
  g.strokeStyle = shade(0.8); g.lineWidth = 4; g.strokeRect(2, 2, 60, 60);
  g.lineWidth = 3;
  if (mat === 'stone') {
    g.strokeStyle = shade(0.74);
    for (const y of [22, 43]) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
    for (const [x, y0, y1] of [[32, 0, 22], [16, 22, 43], [48, 22, 43], [32, 43, 64]]) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  } else if (mat === 'crystal') {
    g.strokeStyle = shade(0.82);
    g.beginPath(); g.moveTo(0, 40); g.lineTo(40, 0); g.moveTo(24, 64); g.lineTo(64, 24); g.stroke();
    g.fillStyle = shade(1); g.globalAlpha = 0.9; g.fillRect(10, 8, 6, 20); g.globalAlpha = 1;
  } else if (mat === 'ember') {
    g.fillStyle = shade(0.55);
    for (const y of [18, 30, 42]) g.fillRect(8, y, 48, 5);
  } else if (mat === 'ward') {
    g.strokeStyle = shade(0.66);
    g.beginPath(); g.arc(32, 32, 16, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 52); g.moveTo(18, 40); g.lineTo(46, 24); g.stroke();
  } else if (mat === 'beacon') {
    g.fillStyle = shade(0.6); g.fillRect(16, 14, 32, 36);
    g.fillStyle = shade(1); g.fillRect(21, 19, 22, 26);
  } else if (mat === 'garden') {
    g.fillStyle = shade(0.8);
    for (const [x, y] of [[14, 16], [40, 12], [26, 34], [50, 40], [12, 48], [36, 54]]) { g.beginPath(); g.ellipse(x, y, 5, 3, 0.6, 0, Math.PI * 2); g.fill(); }
  } else if (mat === 'rock') {
    g.strokeStyle = shade(0.62);
    g.beginPath(); g.moveTo(10, 8); g.lineTo(26, 30); g.lineTo(20, 52); g.moveTo(26, 30); g.lineTo(50, 38); g.lineTo(58, 56); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const PATTERNS = new Map<MatId, THREE.Texture>();
const patternOf = (mat: MatId) => { let t = PATTERNS.get(mat); if (!t) { t = facePattern(mat); PATTERNS.set(mat, t); } return t; };
const goldOutline = new THREE.MeshBasicMaterial({ color: 0xf2c45a, side: THREE.BackSide });
const timberMat = toonLazy(0x6b4a32);
function toonLazy(color: number) { let m: THREE.MeshToonMaterial | null = null; return () => (m ??= toon(color)); }

const ENEMY_GEO: Record<EnemyId, THREE.BufferGeometry> = {
  shard: new THREE.TetrahedronGeometry(ENEMIES.shard.size),
  runner: new THREE.IcosahedronGeometry(ENEMIES.runner.size, 0),
  flier: new THREE.OctahedronGeometry(ENEMIES.flier.size).scale(0.8, 1.4, 0.8),
  brute: new THREE.DodecahedronGeometry(ENEMIES.brute.size),
  sapper: new THREE.CylinderGeometry(0.22, 0.34, 0.5, 6),
  climber: new THREE.TetrahedronGeometry(ENEMIES.climber.size).rotateX(Math.PI),
  bomber: new THREE.OctahedronGeometry(ENEMIES.bomber.size).scale(1.4, 0.7, 1.4),
  bulwark: new THREE.BoxGeometry(0.62, 0.62, 0.62),
  wyrm: new THREE.CapsuleGeometry(0.42, 0.9, 3, 8).rotateX(Math.PI / 2),
  leviathan: new THREE.OctahedronGeometry(ENEMIES.leviathan.size, 0).scale(1.8, 0.6, 1.1),
  boss: new THREE.IcosahedronGeometry(ENEMIES.boss.size, 0),
};

/** A tower tipping over: each block swings around the base edge, so the whole tower turns as one. */
interface Tip { pivot: THREE.Vector3; dir: THREE.Vector3; axis: THREE.Vector3; r0: number; r1: number; f0: number; f1: number; t: number; dur: number; to: THREE.Vector3 }

interface BlockView {
  mesh: THREE.Mesh; mat: THREE.MeshToonMaterial; target: THREE.Vector3; emblem: THREE.Object3D | null; matId: MatId; x: number; y: number;
  /** where the block really is; the mesh adds squash on top */
  pos: THREE.Vector3; vy: number; delay: number; tip: Tip | null;
  /** squash spring: + squashed, - stretched */
  sq: number; sqv: number; flash: number; emblemAge: number;
  /** an emblem that just got covered, shrinking away */
  emblemOut: THREE.Object3D | null; emblemOutAge: number;
  /** emblem size: bigger on taller stacks of one material */
  emblemBase: number;
}

/** A block on its way out: either popping in place or (toss) swinging off the edge and dropping away. */
interface Dying { mesh: THREE.Mesh; mat: THREE.MeshToonMaterial; t: number; toss?: { pos: THREE.Vector3; tip: Tip | null; vy: number }; quiet?: number }

interface Fx { obj: THREE.Object3D; life: number; max: number; vel?: THREE.Vector3; spin?: number; kind: 'debris' | 'fade' | 'ring' | 'float' | 'puff' | 'spark' | 'flash' | 'cloud'; grow?: number }

export interface EnemyView {
  root: THREE.Group; body: THREE.Mesh; mat: THREE.MeshToonMaterial; hpBar: THREE.Group; hpFill: THREE.Mesh; hpLag: THREE.Mesh;
  gait: 'hop' | 'hover' | 'slither'; bornAt: number; lastT: number; lastHp: number; lag: number; punch: number; barAge: number;
}

interface DyingEnemy { v: EnemyView; color: number; t: number }

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private blockViews = new Map<number, BlockView>();
  private dying: Dying[] = [];
  private tossing = new Map<number, THREE.Vector3>();
  private dyingEnemies: DyingEnemy[] = [];
  private ghostOffset = new THREE.Vector3();
  private ghostAnchor: THREE.Vector3 | null = null;
  private ghostAge = 1;
  private ghostSpin = 0;
  private ghostFading: { g: THREE.Group; t: number }[] = [];
  private islandTarget: { a: THREE.Color; b: THREE.Color; cliff: THREE.Color; rock: THREE.Color } | null = null;
  private glowAt = -1;
  /** how high the camera looks: follows the tallest tower */
  private focusY = 1.5;
  private validRoot = new THREE.Group();
  private linkRoot = new THREE.Group();
  private pathRoot = new THREE.Group();
  private paths: { pts: THREE.Vector3[]; len: number[]; total: number }[] = [];
  private pathMarks: THREE.InstancedMesh | null = null;
  private coreXray: THREE.Mesh;
  /** weather on screen: fog, rain or a moon */
  private weather: string | null = null;
  private fogK = 0;
  private rain: THREE.LineSegments | null = null;
  private moon: THREE.Group | null = null;
  private gateRoot = new THREE.Group();
  /** a short camera move toward a point of interest (a boss, a journey) */
  private cine: { point: THREE.Vector3; t: number; dur: number; pull: number } | null = null;
  private cineApplied = new THREE.Vector3();
  private perfFrame = 0;
  private coreSq = 0;
  private coreSqv = 0;
  private blockRoot = new THREE.Group();
  private ghostRoot = new THREE.Group();
  private ringRoot = new THREE.Group();
  private telegraphRoot = new THREE.Group();
  private fxList: Fx[] = [];
  private raycaster = new THREE.Raycaster();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private nightAmt = 0;
  private nightTarget = 0;
  private core: THREE.Group;
  private coreGem: THREE.Mesh;
  private coreFlash = 0;
  private decor: THREE.Object3D[] = [];
  private time = 0;
  private shake = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(PERF ? 0.5 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !PERF;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(15, 17, 15);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.5, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 42;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = 1.32;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a7a9a, 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-8, 18, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -13; sc.right = sc.top = 13; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);

    this.buildIsland();
    this.core = new THREE.Group();
    this.coreGem = outlined(new THREE.OctahedronGeometry(0.55), toon(PALETTE.core, { emissive: 0x551133 }), 0.07);
    this.coreGem.position.y = 1.15;
    const base = outlined(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 8), toon(0xf1e6d6), 0.05);
    base.position.y = 0.18;
    const halo = outlined(new THREE.TorusGeometry(0.75, 0.06, 6, 24), toon(PALETTE.coreGlow), 0.04);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.15;
    halo.name = 'halo';
    this.core.add(base, this.coreGem, halo);
    this.core.position.copy(world(CORE.x, CORE.y));
    this.coreXray = new THREE.Mesh(this.coreGem.geometry, new THREE.MeshBasicMaterial({ color: PALETTE.core, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }));
    this.coreXray.renderOrder = 30;
    this.coreXray.raycast = noRaycast;
    this.coreGem.add(this.coreXray);
    this.scene.add(this.core, this.blockRoot, this.ghostRoot, this.ringRoot, this.telegraphRoot, this.validRoot, this.linkRoot, this.pathRoot, this.gateRoot);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private islandMats = { a: toon(PALETTE.tileA), b: toon(PALETTE.tileB), cliff: toon(PALETTE.cliff), rock: toon(PALETTE.rock) };
  private ventRoot = new THREE.Group();
  readonly island = new THREE.Group();

  /** Repaint the island and sky for a biome. */
  setBiome(b: BiomeDef) {
    // the island takes on the new land's colours over a second instead of snapping
    this.islandTarget = { a: new THREE.Color(b.tiles[0]), b: new THREE.Color(b.tiles[1]), cliff: new THREE.Color(b.cliff), rock: new THREE.Color(b.rock) };
    document.body.style.setProperty('--biome-a', b.sky[0]);
    document.body.style.setProperty('--biome-b', b.sky[1]);
    document.body.dataset.biome = b.id;
  }

  /** Glowing lava vent markers. */
  setVents(cells: { x: number; y: number }[]) {
    for (const v of this.ventRoot.children) v.userData.leave ??= 0;
    for (const c of cells) {
      const m = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(0.001);
      m.position.copy(world(c.x, c.y, 0.015));
      m.userData.vent = true;
      m.userData.age = -Math.random() * 0.3;
      this.ventRoot.add(m);
    }
  }

  /** Big plume of fire from a vent. */
  eruption(x: number, y: number) {
    if (PERF) return;
    const at = world(x, y, 0.1);
    this.ring(at, 1.6, 0xff6a2a, 0.6);
    this.debris(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xff8a3a, 14);
    this.debris(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x3d2f35, 8);
    this.shakeCam(0.35);
  }

  /** Wind streak across a tower top. */
  gust(x: number, y: number, z: number, side: number) {
    if (PERF) return;
    const [dx, dy] = [[0, 1], [-1, 0], [0, -1], [1, 0]][side];
    for (let i = 0; i < 3; i++) {
      const from = world(x - dx * 3, y - dy * 3, z + 0.3 + i * 0.25), to = world(x + dx * 3, y + dy * 3, z + 0.3 + i * 0.25);
      this.beam(from, to, 0xfff1d6);
    }
  }

  private buildIsland() {
    const g = this.island;
    const matA = this.islandMats.a, matB = this.islandMats.b;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = new THREE.Mesh(GEO.tile, (x + y) % 2 ? matA : matB);
      t.position.copy(world(x, y, -0.1));
      t.receiveShadow = true;
      g.add(t);
    }
    const slab = outlined(new THREE.BoxGeometry(N + 0.3, 1.0, N + 0.3), this.islandMats.cliff, 0.1);
    slab.position.y = -0.71;
    g.add(slab, this.ventRoot);
    const rock = outlined(new THREE.ConeGeometry((N + 0.3) * 0.707, 7, 4), this.islandMats.rock, 0.12, false);
    rock.rotation.y = Math.PI / 4;
    rock.rotation.x = Math.PI;
    rock.position.y = -4.7;
    g.add(rock);
    // drifting geometric rocks around the island
    const shapes = [new THREE.OctahedronGeometry(0.7), new THREE.TetrahedronGeometry(0.8), new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.IcosahedronGeometry(0.6, 0)];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const r = 11 + Math.random() * 6;
      const m = outlined(shapes[i % shapes.length], toon(i % 3 ? PALETTE.rock : PALETTE.cliff), 0.08, false);
      m.position.set(Math.cos(a) * r, -3 + Math.random() * 5, Math.sin(a) * r);
      m.scale.setScalar(0.5 + Math.random() * 1.2);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.userData.baseY = m.position.y;
      m.userData.phase = Math.random() * 6;
      this.decor.push(m);
      g.add(m);
    }
    this.scene.add(g);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep about 35 degrees of horizontal view so the whole island fits on a phone held upright
    const aspect = w / h;
    this.camera.fov = Math.max(38, (2 * Math.atan(Math.tan((17.5 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
  }

  setCameraSpeed(k: number) { this.controls.rotateSpeed = k; this.controls.zoomSpeed = k; }

  /** Aim the camera a little higher as towers grow, so their tops stay on screen. */
  setFocus(tallest: number) { this.focusY = 1.5 + Math.max(0, tallest - 3) * 0.55; }

  /** Faint outlines on every cell where the selected piece can go. */
  setValid(cells: { x: number; y: number; z: number }[]) {
    for (const o of this.validRoot.children) disposeTree(o);
    this.validRoot.clear();
    if (!cells.length) return;
    const pts: number[] = [];
    const h = 0.42;
    for (const c of cells) {
      const p = world(c.x, c.y, c.z + 0.03);
      const q = [[-h, -h], [h, -h], [h, h], [-h, h]];
      for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; pts.push(p.x + a[0], p.y, p.z + a[1], p.x + b[0], p.y, p.z + b[1]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    lines.userData.age = 0;
    lines.raycast = noRaycast;
    this.validRoot.add(lines);
    const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.84, 0.84).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), cells.length);
    cells.forEach((c, i) => tiles.setMatrixAt(i, new THREE.Matrix4().setPosition(world(c.x, c.y, c.z + 0.025))));
    tiles.userData.age = 0;
    tiles.userData.fill = true;
    tiles.raycast = noRaycast;
    this.validRoot.add(tiles);
  }

  /** A small spinning star on every turret block that has a combo going. */
  setCombos(ids: Set<number>) {
    for (const [id, v] of this.blockViews) {
      const has = v.mesh.getObjectByName('combo');
      if (ids.has(id) && !has) {
        const m = new THREE.Mesh(GEO.combo, new THREE.MeshBasicMaterial({ color: 0xfff1a6 }));
        m.name = 'combo';
        m.position.set(0.36, 0.36, 0.36);
        m.raycast = noRaycast;
        m.userData.spin = 3;
        m.scale.setScalar(0.001);
        m.userData.age = 0;
        v.mesh.add(m);
      } else if (!ids.has(id) && has) v.mesh.remove(has);
    }
  }

  /** Glowing threads from each beacon to the turrets it powers. */
  setLinks(pairs: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[]) {
    for (const o of this.linkRoot.children) disposeTree(o);
    this.linkRoot.clear();
    if (!pairs.length) return;
    const pts: number[] = [];
    for (const { a, b } of pairs) {
      const p = world(a.x, a.y, a.z + 0.5), q = world(b.x, b.y, b.z + 0.5);
      pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xfff1a6, transparent: true, opacity: 0.8, depthTest: false }));
    l.renderOrder = 15;
    l.raycast = noRaycast;
    this.linkRoot.add(l);
  }

  /** Chevrons marching along the routes enemies will take tonight. */
  setPaths(polys: { x: number; y: number }[][]) {
    for (const o of this.pathRoot.children) disposeTree(o);
    this.pathRoot.clear();
    this.pathMarks = null;
    this.paths = polys.filter(p => p.length > 1).map(p => {
      const pts = p.map(c => world(c.x, c.y, 0.06));
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
      return { pts, len, total: len[len.length - 1] };
    });
    if (!this.paths.length) return;
    const count = this.paths.reduce((s, p) => s + Math.ceil(p.total / 1.1), 0);
    const geo = new THREE.ConeGeometry(0.13, 0.32, 3).rotateX(Math.PI / 2);
    this.pathMarks = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.85, depthWrite: false }), count);
    this.pathMarks.raycast = noRaycast;
    this.pathMarks.userData.age = 0;
    this.pathRoot.add(this.pathMarks);
  }

  private updatePaths(dt: number) {
    const m = this.pathMarks;
    if (!m) return;
    m.userData.age += dt;
    (m.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, m.userData.age * 2);
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), mat = new THREE.Matrix4(), fwd = new THREE.Vector3(0, 0, 1);
    let k = 0;
    for (const p of this.paths) {
      const n = Math.ceil(p.total / 1.1);
      for (let i = 0; i < n; i++) {
        const d = (this.time * 1.4 + i * 1.1) % p.total;
        let j = 1;
        while (j < p.len.length - 1 && p.len[j] < d) j++;
        const a = p.pts[j - 1], b = p.pts[j], f = (d - p.len[j - 1]) / Math.max(1e-6, p.len[j] - p.len[j - 1]);
        const pos = a.clone().lerp(b, f);
        q.setFromUnitVectors(fwd, b.clone().sub(a).normalize());
        // fade in at the edge, out at the core
        const edge = Math.min(1, d / 0.8, (p.total - d) / 0.8);
        sc.setScalar(Math.max(0.001, edge));
        mat.compose(pos, q, sc);
        m.setMatrixAt(k++, mat);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /** Screen position of a world point, for HUD markers. */
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0;
    document.body.classList.toggle('night', on);
  }

  // ---------- board ----------

  syncBoard(board: Board) {
    const seen = new Set<number>();
    for (const { x, y, z, b } of board.blocks()) {
      seen.add(b.id);
      let v = this.blockViews.get(b.id);
      const target = world(x, y, z + 0.5);
      if (!v) {
        const mat = toon(MATS[b.mat].color, { map: patternOf(b.mat) });
        const mesh = outlined(BLOCK_GEO[b.mat] ?? GEO.block, mat, 0.05);
        // new blocks drop in from above; lower blocks of a piece lead, so it lands bottom-first
        const pos = target.clone().add(new THREE.Vector3(0, 4.5, 0));
        mesh.position.copy(pos);
        mesh.visible = false;
        mesh.userData.blockId = b.id;
        mesh.userData.cell = { x, y };
        this.blockRoot.add(mesh);
        mat.emissive.setHex(MATS[b.mat].color).multiplyScalar(this.nightAmt * (MATS[b.mat].turret ? 0.38 : 0.14));
        v = { mesh, mat, target, emblem: null, matId: b.mat, x, y, pos, vy: 0, delay: z * 0.035 + Math.random() * 0.04, tip: null, sq: 0, sqv: 0, flash: 0, emblemAge: 1, emblemOut: null, emblemOutAge: 0, emblemBase: 1 };
        this.blockViews.set(b.id, v);
      } else if (Math.hypot(target.x - v.pos.x, target.z - v.pos.z) > 0.3 && !v.tip) {
        v.tip = this.makeTip(v.pos, target);
      }
      v.target.copy(target);
      if (v.tip) v.tip.to.copy(target);
      // gilded blocks wear a gold outline instead of the ink one
      const hull = v.mesh.children[0] as THREE.Mesh;
      if (b.gilded && hull.material !== goldOutline) { hull.material = goldOutline; hull.scale.multiplyScalar(1.04); }
      // an overhang gets a timber beam underneath, so it reads as a bridge and not a glitch
      const hollow = z > 0 && !board.blockAt(x, y, z - 1);
      const strut = v.mesh.getObjectByName('strut');
      if (hollow && !strut) {
        const beam = outlined(GEO.strut, timberMat(), 0.03, false);
        beam.name = 'strut';
        beam.position.y = -0.5;
        beam.raycast = noRaycast;
        v.mesh.add(beam);
      } else if (!hollow && strut) v.mesh.remove(strut);
      // the emblem on a stack's top block grows with the stack
      let stack = 0;
      while (z - stack - 1 >= 0 && board.blockAt(x, y, z - stack - 1)?.mat === b.mat) stack++;
      v.emblemBase = 1 + 0.22 * Math.min(4, stack);
      v.x = x; v.y = y;
      v.mesh.userData.cell = { x, y };
      const topOpen = !board.blockAt(x, y, z + 1);
      if (topOpen && !v.emblem) {
        v.emblem = this.makeEmblem(b.mat);
        if (v.emblem) { v.mesh.add(v.emblem); v.emblemAge = 0; v.emblem.scale.setScalar(0.001); }
      } else if (!topOpen && v.emblem) {
        if (v.emblemOut) v.mesh.remove(v.emblemOut);
        v.emblemOut = v.emblem;
        v.emblemOutAge = 0;
        v.emblem = null;
      }
    }
    for (const [id, v] of this.blockViews) {
      if (seen.has(id)) continue;
      this.blockRoot.remove(v.mesh);
      v.mesh.visible = true;
      this.scene.add(v.mesh);
      const to = this.tossing.get(id);
      this.tossing.delete(id);
      if (to) this.dying.push({ mesh: v.mesh, mat: v.mat, t: 0, toss: { pos: v.pos, tip: this.makeTip(v.pos, to), vy: 0 } });
      else {
        // destroyed blocks swell for a beat, then burst (anticipation before the pop)
        v.mesh.quaternion.identity();
        this.dying.push({ mesh: v.mesh, mat: v.mat, t: 0 });
      }
      this.blockViews.delete(id);
    }
  }

  /** Circular swing around the base edge between two resting spots (see Tip). */
  private makeTip(from: THREE.Vector3, to: THREE.Vector3): Tip | null {
    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const D = dir.length();
    if (D < 0.3) return null;
    dir.divideScalar(D);
    const hy = Math.min(from.y, to.y) - 0.5;
    const a = from.y - hy, b = to.y - hy;
    const sd = (D * D + b * b - a * a) / (2 * D);
    const pivot = new THREE.Vector3(from.x, hy, from.z).addScaledVector(dir, sd);
    const f0 = Math.atan2(a, -sd), f1 = Math.atan2(b, D - sd);
    return {
      pivot, dir, axis: new THREE.Vector3().crossVectors(UP, dir).normalize(),
      r0: Math.hypot(sd, a), r1: Math.hypot(D - sd, b), f0, f1, t: 0, dur: TOPPLE_SWING, to: to.clone(),
    };
  }

  /** Ease-in swing: tipping starts slow and accelerates, like a real fall. */
  private swing(tp: Tip, p: THREE.Vector3, mesh: THREE.Object3D, dt: number) {
    tp.t = Math.min(1, tp.t + dt / tp.dur);
    const e = tp.t * tp.t;
    const f = tp.f0 + (tp.f1 - tp.f0) * e, r = tp.r0 + (tp.r1 - tp.r0) * e;
    p.copy(tp.pivot).addScaledVector(tp.dir, r * Math.cos(f)).addScaledVector(UP, r * Math.sin(f));
    mesh.quaternion.setFromAxisAngle(tp.axis, tp.f0 - f);
  }

  /** A block hit the ground: squash, and kick up dust if it came in fast. */
  private land(v: BlockView, speed: number) {
    v.sqv += Math.min(9, 2 + speed * 0.45);
    if (speed > 5) this.puff(v.pos.clone().setY(v.pos.y - 0.45), speed > 9 ? 4 : 2);
    if (v.emblem) { v.emblemAge = 0; v.emblem.scale.setScalar(0.001); }
  }

  /** These blocks are about to leave the board by tipping off the edge: animate the fall instead of a pop. */
  tossBlocks(list: { id: number; to: THREE.Vector3 }[]) {
    for (const { id, to } of list) this.tossing.set(id, to);
  }

  /** Recoil a block (a turret firing). */
  kickBlock(id: number, amount = 2.5) {
    const v = this.blockViews.get(id);
    if (v) v.sqv += amount;
  }

  /** Refresh per-block tint from HP and hit flashes. */
  tintBlocks(board: Board) {
    const dark = new THREE.Color(0x3a2a3a);
    for (const { b } of board.blocks()) {
      const v = this.blockViews.get(b.id);
      if (!v) continue;
      const c = new THREE.Color(MATS[b.mat].color).lerp(dark, (1 - b.hp / b.maxHp) * 0.55);
      if (b.flash > 0) c.lerp(new THREE.Color(0xffffff), Math.min(1, b.flash * 6));
      if (b.flash > v.flash + 0.01) v.sqv += 1.6;
      v.flash = b.flash;
      v.mat.color.copy(c);
    }
  }

  private makeEmblem(mat: MatId): THREE.Object3D | null {
    const g = new THREE.Group();
    const col = new THREE.Color(MATS[mat].color);
    if (mat === 'crystal') {
      const m = outlined(GEO.gem, toon(col.clone().offsetHSL(0, 0, 0.15).getHex()), 0.04);
      m.position.y = 0.78;
      m.userData.spin = 1.5;
      g.add(m);
    } else if (mat === 'ember') {
      const m = outlined(GEO.flame, toon(0xff5b3a, { emissive: 0x662200 }), 0.04);
      m.position.y = 0.66;
      m.userData.bob = true;
      g.add(m);
    } else if (mat === 'garden') {
      for (const [dx, dz] of [[-0.18, -0.12], [0.16, 0.14]]) {
        const m = outlined(GEO.tree, toon(0x3f8f4a), 0.03);
        m.position.set(dx, 0.62, dz);
        g.add(m);
      }
    } else if (mat === 'ward') {
      const m = outlined(GEO.ring, toon(0xd9c6ff), 0.03);
      m.position.y = 0.72;
      m.rotation.x = Math.PI / 2;
      m.userData.spin = 1;
      g.add(m);
    } else if (mat === 'beacon') {
      const m = outlined(GEO.orb, toon(0xfff1a6, { emissive: 0x806010 }), 0.03);
      m.position.y = 0.7;
      m.userData.bob = true;
      g.add(m);
    } else if (mat === 'anvil') {
      const m = outlined(GEO.anvil, toon(0x34354a), 0.03);
      m.position.y = 0.58;
      g.add(m);
    } else if (mat === 'bell') {
      const m = outlined(GEO.bell, toon(0xf2c45a), 0.03);
      m.position.y = 0.7;
      m.userData.swing = true;
      g.add(m);
    } else if (mat === 'keg') {
      const m = outlined(GEO.flame, toon(0xffd34a, { emissive: 0x804000 }), 0.03);
      m.position.y = 0.62;
      m.scale.setScalar(0.6);
      m.userData.bob = true;
      g.add(m);
    } else if (mat === 'omen') {
      const m = outlined(GEO.gem, toon(0x9b7bff, { emissive: 0x2a1060 }), 0.04);
      m.position.y = 0.8;
      m.userData.spin = -2;
      g.add(m);
    } else if (mat === 'fountain') {
      const m = outlined(GEO.orb, toon(0xc9f5ff, { emissive: 0x206070 }), 0.03);
      m.position.y = 0.72;
      m.userData.bob = true;
      g.add(m);
    } else if (mat === 'ballista') {
      const bow = outlined(new THREE.BoxGeometry(0.7, 0.07, 0.1), toon(0x6b4a32), 0.03);
      bow.position.y = 0.66;
      const bolt = outlined(new THREE.ConeGeometry(0.06, 0.5, 5).rotateX(Math.PI / 2), toon(0xe0e0e0), 0.03);
      bolt.position.set(0, 0.7, 0.1);
      g.add(bow, bolt);
      g.userData.spin = 0;
    } else if (mat === 'spikes') {
      for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22], [0, 0]]) {
        const m = outlined(new THREE.ConeGeometry(0.09, 0.3, 4), toon(0xd8d8e0), 0.03);
        m.position.set(dx, 0.62, dz);
        g.add(m);
      }
    } else if (mat === 'vane') {
      const pole = outlined(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), toon(0x55566a), 0.02);
      pole.position.y = 0.68;
      const arrow = outlined(new THREE.ConeGeometry(0.1, 0.42, 3).rotateZ(Math.PI / 2), toon(0xf2c45a), 0.03);
      arrow.position.y = 0.86;
      arrow.userData.spin = 1.4;
      g.add(pole, arrow);
    } else if (mat === 'rootheart') {
      const m = outlined(GEO.orb, toon(0x9be07a, { emissive: 0x1e4010 }), 0.03);
      m.position.y = 0.72;
      m.scale.setScalar(1.4);
      m.userData.bob = true;
      g.add(m);
    } else if (mat === 'lodestone') {
      const m = outlined(new THREE.TorusGeometry(0.2, 0.07, 6, 12, Math.PI), toon(0xc8433a), 0.03);
      m.position.y = 0.66;
      m.userData.swing = true;
      g.add(m);
    } else if (mat === 'hourglass') {
      const top = outlined(new THREE.ConeGeometry(0.17, 0.22, 6).rotateX(Math.PI), toon(0xf6e2a8), 0.03);
      const bot = outlined(new THREE.ConeGeometry(0.17, 0.22, 6), toon(0xf6e2a8), 0.03);
      top.position.y = 0.88; bot.position.y = 0.64;
      g.add(top, bot);
      g.userData.spin = 0;
    } else if (mat === 'mirror') {
      const m = outlined(GEO.mirror, toon(0xffffff, { emissive: 0x404a55 }), 0.03);
      m.position.y = 0.78;
      m.userData.spin = 1.2;
      g.add(m);
    } else return null;
    g.traverse(o => { if (o instanceof THREE.Mesh) o.raycast = noRaycast; });
    return g;
  }

  // ---------- ghost & overlays ----------

  setGhost(cells: { x: number; y: number; z: number; mat: MatId }[], ok: boolean) {
    for (const o of this.ghostRoot.children) disposeTree(o);
    this.ghostRoot.clear();
    if (!cells.length) return this.clearGhost();
    const anchor = new THREE.Vector3();
    for (const c of cells) anchor.add(world(c.x, c.y, c.z + 0.5));
    anchor.divideScalar(cells.length);
    if (this.ghostAnchor) {
      this.ghostOffset.add(this.ghostAnchor.clone().sub(anchor));
      if (this.ghostOffset.length() > 4) this.ghostOffset.set(0, 0, 0);
    } else this.ghostAge = 0;
    this.ghostAnchor = anchor;
    for (const c of cells) {
      const col = new THREE.Color(MATS[c.mat].color);
      if (!ok) col.lerp(new THREE.Color(PALETTE.ghostBad), 0.7);
      const m = new THREE.Mesh(GEO.ghost, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: ok ? 0.62 : 0.45, depthWrite: false }));
      m.position.copy(world(c.x, c.y, c.z + 0.5)).sub(anchor);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(GEO.ghost), new THREE.LineBasicMaterial({ color: ok ? 0xffffff : PALETTE.ghostBad }));
      m.add(edges);
      this.ghostRoot.add(m);
      // drop shadow column marker on the ground
      const mark = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: ok ? PALETTE.ghostOk : PALETTE.ghostBad, transparent: true, opacity: 0.35, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2;
      mark.scale.setScalar(0.42);
      mark.position.copy(world(c.x, c.y, 0.02)).sub(anchor);
      this.ghostRoot.add(mark);
    }
    this.placeGhost(0);
  }

  /** Turn the ghost a quarter: it spins into its new orientation instead of snapping. */
  spinGhost() { this.ghostSpin += Math.PI / 2; }

  private placeGhost(dt: number) {
    this.ghostOffset.multiplyScalar(Math.exp(-dt * 20));
    this.ghostSpin *= Math.exp(-dt * 16);
    this.ghostAge = Math.min(1, this.ghostAge + dt / 0.18);
    if (!this.ghostAnchor) return;
    this.ghostRoot.position.copy(this.ghostAnchor).add(this.ghostOffset);
    this.ghostRoot.position.y += Math.sin(this.time * 3) * 0.035;
    this.ghostRoot.rotation.y = this.ghostSpin;
    const k = easeOutBack(this.ghostAge);
    this.ghostRoot.scale.setScalar(Math.max(0.001, 0.7 + 0.3 * k));
    fadeTree(this.ghostRoot, clamp01(this.ghostAge * 1.5));
  }

  /** The ghost fades and shrinks away rather than blinking out. */
  clearGhost() {
    if (this.ghostRoot.children.length) {
      const g = new THREE.Group();
      g.position.copy(this.ghostRoot.position);
      g.rotation.copy(this.ghostRoot.rotation);
      g.scale.copy(this.ghostRoot.scale);
      g.add(...this.ghostRoot.children);
      this.scene.add(g);
      this.ghostFading.push({ g, t: 0 });
    }
    this.ghostAnchor = null;
    this.ghostOffset.set(0, 0, 0);
    this.ghostSpin = 0;
  }

  setRanges(rings: { x: number; y: number; r: number; color: number }[]) {
    const keep = new Set<string>();
    for (const r of rings) {
      const key = `${r.x},${r.y},${r.r.toFixed(2)},${r.color}`;
      keep.add(key);
      const live = this.ringRoot.children.find(m => m.userData.key === key && m.userData.leave === undefined);
      if (live) continue;
      const m = new THREE.Mesh(GEO.rangeRing, new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(0.001);
      m.userData.r = r.r;
      m.userData.age = 0;
      m.userData.key = key;
      m.position.copy(world(r.x, r.y, 0.03));
      const fill = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.08, depthWrite: false }));
      m.add(fill);
      this.ringRoot.add(m);
    }
    for (const m of this.ringRoot.children) if (!keep.has(m.userData.key)) m.userData.leave ??= 0;
  }

  setTelegraph(sides: number[]) {
    for (const o of this.telegraphRoot.children) if (!sides.includes(o.userData.side)) o.userData.leave ??= 0;
    const mat = toon(0xffe14a, { emissive: 0xb88a00 });
    for (const s of sides) {
      if (this.telegraphRoot.children.some(o => o.userData.side === s && o.userData.leave === undefined)) continue;
      const a = outlined(GEO.arrow, mat, 0.05, false);
      // the arrows float out past the island's edge, clear of the HUD
      const d = C + 3.1;
      const pos = [new THREE.Vector3(0, 1.3, -d), new THREE.Vector3(d, 1.3, 0), new THREE.Vector3(0, 1.3, d), new THREE.Vector3(-d, 1.3, 0)][s];
      a.position.copy(pos);
      a.rotation.x = Math.PI / 2;
      a.rotation.order = 'YXZ';
      a.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][s];
      a.userData.basePos = pos.clone();
      a.userData.age = -s * 0.08;
      a.userData.side = s;
      a.scale.setScalar(1.4);
      this.telegraphRoot.add(a);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(N, 0.6), new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.45, depthWrite: false }));
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.order = 'YXZ';
      strip.rotation.y = s % 2 ? Math.PI / 2 : 0;
      const e = C + 0.2;
      strip.position.copy([new THREE.Vector3(0, 0.02, -e), new THREE.Vector3(e, 0.02, 0), new THREE.Vector3(0, 0.02, e), new THREE.Vector3(-e, 0.02, 0)][s]);
      strip.userData.strip = true;
      strip.userData.side = s;
      strip.userData.age = 0;
      this.telegraphRoot.add(strip);
    }
  }

  // ---------- picking ----------

  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.blockRoot.children, false);
    if (hits.length && hits[0].face) {
      const h = hits[0];
      const n = h.face!.normal.clone().transformDirection(h.object.matrixWorld);
      const p = h.point.clone().addScaledVector(n, n.y > 0.5 ? -0.01 : 0.5);
      return this.cellOf(p);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    return this.cellOf(p);
  }

  /** The column of the block under the pointer (any face), for acting on existing towers. */
  pickBlock(clientX: number, clientY: number): { x: number; y: number; id: number } | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.blockRoot.children, false)[0];
    return hit ? { ...(hit.object.userData.cell as { x: number; y: number }), id: hit.object.userData.blockId as number } : null;
  }

  private cellOf(p: THREE.Vector3) {
    const x = Math.round(p.x + C), y = Math.round(p.z + C);
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    return { x, y };
  }

  // ---------- enemies ----------

  makeEnemy(type: EnemyId): EnemyView {
    const root = new THREE.Group();
    const def = ENEMIES[type];
    const mat = toon(def.color);
    const body = outlined(ENEMY_GEO[type], mat, type === 'boss' ? 0.1 : 0.05);
    root.add(body);
    // a faint silhouette drawn over everything, so enemies behind towers never vanish
    const ghost = new THREE.Mesh(ENEMY_GEO[type], new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }));
    ghost.renderOrder = 26;
    ghost.raycast = noRaycast;
    body.add(ghost);
    if (type === 'boss') {
      for (let i = 0; i < 4; i++) {
        const o = outlined(new THREE.TetrahedronGeometry(0.25), toon(0xe8475e), 0.04);
        o.userData.orbit = i;
        body.add(o);
      }
    }
    const hpBar = new THREE.Group();
    const w = type === 'boss' ? 1.8 : 0.95;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.07, 0.17), new THREE.MeshBasicMaterial({ color: PALETTE.outline, depthTest: false }));
    const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.11), new THREE.MeshBasicMaterial({ color: 0xff5470, depthTest: false }));
    hpFill.geometry.translate(w / 2, 0, 0);
    hpFill.position.x = -w / 2;
    hpFill.position.z = 0.002;
    // the white chip trails behind the red bar, so you can see how big each hit was
    const hpLag = new THREE.Mesh(hpFill.geometry, new THREE.MeshBasicMaterial({ color: 0xfff6e6, depthTest: false }));
    hpLag.position.x = -w / 2;
    hpLag.position.z = 0.001;
    bg.renderOrder = 10; hpLag.renderOrder = 11; hpFill.renderOrder = 12;
    hpBar.add(bg, hpLag, hpFill);
    hpBar.position.y = def.size + 0.45;
    hpBar.visible = false;
    root.add(hpBar);
    root.scale.setScalar(0.001);
    this.scene.add(root);
    const gait = type === 'flier' || type === 'bomber' || type === 'leviathan' || type === 'boss' ? 'hover' : type === 'wyrm' ? 'slither' : 'hop';
    return { root, body, mat, hpBar, hpFill, hpLag, gait, bornAt: this.time, lastT: this.time, lastHp: 1, lag: 1, punch: 0, barAge: 0 };
  }

  /** Elites are bigger and wear a spinning gold halo. */
  markElite(v: EnemyView) {
    v.body.scale.setScalar(1.3);
    const halo = outlined(GEO.ring, toon(0xf2c45a, { emissive: 0x604000 }), 0.03, false);
    halo.rotation.x = Math.PI / 2;
    halo.scale.setScalar(1.6);
    halo.position.y = 0.35;
    halo.userData.orbit = undefined;
    halo.raycast = noRaycast;
    v.root.add(halo);
    v.hpBar.position.y += 0.2;
  }

  updateEnemy(v: EnemyView, pos: THREE.Vector3, hpFrac: number, flash: number, slowed: boolean, color: number, t: number) {
    const dt = this.time - v.lastT;
    v.lastT = this.time;
    v.root.position.copy(pos);
    // spawn: pop up out of the ground with a little overshoot
    const grow = easeOutBack(clamp01((this.time - v.bornAt) / 0.4));
    if (hpFrac < v.lastHp - 1e-4) v.punch = 1;
    v.lastHp = hpFrac;
    v.punch = Math.max(0, v.punch - dt * 7);
    v.lag = Math.max(hpFrac, v.lag - dt * 0.7);
    // walkers hop and squash on each footfall; fliers bob
    let sy = 1, sxz = 1, lift = 0;
    if (v.gait === 'hop') {
      const h = Math.abs(Math.sin(t * 7));
      const contact = (1 - h) * (1 - h);
      lift = h * 0.13;
      sy = 1 - 0.14 * contact; sxz = 1 + 0.07 * contact;
    } else if (v.gait === 'hover') {
      lift = Math.sin(t * 3) * 0.08;
    } else {
      sxz = 1 + Math.sin(t * 5) * 0.06; sy = 1 - Math.sin(t * 5) * 0.06;
    }
    sy *= 1 - 0.28 * v.punch; sxz *= 1 + 0.22 * v.punch;
    const k = Math.max(0.001, grow) * ENEMY_SCALE;
    v.root.scale.set(k * sxz, k * sy, k * sxz);
    v.root.position.y += lift;
    v.hpBar.scale.set(1 / Math.max(0.2, k * sxz), 1 / Math.max(0.2, k * sy), 1);
    v.body.rotation.y = t * 1.5;
    v.body.rotation.x = Math.sin(t * 2) * 0.2;
    for (const c of v.body.children) {
      if (c.userData.orbit !== undefined) {
        const a = t * 2 + c.userData.orbit * (Math.PI / 2);
        c.position.set(Math.cos(a) * 1.5, Math.sin(t * 3 + c.userData.orbit) * 0.3, Math.sin(a) * 1.5);
      }
    }
    const col = new THREE.Color(color);
    if (slowed) col.lerp(new THREE.Color(MATS.ward.color), 0.45);
    if (flash > 0) col.lerp(new THREE.Color(0xffffff), Math.min(1, flash * 8));
    v.mat.color.copy(col);
    v.hpBar.visible = hpFrac < 0.999;
    if (v.hpBar.visible) {
      v.barAge = Math.min(1, v.barAge + dt / 0.25);
      v.hpBar.scale.multiplyScalar(Math.max(0.001, easeOutBack(v.barAge)));
    }
    v.hpFill.scale.x = Math.max(0.001, hpFrac);
    v.hpLag.scale.x = Math.max(0.001, v.lag);
    v.hpBar.quaternion.copy(this.camera.quaternion);
  }

  removeEnemy(v: EnemyView, color: number, burst = true) {
    if (burst) { v.hpBar.visible = false; this.dyingEnemies.push({ v, color, t: 0 }); return; }
    this.scene.remove(v.root);
    v.mat.dispose();
  }

  // ---------- effects ----------

  beam(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    if (PERF) return;
    const m = new THREE.Mesh(GEO.beam, new THREE.MeshBasicMaterial({ color, transparent: true }));
    const d = to.clone().sub(from);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.scene.add(m);
    this.fxList.push({ obj: m, life: 0.12, max: 0.12, kind: 'fade' });
  }

  /** A turret shot: muzzle flash, a thick bolt, sparks where it lands. */
  shot(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    if (PERF) return;
    const m = new THREE.Mesh(GEO.bolt, new THREE.MeshBasicMaterial({ color, transparent: true }));
    const d = to.clone().sub(from);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    this.scene.add(m);
    this.fxList.push({ obj: m, life: 0.14, max: 0.14, kind: 'fade' });
    const f = new THREE.Mesh(GEO.flash, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    f.position.copy(from);
    this.scene.add(f);
    this.fxList.push({ obj: f, life: 0.12, max: 0.12, kind: 'flash' });
    this.spark(to, color, 3);
  }

  /** Bright chips flying off a hit. */
  spark(pos: THREE.Vector3, color: number, n: number) {
    if (PERF) return;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(GEO.spark, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4);
      this.scene.add(m);
      this.fxList.push({ obj: m, life: 0.3, max: 0.3, vel, kind: 'spark' });
    }
  }

  /** A fading ember left behind a flying shell. */
  trail(pos: THREE.Vector3, color: number) {
    if (PERF) return;
    const m = new THREE.Mesh(GEO.flash, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.copy(pos);
    m.scale.setScalar(0.5);
    this.scene.add(m);
    this.fxList.push({ obj: m, life: 0.3, max: 0.3, kind: 'puff', vel: new THREE.Vector3() });
  }

  /** Weather you can see: fog rolls in, rain falls, a big moon rises. */
  setWeather(w: string | null) {
    this.weather = w;
    document.body.dataset.weather = w ?? '';
    if (w === 'storm' && !this.rain) {
      const n = 700, pts = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 26, y = Math.random() * 22, z = (Math.random() - 0.5) * 26;
        pts.set([x, y, z, x + 0.08, y - 0.6, z + 0.04], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0, depthWrite: false }));
      this.rain.raycast = noRaycast;
      this.scene.add(this.rain);
    }
    if (w === 'moon' && !this.moon) {
      this.moon = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf6f0d2, transparent: true, opacity: 0, fog: false }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(4.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf6f0d2, transparent: true, opacity: 0, side: THREE.BackSide, fog: false }));
      halo.userData.halo = true;
      this.moon.add(disc, halo);
      this.moon.position.set(-26, 20, -26);
      this.scene.add(this.moon);
    }
  }

  private updateWeather(dt: number) {
    const fogOn = this.weather === 'fog' ? 1 : 0;
    this.fogK += (fogOn - this.fogK) * Math.min(1, dt * 1.5);
    if (this.fogK > 0.01) {
      if (!this.scene.fog) this.scene.fog = new THREE.Fog(0x3a3460, 30, 80);
      const f = this.scene.fog as THREE.Fog;
      f.near = 30 - this.fogK * 14;
      f.far = 80 - this.fogK * 46;
    } else if (this.scene.fog) this.scene.fog = null;
    if (this.rain) {
      const m = this.rain.material as THREE.LineBasicMaterial;
      m.opacity += ((this.weather === 'storm' ? 0.55 : 0) - m.opacity) * Math.min(1, dt * 2);
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i += 2) {
        let y = p.getY(i) - dt * 26;
        if (y < -1) y += 22;
        p.setY(i, y);
        p.setY(i + 1, y - 0.6);
      }
      p.needsUpdate = true;
      if (m.opacity < 0.01 && this.weather !== 'storm') { this.scene.remove(this.rain); disposeTree(this.rain); this.rain = null; }
    }
    if (this.moon) {
      const on = this.weather === 'moon' ? 1 : 0;
      for (const c of this.moon.children) {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity += ((c.userData.halo ? 0.18 : 0.95) * on - m.opacity) * Math.min(1, dt * 1.5);
      }
      const disc = (this.moon.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (!on && disc.opacity < 0.01) { this.scene.remove(this.moon); disposeTree(this.moon); this.moon = null; }
    }
  }

  /** Swirling gates open on the attacking sides at dusk and close at dawn. */
  setGates(sides: number[]) {
    for (const g of this.gateRoot.children) g.userData.leave ??= 0;
    for (const s of sides) {
      const d = C + 2.2;
      const pos = [new THREE.Vector3(0, 2.4, -d), new THREE.Vector3(d, 2.4, 0), new THREE.Vector3(0, 2.4, d), new THREE.Vector3(-d, 2.4, 0)][s];
      const ring = outlined(GEO.gate, toon(0xc04aff, { emissive: 0x6a1a9a }), 0.04, false);
      ring.position.copy(pos);
      ring.rotation.y = s % 2 ? Math.PI / 2 : 0;
      ring.userData.age = 0;
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.88, 32), new THREE.MeshBasicMaterial({ color: 0x2a0a40, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      ring.add(core);
      this.gateRoot.add(ring);
    }
  }

  /** Swing the camera toward a point for a moment, then back. */
  cinematic(point: THREE.Vector3, dur: number, pull = 0.55) { this.cine = { point, t: 0, dur, pull }; }

  /** The island flies to a new land: clouds rush past and the camera rises. */
  journeyFx(dur: number) {
    this.cinematic(new THREE.Vector3(0, 9, 0), dur, 0.8);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + Math.random() * 1.8, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 9;
      m.position.set(Math.cos(a) * r, 16 + Math.random() * 14, Math.sin(a) * r);
      m.scale.set(1.6, 0.8, 1.2);
      this.scene.add(m);
      const life = dur * (0.6 + Math.random() * 0.4);
      this.fxList.push({ obj: m, life, max: life, vel: new THREE.Vector3(0, -(22 + Math.random() * 10), 0), kind: 'cloud' });
    }
    this.shakeCam(0.4);
  }

  lightning(from: THREE.Vector3, to: THREE.Vector3) {
    if (PERF) return;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = from.clone().lerp(to, i / 8);
      if (i > 0 && i < 8) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      pts.push(p);
    }
    for (let i = 0; i < 8; i++) this.beam(pts[i], pts[i + 1], 0xfff6a0);
    this.shake = Math.max(this.shake, 0.15);
  }

  makeShell(): THREE.Mesh {
    const m = outlined(GEO.shell, toon(0xff7a3a, { emissive: 0x662000 }), 0.04, false);
    this.scene.add(m);
    return m;
  }

  remove(o: THREE.Object3D) { this.scene.remove(o); }

  ring(pos: THREE.Vector3, radius: number, color: number, dur = 0.4) {
    if (PERF) return;
    const m = new THREE.Mesh(GEO.rangeRing, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.position.y = Math.max(0.05, pos.y);
    m.scale.setScalar(0.1);
    m.userData.radius = radius;
    this.scene.add(m);
    this.fxList.push({ obj: m, life: dur, max: dur, kind: 'ring' });
  }

  private debrisMats = new Map<number, THREE.Material>();

  debris(pos: THREE.Vector3, color: number, count: number) {
    if (PERF) return;
    let mat = this.debrisMats.get(color);
    if (!mat) { mat = toon(color); this.debrisMats.set(color, mat); }
    for (let i = 0; i < count; i++) {
      const m = outlined(GEO.debris, mat, 0.03, false);
      m.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5);
      this.scene.add(m);
      this.fxList.push({ obj: m, life: 0.9, max: 0.9, vel, spin: (Math.random() - 0.5) * 12, kind: 'debris' });
    }
  }

  /** Soft dust clouds where something heavy lands. */
  puff(pos: THREE.Vector3, count: number) {
    if (PERF) return;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(GEO.puff, new THREE.MeshBasicMaterial({ color: 0xfff6e6, transparent: true, opacity: 0.8, depthWrite: false }));
      const a = (i / count) * Math.PI * 2 + Math.random();
      m.position.copy(pos).add(new THREE.Vector3(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3));
      m.scale.set(1, 0.6, 1);
      const vel = new THREE.Vector3(Math.cos(a) * 1.6, 0.5, Math.sin(a) * 1.6);
      this.scene.add(m);
      this.fxList.push({ obj: m, life: 0.5, max: 0.5, vel, kind: 'puff' });
    }
  }

  floatText(pos: THREE.Vector3, text: string, color: string) {
    if (PERF) return;
    const canvas = document.createElement('canvas');
    const font = 'bold 40px "Trebuchet MS", sans-serif';
    const measure = canvas.getContext('2d')!;
    measure.font = font;
    // wide enough for the whole label ("−2 Bulwark"), not just short numbers
    canvas.width = Math.max(128, Math.ceil(measure.measureText(text).width + 24)); canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#221a33';
    ctx.strokeText(text, canvas.width / 2, 46);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, 46);
    const tex = new THREE.CanvasTexture(canvas);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(0.001, 0.001, 1);
    s.userData.w = canvas.width / 128;
    s.position.copy(pos);
    s.renderOrder = 20;
    this.scene.add(s);
    this.fxList.push({ obj: s, life: 1.1, max: 1.1, kind: 'float' });
  }

  coreHit() { this.coreFlash = 0.4; this.shake = 0.35; this.coreSqv += 7; }
  shakeCam(a: number) { this.shake = Math.max(this.shake, a); }

  // ---------- frame ----------

  update(realDt: number, simDt: number) {
    this.time += realDt;
    const t = this.time;
    // board motion runs on game time, so a 3x night still lands topples when the sim does
    const dt = Math.min(simDt, 0.1);
    for (const v of this.blockViews.values()) {
      if (v.delay > 0) { v.delay -= dt; continue; }
      v.mesh.visible = true;
      const p = v.pos;
      let stretch = 0;
      if (v.tip) {
        const tp = v.tip;
        this.swing(tp, p, v.mesh, dt);
        if (tp.t >= 1) {
          p.copy(tp.to);
          v.mesh.quaternion.identity();
          v.tip = null;
          v.vy = 0;
          this.land(v, 10);
        }
      } else {
        p.x += (v.target.x - p.x) * Math.min(1, dt * 14);
        p.z += (v.target.z - p.z) * Math.min(1, dt * 14);
        if (p.y > v.target.y + 1e-4) {
          v.vy += GRAVITY * dt;
          p.y -= v.vy * dt;
          stretch = Math.min(0.22, v.vy * 0.014);
          if (p.y <= v.target.y) { p.y = v.target.y; this.land(v, v.vy); v.vy = 0; stretch = 0; }
        } else p.y += (v.target.y - p.y) * Math.min(1, dt * 14);
      }
      // squash spring (semi-implicit Euler stays stable at frame-rate dt)
      for (let n = Math.ceil(dt / (1 / 60)), h = dt / n; n > 0; n--) {
        v.sqv += (-380 * v.sq - 15 * v.sqv) * h;
        v.sq = Math.max(-0.3, Math.min(0.35, v.sq + v.sqv * h));
      }
      const sy = (1 - v.sq * 0.8) * (1 + stretch), sxz = (1 + v.sq * 0.4) / Math.sqrt(1 + stretch);
      v.mesh.scale.set(sxz, sy, sxz);
      // squash about the block's base, not its middle, so it stays planted
      v.mesh.position.set(p.x, p.y - (1 - sy) * 0.47, p.z);
      const combo = v.mesh.getObjectByName('combo');
      if (combo) {
        combo.rotation.y += realDt * 3;
        combo.userData.age += realDt;
        combo.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(combo.userData.age / 0.35)) * (1 + Math.sin(t * 5) * 0.12)));
      }
      if (v.emblemOut) {
        v.emblemOutAge += dt / 0.2;
        v.emblemOut.scale.setScalar(Math.max(0.001, 1 - easeInCubic(clamp01(v.emblemOutAge))));
        if (v.emblemOutAge >= 1) { v.mesh.remove(v.emblemOut); v.emblemOut = null; }
      }
      if (v.emblem && v.emblemAge < 1) {
        v.emblemAge += dt / 0.4;
        v.emblem.scale.setScalar(Math.max(0.001, v.emblemBase * easeOutBack(clamp01(v.emblemAge))));
      } else if (v.emblem) v.emblem.scale.setScalar(v.emblemBase);
      if (v.emblem) {
        v.emblem.traverse(o => {
          if (o.userData.spin) o.rotation.y += realDt * o.userData.spin;
          if (o.userData.bob) o.scale.setScalar(1 + Math.sin(t * 6 + v.x) * 0.08);
          if (o.userData.swing) o.rotation.z = Math.sin(t * 2.5 + v.x) * 0.25;
        });
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      if (d.toss) {
        // swing over the edge, then keep falling and tumbling until it is out of sight
        const ts = d.toss;
        if (ts.tip && ts.tip.t < 1) this.swing(ts.tip, ts.pos, d.mesh, dt);
        else {
          ts.vy += GRAVITY * dt;
          ts.pos.y -= ts.vy * dt;
          if (ts.tip) ts.pos.addScaledVector(ts.tip.dir, dt * 2.5);
          d.mesh.rotateX(dt * 4);
        }
        d.mesh.position.copy(ts.pos);
        if (ts.pos.y < -4) d.mesh.scale.setScalar(Math.max(0.001, 1 + (ts.pos.y + 4) / 3));
        if (ts.pos.y < -7) { this.scene.remove(d.mesh); d.mat.dispose(); this.dying.splice(i, 1); }
        continue;
      }
      if (d.quiet !== undefined) {
        // a whole board being cleared: blocks sink and shrink away in a ripple, no fireworks
        const k = clamp01((d.t - d.quiet) / 0.28);
        d.mesh.scale.setScalar(Math.max(0.001, 1 - easeInCubic(k)));
        d.mesh.position.y -= dt * 1.5 * k;
        if (k >= 1) { this.scene.remove(d.mesh); d.mat.dispose(); this.dying.splice(i, 1); }
        continue;
      }
      if (d.t < 0.08) {
        const k = d.t / 0.08;
        d.mesh.scale.setScalar(1 + 0.16 * k);
        d.mat.color.lerp(new THREE.Color(0xffffff), k * 0.5);
      } else {
        if (!d.mesh.userData.burst) { d.mesh.userData.burst = true; this.debris(d.mesh.position, d.mat.color.getHex(), 7); }
        const k = clamp01((d.t - 0.08) / 0.12);
        d.mesh.scale.setScalar(Math.max(0.001, 1.16 * (1 - k * k)));
      }
      if (d.t >= 0.2) { this.scene.remove(d.mesh); d.mat.dispose(); this.dying.splice(i, 1); }
    }
    for (let i = this.dyingEnemies.length - 1; i >= 0; i--) {
      const d = this.dyingEnemies[i];
      d.t += dt;
      // a quick stretch upward (anticipation), then the burst
      const k = clamp01(d.t / 0.1);
      d.v.root.scale.set(1 - 0.3 * k, 1 + 0.45 * k, 1 - 0.3 * k);
      d.v.mat.color.lerp(new THREE.Color(0xffffff), k * 0.6);
      if (d.t >= 0.1) {
        this.debris(d.v.root.position, d.color, 9);
        this.ring(d.v.root.position.clone().setY(0.06), 0.7, d.color, 0.3);
        this.scene.remove(d.v.root);
        d.v.mat.dispose();
        this.dyingEnemies.splice(i, 1);
      }
    }
    this.placeGhost(realDt);
    this.updatePaths(realDt);
    this.updateWeather(realDt);
    for (const g of [...this.gateRoot.children]) {
      g.rotation.z += realDt * 1.5;
      if (g.userData.leave !== undefined) {
        g.userData.leave += realDt / 0.4;
        g.scale.setScalar(Math.max(0.001, 1 - easeInCubic(clamp01(g.userData.leave))));
        if (g.userData.leave >= 1) { disposeTree(g); this.gateRoot.remove(g); }
      } else {
        g.userData.age += realDt;
        g.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(g.userData.age / 0.6))));
      }
    }
    for (const l of this.linkRoot.children) ((l as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = 0.45 + Math.sin(t * 4) * 0.25;
    for (const l of this.validRoot.children) {
      l.userData.age += realDt;
      const peak = l.userData.fill ? 0.22 : 0.85;
      ((l as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = Math.min(peak, l.userData.age * 3 * peak) * (0.75 + Math.sin(t * 3) * 0.25);
    }
    for (let i = this.ghostFading.length - 1; i >= 0; i--) {
      const f = this.ghostFading[i];
      f.t += realDt / 0.16;
      f.g.scale.setScalar(Math.max(0.001, 1 - 0.3 * f.t));
      fadeTree(f.g, 1 - clamp01(f.t));
      if (f.t >= 1) { disposeTree(f.g); this.scene.remove(f.g); this.ghostFading.splice(i, 1); }
    }
    for (const m of [...this.ringRoot.children]) {
      if (m.userData.leave !== undefined) {
        m.userData.leave += realDt / 0.16;
        m.scale.setScalar(Math.max(0.001, m.userData.r * (1 - 0.35 * easeInCubic(clamp01(m.userData.leave)))));
        fadeTree(m, 1 - clamp01(m.userData.leave));
        if (m.userData.leave >= 1) { disposeTree(m); this.ringRoot.remove(m); }
        continue;
      }
      m.userData.age += realDt;
      m.scale.setScalar(Math.max(0.001, m.userData.r * easeOutBack(clamp01(m.userData.age / 0.3))));
    }
    if (this.islandTarget) {
      const k = Math.min(1, realDt * 2.5), it = this.islandTarget, im = this.islandMats;
      im.a.color.lerp(it.a, k); im.b.color.lerp(it.b, k); im.cliff.color.lerp(it.cliff, k); im.rock.color.lerp(it.rock, k);
    }
    this.coreSqv += (-300 * this.coreSq - 12 * this.coreSqv) * dt;
    this.coreSq = Math.max(-0.3, Math.min(0.4, this.coreSq + this.coreSqv * dt));
    this.core.scale.set(1 + this.coreSq * 0.4, 1 - this.coreSq * 0.7, 1 + this.coreSq * 0.4);
    this.coreGem.rotation.y += realDt * 0.8;
    this.coreGem.position.y = 1.15 + Math.sin(t * 2) * 0.08;
    const halo = this.core.getObjectByName('halo')!;
    halo.rotation.z += realDt * 0.5;
    halo.position.y = this.coreGem.position.y;
    const gemMat = this.coreGem.material as THREE.MeshToonMaterial;
    this.coreFlash = Math.max(0, this.coreFlash - realDt);
    gemMat.color.set(PALETTE.core).lerp(new THREE.Color(0xffffff), this.coreFlash * 2);

    for (const v of [...this.ventRoot.children]) {
      ((v as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3 + v.position.x) * 0.3;
      if (v.userData.leave !== undefined) {
        v.userData.leave += realDt / 0.3;
        v.scale.setScalar(Math.max(0.001, 0.42 * (1 - easeInCubic(clamp01(v.userData.leave)))));
        if (v.userData.leave >= 1) { disposeTree(v); this.ventRoot.remove(v); }
      } else {
        v.userData.age += realDt;
        v.scale.setScalar(Math.max(0.001, 0.42 * easeOutBack(clamp01(v.userData.age / 0.5))));
      }
    }
    for (const d of this.decor) {
      d.position.y = d.userData.baseY + Math.sin(t * 0.5 + d.userData.phase) * 0.4;
      d.rotation.y += realDt * 0.1;
    }
    for (const a of [...this.telegraphRoot.children]) {
      const leave = a.userData.leave as number | undefined;
      if (leave !== undefined) a.userData.leave = leave + realDt / 0.3;
      const out = leave === undefined ? 0 : clamp01(leave);
      if (out >= 1) { this.telegraphRoot.remove(a); if (a.userData.strip) disposeTree(a); continue; }
      if (a.userData.strip) {
        a.userData.age += realDt;
        const fade = clamp01(a.userData.age / 0.4) * (1 - out);
        ((a as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (0.3 + Math.sin(t * 4) * 0.15) * fade;
        continue;
      }
      const bp = a.userData.basePos as THREE.Vector3;
      const pulse = (Math.sin(t * 5) + 1) * 0.25;
      a.userData.age += dt;
      const drop = 1 - easeOutBack(clamp01(a.userData.age / 0.45));
      a.position.copy(bp).multiplyScalar(1 - pulse * 0.04);
      // arriving: drop in with a bounce; leaving: a small hop up (anticipation) and away
      a.position.y += drop * 3 + (out ? Math.sin(out * Math.PI * 0.5) * 2.5 - 0.15 * Math.sin(out * Math.PI * 2) : 0);
      a.scale.setScalar(Math.max(0.001, 1.4 * (1 - easeInCubic(out))));
    }

    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const f = this.fxList[i];
      f.life -= f.kind === 'cloud' ? realDt : simDt;
      const k = Math.max(0, f.life / f.max);
      if (f.kind === 'debris' && f.vel) {
        f.vel.y -= 14 * simDt;
        f.obj.position.addScaledVector(f.vel, simDt);
        if (f.obj.position.y < 0.05) { f.obj.position.y = 0.05; f.vel.multiplyScalar(0.5); f.vel.y = Math.abs(f.vel.y) * 0.4; }
        f.obj.rotation.x += (f.spin ?? 0) * simDt;
        f.obj.scale.setScalar(Math.min(1, k * 2));
      } else if (f.kind === 'fade') {
        ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k;
      } else if (f.kind === 'ring') {
        f.obj.scale.setScalar(0.1 + (1 - k) * f.obj.userData.radius);
        ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k;
      } else if (f.kind === 'float') {
        // pops in with overshoot, then drifts up and slows down
        const pop = Math.max(0.001, easeOutBack(clamp01((1 - k) * f.max / 0.22)));
        f.obj.scale.set(1.2 * pop * (f.obj.userData.w ?? 1), 0.6 * pop, 1);
        f.obj.position.y += realDt * 2.4 * k;
        (f.obj as THREE.Sprite).material.opacity = Math.min(1, k * 2.5);
      } else if (f.kind === 'spark' && f.vel) {
        f.vel.y -= 12 * simDt;
        f.obj.position.addScaledVector(f.vel, simDt);
        f.obj.scale.setScalar(Math.max(0.001, k));
      } else if (f.kind === 'flash') {
        f.obj.scale.setScalar(1 + (1 - k) * 1.5);
        ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k;
      } else if (f.kind === 'cloud' && f.vel) {
        f.obj.position.addScaledVector(f.vel, realDt);
        ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.min(0.75, (1 - k) * 4, k * 3);
      } else if (f.kind === 'puff' && f.vel) {
        f.vel.multiplyScalar(Math.exp(-simDt * 5));
        f.obj.position.addScaledVector(f.vel, simDt);
        const g = 1 + easeOutCubic(1 - k) * 1.6;
        f.obj.scale.set(g, g * 0.6, g);
        ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.8 * k;
      }
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        if (f.kind !== 'debris') {
          const m = (f.obj as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture };
          m.map?.dispose();
          m.dispose();
        }
        this.fxList.splice(i, 1);
      }
    }

    const ni = this.nightTarget - this.nightAmt;
    this.nightAmt += Math.sign(ni) * Math.min(Math.abs(ni), realDt * 0.8);
    const n = this.nightAmt;
    // night is cooler but keeps colours apart: blocks glow faintly in their own colour, turrets most
    this.hemi.color.set(0xfff4e0).lerp(new THREE.Color(0xc4caff), n);
    this.hemi.groundColor.set(0x8a7a9a).lerp(new THREE.Color(0x4a3e6a), n);
    this.hemi.intensity = 1.4 - n * 0.15;
    this.sun.color.set(0xffffff).lerp(new THREE.Color(0xd8ccff), n);
    this.sun.intensity = 2.2 - n * 0.6;
    if (Math.abs(n - this.glowAt) > 0.01) {
      this.glowAt = n;
      for (const v of this.blockViews.values()) v.mat.emissive.setHex(MATS[v.matId].color).multiplyScalar(n * (MATS[v.matId].turret ? 0.38 : 0.14));
    }

    const ty = this.controls.target.y;
    this.controls.target.y += (this.focusY - ty) * Math.min(1, realDt * 2);
    this.camera.position.y += this.controls.target.y - ty;
    // cinematic: ease toward the point of interest and back, moving the camera with its target
    let want = new THREE.Vector3();
    if (this.cine) {
      this.cine.t += realDt;
      const k = Math.sin(Math.PI * clamp01(this.cine.t / this.cine.dur));
      want = this.cine.point.clone().sub(this.controls.target).add(this.cineApplied).multiplyScalar(k * this.cine.pull);
      if (this.cine.t >= this.cine.dur) { this.cine = null; want.set(0, 0, 0); }
    }
    const delta = want.clone().sub(this.cineApplied);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    this.cineApplied.copy(want);
    this.controls.update();
    // performance mode: draw about four times a second
    if (PERF && (this.perfFrame = (this.perfFrame + 1) % 15) !== 0) return;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - realDt);
      const s = this.shake * 0.25;
      const off = new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.camera.position.add(off);
      this.renderer.render(this.scene, this.camera);
      this.camera.position.sub(off);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  autoOrbit(dt: number) {
    const p = this.camera.position.clone().sub(this.controls.target);
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.08);
    this.camera.position.copy(this.controls.target).add(p);
  }

  rotateView(dir: number) {
    const p = this.camera.position.clone().sub(this.controls.target);
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), dir * Math.PI / 8);
    this.camera.position.copy(this.controls.target).add(p);
  }

  /** Wipe the board for a new run: everything leaves in a ripple from the centre instead of vanishing. */
  clearAll() {
    this.setWeather(null);
    this.setGates([]);
    for (const v of this.blockViews.values()) {
      this.blockRoot.remove(v.mesh);
      v.mesh.visible = true;
      v.mesh.position.copy(v.pos);
      this.scene.add(v.mesh);
      this.dying.push({ mesh: v.mesh, mat: v.mat, t: 0, quiet: Math.hypot(v.pos.x, v.pos.z) * 0.025 + v.pos.y * 0.02 });
    }
    this.blockViews.clear();
    this.tossing.clear();
    this.clearGhost();
    this.setRanges([]);
    this.setTelegraph([]);
    this.setVents([]);
  }
}

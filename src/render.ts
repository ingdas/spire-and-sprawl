import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Board } from './board';
import { BiomeDef } from './biomes';
import { CORE, ENEMIES, EnemyId, MATS, MatId, N, PALETTE } from './config';

const C = (N - 1) / 2;
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
  shell: new THREE.IcosahedronGeometry(0.13, 0),
  debris: new THREE.TetrahedronGeometry(0.12),
  arrow: new THREE.ConeGeometry(0.45, 0.9, 3),
  anvil: new THREE.BoxGeometry(0.62, 0.2, 0.34),
  bell: new THREE.ConeGeometry(0.22, 0.32, 8, 1, true),
  mirror: new THREE.BoxGeometry(0.46, 0.46, 0.05),
};

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

interface BlockView { mesh: THREE.Mesh; mat: THREE.MeshToonMaterial; target: THREE.Vector3; emblem: THREE.Object3D | null; matId: MatId; x: number; y: number }

interface Fx { obj: THREE.Object3D; life: number; max: number; vel?: THREE.Vector3; spin?: number; kind: 'debris' | 'fade' | 'ring' | 'float'; grow?: number }

export interface EnemyView { root: THREE.Group; body: THREE.Mesh; mat: THREE.MeshToonMaterial; hpBar: THREE.Group; hpFill: THREE.Mesh }

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private blockViews = new Map<number, BlockView>();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
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
    this.scene.add(this.core, this.blockRoot, this.ghostRoot, this.ringRoot, this.telegraphRoot);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private islandMats = { a: toon(PALETTE.tileA), b: toon(PALETTE.tileB), cliff: toon(PALETTE.cliff), rock: toon(PALETTE.rock) };
  private ventRoot = new THREE.Group();
  readonly island = new THREE.Group();

  /** Repaint the island and sky for a biome. */
  setBiome(b: BiomeDef) {
    this.islandMats.a.color.set(b.tiles[0]);
    this.islandMats.b.color.set(b.tiles[1]);
    this.islandMats.cliff.color.set(b.cliff);
    this.islandMats.rock.color.set(b.rock);
    document.body.style.setProperty('--sky-a', b.sky[0]);
    document.body.style.setProperty('--sky-b', b.sky[1]);
    document.body.dataset.biome = b.id;
  }

  /** Glowing lava vent markers. */
  setVents(cells: { x: number; y: number }[]) {
    this.ventRoot.clear();
    for (const c of cells) {
      const m = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(0.42);
      m.position.copy(world(c.x, c.y, 0.015));
      m.userData.vent = true;
      this.ventRoot.add(m);
    }
  }

  /** Big plume of fire from a vent. */
  eruption(x: number, y: number) {
    const at = world(x, y, 0.1);
    this.ring(at, 1.6, 0xff6a2a, 0.6);
    this.debris(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xff8a3a, 14);
    this.debris(at.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x3d2f35, 8);
    this.shakeCam(0.35);
  }

  /** Wind streak across a tower top. */
  gust(x: number, y: number, z: number, side: number) {
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
    this.camera.fov = w < h ? 55 : 38;
    this.camera.updateProjectionMatrix();
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
        const mat = toon(MATS[b.mat].color);
        const mesh = outlined(GEO.block, mat, 0.05);
        mesh.position.copy(target).add(new THREE.Vector3(0, 4 + z * 0.15, 0));
        mesh.userData.blockId = b.id;
        mesh.userData.cell = { x, y };
        this.blockRoot.add(mesh);
        v = { mesh, mat, target, emblem: null, matId: b.mat, x, y };
        this.blockViews.set(b.id, v);
      }
      v.target.copy(target);
      v.x = x; v.y = y;
      v.mesh.userData.cell = { x, y };
      const topOpen = !board.blockAt(x, y, z + 1);
      if (topOpen && !v.emblem) {
        v.emblem = this.makeEmblem(b.mat);
        if (v.emblem) v.mesh.add(v.emblem);
      } else if (!topOpen && v.emblem) {
        v.mesh.remove(v.emblem);
        v.emblem = null;
      }
    }
    for (const [id, v] of this.blockViews) {
      if (seen.has(id)) continue;
      this.debris(v.mesh.position, MATS[v.matId].color, 7);
      this.blockRoot.remove(v.mesh);
      v.mat.dispose();
      this.blockViews.delete(id);
    }
  }

  /** Refresh per-block tint from HP and hit flashes. */
  tintBlocks(board: Board) {
    const dark = new THREE.Color(0x3a2a3a);
    for (const { b } of board.blocks()) {
      const v = this.blockViews.get(b.id);
      if (!v) continue;
      const c = new THREE.Color(MATS[b.mat].color).lerp(dark, (1 - b.hp / b.maxHp) * 0.55);
      if (b.flash > 0) c.lerp(new THREE.Color(0xffffff), Math.min(1, b.flash * 6));
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
    this.ghostRoot.clear();
    for (const c of cells) {
      const col = new THREE.Color(MATS[c.mat].color);
      if (!ok) col.lerp(new THREE.Color(PALETTE.ghostBad), 0.7);
      const m = new THREE.Mesh(GEO.ghost, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: ok ? 0.62 : 0.45, depthWrite: false }));
      m.position.copy(world(c.x, c.y, c.z + 0.5));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(GEO.ghost), new THREE.LineBasicMaterial({ color: ok ? 0xffffff : PALETTE.ghostBad }));
      m.add(edges);
      this.ghostRoot.add(m);
      // drop shadow column marker on the ground
      const mark = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: ok ? PALETTE.ghostOk : PALETTE.ghostBad, transparent: true, opacity: 0.35, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2;
      mark.scale.setScalar(0.42);
      mark.position.copy(world(c.x, c.y, 0.02));
      this.ghostRoot.add(mark);
    }
  }

  clearGhost() { this.ghostRoot.clear(); }

  setRanges(rings: { x: number; y: number; r: number; color: number }[]) {
    this.ringRoot.clear();
    for (const r of rings) {
      const m = new THREE.Mesh(GEO.rangeRing, new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(r.r);
      m.position.copy(world(r.x, r.y, 0.03));
      const fill = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.08, depthWrite: false }));
      m.add(fill);
      this.ringRoot.add(m);
    }
  }

  setTelegraph(sides: number[]) {
    this.telegraphRoot.clear();
    const mat = toon(0xff4d6d, { emissive: 0x551020 });
    for (const s of sides) {
      const a = outlined(GEO.arrow, mat, 0.05, false);
      const d = C + 2.2;
      const pos = [new THREE.Vector3(0, 0.6, -d), new THREE.Vector3(d, 0.6, 0), new THREE.Vector3(0, 0.6, d), new THREE.Vector3(-d, 0.6, 0)][s];
      a.position.copy(pos);
      a.rotation.x = Math.PI / 2;
      a.rotation.order = 'YXZ';
      a.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][s];
      a.userData.basePos = pos.clone();
      a.scale.setScalar(1.4);
      this.telegraphRoot.add(a);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(N, 0.6), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.45, depthWrite: false }));
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.order = 'YXZ';
      strip.rotation.y = s % 2 ? Math.PI / 2 : 0;
      const e = C + 0.2;
      strip.position.copy([new THREE.Vector3(0, 0.02, -e), new THREE.Vector3(e, 0.02, 0), new THREE.Vector3(0, 0.02, e), new THREE.Vector3(-e, 0.02, 0)][s]);
      strip.userData.strip = true;
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
    if (type === 'boss') {
      for (let i = 0; i < 4; i++) {
        const o = outlined(new THREE.TetrahedronGeometry(0.25), toon(0xe8475e), 0.04);
        o.userData.orbit = i;
        body.add(o);
      }
    }
    const hpBar = new THREE.Group();
    const w = type === 'boss' ? 1.6 : 0.7;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, 0.13), new THREE.MeshBasicMaterial({ color: PALETTE.outline, depthTest: false }));
    const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08), new THREE.MeshBasicMaterial({ color: 0xff5470, depthTest: false }));
    hpFill.geometry.translate(w / 2, 0, 0);
    hpFill.position.x = -w / 2;
    hpFill.position.z = 0.001;
    bg.renderOrder = 10; hpFill.renderOrder = 11;
    hpBar.add(bg, hpFill);
    hpBar.position.y = def.size + 0.45;
    hpBar.visible = false;
    root.add(hpBar);
    this.scene.add(root);
    return { root, body, mat, hpBar, hpFill };
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
    v.root.position.copy(pos);
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
    v.hpFill.scale.x = Math.max(0.001, hpFrac);
    v.hpBar.quaternion.copy(this.camera.quaternion);
  }

  removeEnemy(v: EnemyView, color: number, burst = true) {
    if (burst) this.debris(v.root.position, color, 9);
    this.scene.remove(v.root);
    v.mat.dispose();
  }

  // ---------- effects ----------

  beam(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const m = new THREE.Mesh(GEO.beam, new THREE.MeshBasicMaterial({ color, transparent: true }));
    const d = to.clone().sub(from);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.scene.add(m);
    this.fxList.push({ obj: m, life: 0.12, max: 0.12, kind: 'fade' });
  }

  lightning(from: THREE.Vector3, to: THREE.Vector3) {
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

  floatText(pos: THREE.Vector3, text: string, color: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 40px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#221a33';
    ctx.strokeText(text, 64, 46);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 46);
    const tex = new THREE.CanvasTexture(canvas);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.2, 0.6, 1);
    s.position.copy(pos);
    s.renderOrder = 20;
    this.scene.add(s);
    this.fxList.push({ obj: s, life: 1.1, max: 1.1, kind: 'float' });
  }

  coreHit() { this.coreFlash = 0.4; this.shake = 0.35; }
  shakeCam(a: number) { this.shake = Math.max(this.shake, a); }

  // ---------- frame ----------

  update(realDt: number, simDt: number) {
    this.time += realDt;
    const t = this.time;
    for (const v of this.blockViews.values()) {
      const p = v.mesh.position;
      p.x += (v.target.x - p.x) * Math.min(1, realDt * 14);
      p.z += (v.target.z - p.z) * Math.min(1, realDt * 14);
      if (p.y > v.target.y) p.y = Math.max(v.target.y, p.y - realDt * 16);
      else p.y += (v.target.y - p.y) * Math.min(1, realDt * 14);
      if (v.emblem) {
        v.emblem.traverse(o => {
          if (o.userData.spin) o.rotation.y += realDt * o.userData.spin;
          if (o.userData.bob) o.scale.setScalar(1 + Math.sin(t * 6 + v.x) * 0.08);
          if (o.userData.swing) o.rotation.z = Math.sin(t * 2.5 + v.x) * 0.25;
        });
      }
    }
    this.coreGem.rotation.y += realDt * 0.8;
    this.coreGem.position.y = 1.15 + Math.sin(t * 2) * 0.08;
    const halo = this.core.getObjectByName('halo')!;
    halo.rotation.z += realDt * 0.5;
    halo.position.y = this.coreGem.position.y;
    const gemMat = this.coreGem.material as THREE.MeshToonMaterial;
    this.coreFlash = Math.max(0, this.coreFlash - realDt);
    gemMat.color.set(PALETTE.core).lerp(new THREE.Color(0xffffff), this.coreFlash * 2);

    for (const v of this.ventRoot.children) ((v as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3 + v.position.x) * 0.3;
    for (const d of this.decor) {
      d.position.y = d.userData.baseY + Math.sin(t * 0.5 + d.userData.phase) * 0.4;
      d.rotation.y += realDt * 0.1;
    }
    for (const a of this.telegraphRoot.children) {
      if (a.userData.strip) { ((a as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 4) * 0.15; continue; }
      const bp = a.userData.basePos as THREE.Vector3;
      const pulse = (Math.sin(t * 5) + 1) * 0.25;
      a.position.copy(bp).multiplyScalar(1 - pulse * 0.04);
    }

    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const f = this.fxList[i];
      f.life -= simDt;
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
        f.obj.position.y += realDt * 1.2;
        (f.obj as THREE.Sprite).material.opacity = Math.min(1, k * 2);
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
    this.hemi.color.set(0xfff4e0).lerp(new THREE.Color(0x8fa0ff), n);
    this.hemi.groundColor.set(0x8a7a9a).lerp(new THREE.Color(0x2a1e4a), n);
    this.hemi.intensity = 1.4 - n * 0.25;
    this.sun.color.set(0xffffff).lerp(new THREE.Color(0xb9a8ff), n);
    this.sun.intensity = 2.2 - n * 0.7;

    this.controls.update();
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

  clearAll() {
    for (const v of this.blockViews.values()) { this.blockRoot.remove(v.mesh); v.mat.dispose(); }
    this.blockViews.clear();
    this.clearGhost();
    this.ringRoot.clear();
    this.telegraphRoot.clear();
    this.ventRoot.clear();
  }
}

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Activity, BatteryMedium, Box, Flame, RotateCw, Zap } from 'lucide-react';
import { CellData, ChemistrySpec } from '../types/battery';
import { playCellClickSound } from '../utils/audio';

export type HeatmapColorMode = 'thermal' | 'soh' | 'voltage' | 'soc' | 'balancing';

interface Props {
  cells: CellData[];
  selectedCellId: number;
  onSelectCell: (id: number) => void;
  chemistrySpec: ChemistrySpec;
  seriesCount: number;
  parallelCount: number;
  isRunning: boolean;
  colorMode: HeatmapColorMode;
  onChangeColorMode: (mode: HeatmapColorMode) => void;
}

interface Dimensions {
  width: number;
  depth: number;
  height: number;
  spacingX: number;
  spacingZ: number;
  label: string;
}

interface CellVisual {
  group: THREE.Group;
  hit: THREE.Mesh[];
  color: THREE.Mesh[];
  halo: THREE.Mesh;
  width: number;
  depth: number;
}

const STEEL = 0xcbd5e1;
const COPPER = 0xd97706;
const POSITIVE = 0xef4444;

function dimensionsFor(spec: ChemistrySpec): Dimensions {
  if (spec.id === 'solid-state') return { width: 2.7, depth: 0.72, height: 5.2, spacingX: 3.25, spacingZ: 1.42, label: 'Ceramic solid laminate' };
  switch (spec.formFactorType) {
    case 'pouch_flat':
      return { width: 3.15, depth: 0.72, height: 5, spacingX: 3.7, spacingZ: 1.4, label: 'Heat-sealed polymer pouch' };
    case 'prismatic_hardcase':
      return { width: 3.2, depth: 1.45, height: 5.5, spacingX: 3.8, spacingZ: 2.15, label: 'Prismatic aluminium hardcase' };
    case 'lead_acid_monoblock':
      return { width: 3.8, depth: 2.5, height: 4.1, spacingX: 4.45, spacingZ: 3.15, label: 'AGM lead-acid module' };
    case 'cylindrical_nimh':
      return { width: 1.65, depth: 1.65, height: 4.8, spacingX: 2.25, spacingZ: 2.25, label: 'NiMH cylindrical can' };
    default:
      return { width: 1.55, depth: 1.55, height: 5.7, spacingX: 2.18, spacingZ: 2.18, label: 'Li-ion cylindrical can' };
  }
}

function material(color: number, metalness = 0.18, roughness = 0.25) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: 0x000000, emissiveIntensity: 0 });
}

function mesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  xyz: [number, number, number],
  hit?: THREE.Mesh[],
  id?: number,
) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(...xyz);
  result.castShadow = true;
  result.receiveShadow = true;
  if (id !== undefined) {
    result.userData.cellId = id;
    hit?.push(result);
  }
  group.add(result);
  return result;
}

function edges(group: THREE.Group, geometry: THREE.BufferGeometry, xyz: [number, number, number], color = 0x94a3b8) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.64 }),
  );
  lines.position.set(...xyz);
  group.add(lines);
}

function halo(width: number, depth: number, y: number) {
  const result = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.42, depth + 0.42),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.65, wireframe: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  result.rotation.x = -Math.PI / 2;
  result.position.y = y;
  result.visible = false;
  return result;
}

function cylinder(cell: CellData, d: Dimensions, nimh: boolean): CellVisual {
  const group = new THREE.Group();
  const hit: THREE.Mesh[] = [];
  const color: THREE.Mesh[] = [];
  const r = d.width / 2;
  const body = mesh(group, new THREE.CylinderGeometry(r, r, d.height, 32), material(nimh ? 0x16a34a : 0x0ea5e9, 0.24, 0.19), [0, d.height / 2, 0], hit, cell.id);
  color.push(body);
  mesh(group, new THREE.CylinderGeometry(r, r, 0.14, 32), material(0x334155, 0.88, 0.12), [0, 0.07, 0]);
  mesh(group, new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.1, 32), material(STEEL, 0.92, 0.08), [0, d.height + 0.05, 0]);
  const insulator = mesh(
    group,
    new THREE.RingGeometry(r * 0.48, r * 0.9, 32),
    new THREE.MeshStandardMaterial({ color: nimh ? 0xf8fafc : 0x111827, roughness: 0.8, side: THREE.DoubleSide }),
    [0, d.height + 0.11, 0],
  );
  insulator.rotation.x = -Math.PI / 2;
  const capR = r * (nimh ? 0.33 : 0.42);
  const capH = nimh ? 0.27 : 0.34;
  mesh(group, new THREE.CylinderGeometry(capR, capR, capH, 24), material(STEEL, 0.96, 0.07), [0, d.height + 0.1 + capH / 2, 0], hit, cell.id);
  if (!nimh) mesh(group, new THREE.TorusGeometry(capR * 0.55, 0.034, 8, 24), material(0x475569, 0.8, 0.2), [0, d.height + capH + 0.1, 0]);
  const h = halo(d.width, d.depth, d.height + 0.18);
  group.add(h);
  return { group, hit, color, halo: h, width: d.width, depth: d.depth };
}

function pouch(cell: CellData, d: Dimensions): CellVisual {
  const group = new THREE.Group();
  const hit: THREE.Mesh[] = [];
  const color: THREE.Mesh[] = [];
  const geometry = new THREE.BoxGeometry(d.width, d.height, d.depth);
  const body = mesh(group, geometry, material(0xec4899, 0.36, 0.26), [0, d.height / 2, 0], hit, cell.id);
  color.push(body);
  edges(group, geometry, [0, d.height / 2, 0], 0xe2e8f0);
  const seal = material(0xcbd5e1, 0.82, 0.16);
  mesh(group, new THREE.BoxGeometry(d.width + 0.28, 0.16, d.depth + 0.08), seal, [0, 0.08, 0]);
  mesh(group, new THREE.BoxGeometry(d.width + 0.28, 0.16, d.depth + 0.08), seal.clone(), [0, d.height - 0.08, 0]);
  mesh(group, new THREE.BoxGeometry(0.14, d.height, d.depth + 0.08), seal.clone(), [-d.width / 2 - 0.07, d.height / 2, 0]);
  mesh(group, new THREE.BoxGeometry(0.14, d.height, d.depth + 0.08), seal.clone(), [d.width / 2 + 0.07, d.height / 2, 0]);
  mesh(group, new THREE.BoxGeometry(0.58, 0.66, 0.18), material(POSITIVE, 0.7, 0.16), [-0.78, d.height + 0.33, 0]);
  mesh(group, new THREE.BoxGeometry(0.58, 0.66, 0.18), material(0x64748b, 0.87, 0.12), [0.78, d.height + 0.33, 0]);
  mesh(group, new THREE.BoxGeometry(d.width * 0.7, d.height * 0.34, 0.035), material(0x111827, 0.1, 0.7), [0, d.height * 0.5, d.depth / 2 + 0.025]);
  const h = halo(d.width, d.depth, d.height + 0.1);
  group.add(h);
  return { group, hit, color, halo: h, width: d.width + 0.28, depth: d.depth + 0.1 };
}

function prismatic(cell: CellData, d: Dimensions): CellVisual {
  const group = new THREE.Group();
  const hit: THREE.Mesh[] = [];
  const color: THREE.Mesh[] = [];
  const geometry = new THREE.BoxGeometry(d.width, d.height, d.depth);
  const body = mesh(group, geometry, material(0x0ea5e9, 0.42, 0.22), [0, d.height / 2, 0], hit, cell.id);
  color.push(body);
  edges(group, geometry, [0, d.height / 2, 0], 0x7dd3fc);
  mesh(group, new THREE.BoxGeometry(d.width + 0.08, 0.24, d.depth + 0.08), material(0x94a3b8, 0.87, 0.12), [0, d.height + 0.12, 0]);
  [-0.92, 0.92].forEach((x, i) => {
    mesh(group, new THREE.CylinderGeometry(0.28, 0.33, 0.18, 24), material(i === 0 ? POSITIVE : COPPER, 0.82, 0.12), [x, d.height + 0.33, 0]);
    mesh(group, new THREE.CylinderGeometry(0.19, 0.19, 0.38, 16), material(i === 0 ? STEEL : COPPER, 0.94, 0.08), [x, d.height + 0.56, 0]);
  });
  mesh(group, new THREE.CylinderGeometry(0.23, 0.23, 0.08, 24), material(0x475569, 0.85, 0.18), [0, d.height + 0.28, 0]);
  const h = halo(d.width, d.depth, d.height + 0.1);
  group.add(h);
  return { group, hit, color, halo: h, width: d.width, depth: d.depth };
}

function leadAcid(cell: CellData, d: Dimensions): CellVisual {
  const group = new THREE.Group();
  const hit: THREE.Mesh[] = [];
  const color: THREE.Mesh[] = [];
  const geometry = new THREE.BoxGeometry(d.width, d.height, d.depth);
  const body = mesh(group, geometry, material(0x334155, 0.16, 0.4), [0, d.height / 2, 0], hit, cell.id);
  color.push(body);
  edges(group, geometry, [0, d.height / 2, 0], 0x64748b);
  mesh(group, new THREE.BoxGeometry(d.width + 0.08, 0.32, d.depth + 0.08), material(0x111827, 0.15, 0.52), [0, d.height + 0.16, 0]);
  [-1.05, 1.05].forEach((x, i) => mesh(group, new THREE.CylinderGeometry(0.33, 0.42, 0.55, 24), material(i === 0 ? POSITIVE : 0x475569, 0.82, 0.14), [x, d.height + 0.56, 0]));
  [-0.45, 0, 0.45].forEach((x) => mesh(group, new THREE.CylinderGeometry(0.13, 0.13, 0.11, 16), material(0x1e293b, 0.3, 0.5), [x, d.height + 0.37, -d.depth * 0.22]));
  mesh(group, new THREE.BoxGeometry(d.width * 0.7, d.height * 0.4, 0.04), material(0x0f172a, 0.2, 0.62), [0, d.height * 0.48, d.depth / 2 + 0.025]);
  const h = halo(d.width, d.depth, d.height + 0.14);
  group.add(h);
  return { group, hit, color, halo: h, width: d.width, depth: d.depth };
}

function solidState(cell: CellData, d: Dimensions): CellVisual {
  const group = new THREE.Group();
  const hit: THREE.Mesh[] = [];
  const color: THREE.Mesh[] = [];
  const geometry = new THREE.BoxGeometry(d.width, d.height, d.depth);
  const body = mesh(group, geometry, material(0x8b5cf6, 0.34, 0.2), [0, d.height / 2, 0], hit, cell.id);
  color.push(body);
  edges(group, geometry, [0, d.height / 2, 0], 0xc4b5fd);
  [-1, 1].forEach((side) => mesh(group, new THREE.BoxGeometry(d.width + 0.2, d.height + 0.12, 0.09), material(0x94a3b8, 0.9, 0.1), [0, d.height / 2, side * (d.depth / 2 + 0.065)]));
  for (let y = 0.65; y < d.height; y += 0.62) mesh(group, new THREE.BoxGeometry(d.width + 0.11, 0.04, d.depth + 0.22), material(0xddd6fe, 0.3, 0.3), [0, y, 0]);
  mesh(group, new THREE.BoxGeometry(0.58, 0.68, 0.13), material(POSITIVE, 0.72, 0.14), [-0.72, d.height + 0.34, 0]);
  mesh(group, new THREE.BoxGeometry(0.58, 0.68, 0.13), material(0x64748b, 0.87, 0.1), [0.72, d.height + 0.34, 0]);
  const h = halo(d.width, d.depth, d.height + 0.1);
  group.add(h);
  return { group, hit, color, halo: h, width: d.width + 0.2, depth: d.depth + 0.25 };
}

function cellVisual(cell: CellData, spec: ChemistrySpec, d: Dimensions): CellVisual {
  if (spec.id === 'solid-state') return solidState(cell, d);
  if (spec.formFactorType === 'pouch_flat') return pouch(cell, d);
  if (spec.formFactorType === 'prismatic_hardcase') return prismatic(cell, d);
  if (spec.formFactorType === 'lead_acid_monoblock') return leadAcid(cell, d);
  return cylinder(cell, d, spec.formFactorType === 'cylindrical_nimh');
}

function getThermalColor(temp: number) {
  if (temp <= 22) return new THREE.Color(0x06b6d4);
  if (temp <= 30) return new THREE.Color(0x06b6d4).lerp(new THREE.Color(0x84cc16), (temp - 22) / 8);
  if (temp <= 42) return new THREE.Color(0x84cc16).lerp(new THREE.Color(0xeab308), (temp - 30) / 12);
  if (temp <= 56) return new THREE.Color(0xeab308).lerp(new THREE.Color(0xf97316), (temp - 42) / 14);
  return new THREE.Color(0xf97316).lerp(new THREE.Color(0xef4444), Math.min(1, (temp - 56) / 20));
}

function getSohColor(soh: number) {
  if (soh >= 95) return new THREE.Color(0x10b981);
  if (soh >= 90) return new THREE.Color(0x84cc16);
  if (soh >= 80) return new THREE.Color(0xeab308);
  if (soh >= 70) return new THREE.Color(0xf97316);
  return new THREE.Color(0xef4444);
}

function getVoltageColor(voltage: number, minV: number, maxV: number) {
  const t = Math.max(0, Math.min(1, (voltage - minV) / (maxV - minV || 0.1)));
  if (t <= 0.5) return new THREE.Color(0x0ea5e9).lerp(new THREE.Color(0x10b981), t * 2);
  return new THREE.Color(0x10b981).lerp(new THREE.Color(0xf59e0b), (t - 0.5) * 2);
}

function getSocColor(soc: number) {
  const t = Math.max(0, Math.min(1, soc / 100));
  if (t <= 0.2) return new THREE.Color(0xef4444).lerp(new THREE.Color(0xf97316), t * 5);
  if (t <= 0.5) return new THREE.Color(0xf97316).lerp(new THREE.Color(0xeab308), (t - 0.2) / 0.3);
  if (t <= 0.8) return new THREE.Color(0xeab308).lerp(new THREE.Color(0x84cc16), (t - 0.5) / 0.3);
  return new THREE.Color(0x84cc16).lerp(new THREE.Color(0x06b6d4), (t - 0.8) / 0.2);
}

function cellColor(cell: CellData, spec: ChemistrySpec, mode: HeatmapColorMode) {
  if (mode === 'thermal') return getThermalColor(cell.temperature);
  if (mode === 'soh') return getSohColor(cell.soh);
  if (mode === 'voltage') return getVoltageColor(cell.voltage, spec.cutoffVoltage, spec.maxVoltage);
  if (mode === 'soc') return getSocColor(cell.soc);
  return new THREE.Color(cell.isBalancing ? 0xf59e0b : 0x38bdf8);
}

function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((item) => item.dispose());
    }
  });
}

export function ThreeStack3D(props: Props) {
  const {
    cells,
    selectedCellId,
    onSelectCell,
    chemistrySpec,
    seriesCount,
    parallelCount,
    isRunning,
    colorMode,
    onChangeColorMode,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const packRef = useRef<THREE.Group | null>(null);
  const visualsRef = useRef(new Map<number, CellVisual>());
  const markerRef = useRef<THREE.Mesh | null>(null);
  const autoRotateRef = useRef(false);
  const selectRef = useRef(onSelectCell);
  const frameRef = useRef({ width: 12, depth: 12, height: 6 });
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [autoRotate, setAutoRotate] = useState(false);
  const [failed, setFailed] = useState(false);
  selectRef.current = onSelectCell;
  autoRotateRef.current = autoRotate;

  const d = useMemo(() => dimensionsFor(chemistrySpec), [chemistrySpec]);
  const grid = useMemo(() => {
    if (parallelCount > 1) return { cols: Math.max(1, seriesCount), rows: Math.max(1, parallelCount) };
    const total = cells.length;
    const cols = total <= 4 ? total : total <= 8 ? 4 : total <= 16 ? 8 : Math.min(12, Math.ceil(Math.sqrt(total * 1.7)));
    return { cols: Math.max(1, cols), rows: Math.max(1, Math.ceil(total / Math.max(1, cols))) };
  }, [cells.length, seriesCount, parallelCount]);
  const hovered = hoveredId === null ? null : cells.find((cell) => cell.id === hoveredId) ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(360, container.clientHeight);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.FogExp2(0x050a14, 0.008);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1200);
    camera.position.set(20, 22, 30);
    cameraRef.current = camera;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 5;
    controls.maxDistance = 240;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    controls.target.set(0, 2.7, 0);
    controlsRef.current = controls;
    scene.add(new THREE.HemisphereLight(0x8ec5ff, 0x07101f, 1.45));
    const key = new THREE.DirectionalLight(0xffffff, 2.25);
    key.position.set(28, 38, 24);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -45;
    key.shadow.camera.right = 45;
    key.shadow.camera.top = 45;
    key.shadow.camera.bottom = -45;
    scene.add(key);
    const cyan = new THREE.PointLight(0x06b6d4, 2.4, 75);
    cyan.position.set(-18, 11, 20);
    scene.add(cyan);
    const violet = new THREE.PointLight(0x8b5cf6, 1.7, 65);
    violet.position.set(18, 4, -16);
    scene.add(violet);
    const gridHelper = new THREE.GridHelper(120, 60, 0x06b6d4, 0x172033);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), material(0x060c18, 0.6, 0.38));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.035;
    floor.receiveShadow = true;
    scene.add(floor);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.08, 40),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.09;
    marker.visible = false;
    scene.add(marker);
    markerRef.current = marker;
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(360, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    let animation = 0;
    const clock = new THREE.Clock();
    const render = () => {
      animation = requestAnimationFrame(render);
      const time = clock.getElapsedTime();
      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 1.05;
      controls.update();
      if (marker.visible) {
        const pulse = 1 + Math.sin(time * 6) * 0.06;
        marker.scale.z = pulse;
      }
      visualsRef.current.forEach((visual) => {
        if (visual.halo.visible) {
          const pulse = 1 + Math.sin(time * 9) * 0.12;
          visual.halo.scale.set(pulse, pulse, 1);
        }
      });
      renderer.render(scene, camera);
    };
    render();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.replaceChildren();
      scene.clear();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (packRef.current) {
      scene.remove(packRef.current);
      dispose(packRef.current);
    }
    const pack = new THREE.Group();
    packRef.current = pack;
    visualsRef.current.clear();
    const width = (grid.cols - 1) * d.spacingX + d.width;
    const depth = (grid.rows - 1) * d.spacingZ + d.depth;
    const x0 = -((grid.cols - 1) * d.spacingX) / 2;
    const z0 = -((grid.rows - 1) * d.spacingZ) / 2;
    const baseY = 0.34;
    const plateGeo = new THREE.BoxGeometry(width + 2, 0.34, depth + 2);
    mesh(pack, plateGeo, material(0x111827, 0.7, 0.22), [0, 0.17, 0]);
    edges(pack, plateGeo, [0, 0.17, 0], 0x0e7490);
    const rail = material(0x0b0f18, 0.88, 0.12);
    mesh(pack, new THREE.BoxGeometry(width + 2.45, 0.48, 0.44), rail, [0, 0.52, -(depth / 2 + 0.78)]);
    mesh(pack, new THREE.BoxGeometry(width + 2.45, 0.48, 0.44), rail.clone(), [0, 0.52, depth / 2 + 0.78]);
    mesh(pack, new THREE.BoxGeometry(0.44, 0.48, depth + 2), rail.clone(), [-(width / 2 + 0.78), 0.52, 0]);
    mesh(pack, new THREE.BoxGeometry(0.44, 0.48, depth + 2), rail.clone(), [width / 2 + 0.78, 0.52, 0]);
    cells.forEach((cell, index) => {
      const visual = cellVisual(cell, chemistrySpec, d);
      visual.group.position.set(x0 + (index % grid.cols) * d.spacingX, baseY, z0 + Math.floor(index / grid.cols) * d.spacingZ);
      pack.add(visual.group);
      visualsRef.current.set(cell.id, visual);
    });
    if (chemistrySpec.formFactorType.includes('cylindrical')) {
      for (let row = 0; row < grid.rows; row += 1) mesh(pack, new THREE.BoxGeometry(width + 0.5, 0.09, Math.min(0.42, d.depth * 0.35)), material(0x94a3b8, 0.95, 0.08), [0, baseY + d.height + 0.48, z0 + row * d.spacingZ]);
    } else if (chemistrySpec.formFactorType === 'prismatic_hardcase') {
      for (let row = 0; row < grid.rows; row += 1) mesh(pack, new THREE.BoxGeometry(width, 0.11, 0.28), material(COPPER, 0.94, 0.08), [0, baseY + d.height + 0.68, z0 + row * d.spacingZ]);
    } else if (chemistrySpec.formFactorType === 'lead_acid_monoblock') {
      for (let row = 0; row < grid.rows; row += 1) mesh(pack, new THREE.BoxGeometry(width, 0.18, 0.35), material(0x64748b, 0.86, 0.12), [0, baseY + d.height + 0.67, z0 + row * d.spacingZ]);
    } else {
      const y = baseY + d.height * 0.58;
      mesh(pack, new THREE.BoxGeometry(width + 1, 0.32, 0.34), rail.clone(), [0, y, -(depth / 2 + 0.36)]);
      mesh(pack, new THREE.BoxGeometry(width + 1, 0.32, 0.34), rail.clone(), [0, y, depth / 2 + 0.36]);
    }
    scene.add(pack);
    frameRef.current = { width, depth, height: d.height };
    const span = Math.max(width, depth, d.height * 1.8);
    const distance = Math.max(16, span * 1.42);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      camera.position.set(distance * 0.72, distance * 0.66, distance);
      camera.far = Math.max(1200, distance * 8);
      camera.updateProjectionMatrix();
      controls.target.set(0, d.height * 0.46, 0);
      controls.maxDistance = distance * 3.5;
      controls.update();
    }
  }, [cells.length, chemistrySpec.id, chemistrySpec.formFactorType, d, grid]);

  useEffect(() => {
    cells.forEach((cell) => {
      const visual = visualsRef.current.get(cell.id);
      if (!visual) return;
      const color = cellColor(cell, chemistrySpec, colorMode);
      visual.color.forEach((part) => {
        const mat = part.material as THREE.MeshStandardMaterial;
        mat.color.copy(color);
        if (cell.faultType !== 'none') {
          mat.emissive.setHex(0xef4444);
          mat.emissiveIntensity = 0.62;
        } else if (cell.temperature > 52) {
          mat.emissive.setHex(0xf97316);
          mat.emissiveIntensity = 0.34;
        } else if (cell.isBalancing) {
          mat.emissive.setHex(0xf59e0b);
          mat.emissiveIntensity = 0.28;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      });
      visual.halo.visible = cell.isBalancing;
    });
    const selected = visualsRef.current.get(selectedCellId);
    const marker = markerRef.current;
    if (selected && marker) {
      marker.position.x = selected.group.position.x;
      marker.position.z = selected.group.position.z;
      marker.scale.set(Math.max(0.8, selected.width / 1.9), Math.max(0.8, selected.depth / 1.9), 1);
      marker.visible = true;
    } else if (marker) marker.visible = false;
  }, [cells, selectedCellId, chemistrySpec, colorMode]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    const raycaster = new THREE.Raycaster();
    const point = new THREE.Vector2();
    const dom = renderer.domElement;
    const cellAt = (event: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      point.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(point, camera);
      const targets: THREE.Mesh[] = [];
      visualsRef.current.forEach((visual) => targets.push(...visual.hit));
      return (raycaster.intersectObjects(targets, false)[0]?.object.userData.cellId as number | undefined) ?? null;
    };
    const move = (event: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      setMouse({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      const id = cellAt(event);
      setHoveredId(id);
      dom.style.cursor = id === null ? 'grab' : 'pointer';
    };
    const click = (event: MouseEvent) => {
      const id = cellAt(event);
      if (id !== null) {
        playCellClickSound(500 + id * 17);
        selectRef.current(id);
      }
    };
    dom.addEventListener('mousemove', move);
    dom.addEventListener('click', click);
    return () => {
      dom.removeEventListener('mousemove', move);
      dom.removeEventListener('click', click);
    };
  }, [cells.length, chemistrySpec.id]);

  const cameraView = (view: 'isometric' | 'top' | 'front' | 'side') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    playCellClickSound(700);
    const { width, depth, height } = frameRef.current;
    const distance = Math.max(16, Math.max(width, depth, height * 1.8) * 1.42);
    if (view === 'top') camera.position.set(0, distance * 1.25, 0.01);
    if (view === 'front') camera.position.set(0, height * 0.75, distance);
    if (view === 'side') camera.position.set(distance, height * 0.75, 0.01);
    if (view === 'isometric') camera.position.set(distance * 0.72, distance * 0.66, distance);
    controls.target.set(0, height * 0.46, 0);
    controls.update();
  };

  const modes: [HeatmapColorMode, string, React.ReactNode][] = [
    ['thermal', 'Thermal', <Flame className="w-3.5 h-3.5" />],
    ['soh', 'Health', <Activity className="w-3.5 h-3.5" />],
    ['voltage', 'Voltage', <Zap className="w-3.5 h-3.5" />],
    ['soc', 'Charge', <BatteryMedium className="w-3.5 h-3.5" />],
    ['balancing', 'Balance', <Box className="w-3.5 h-3.5" />],
  ];

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-[#050a14] shadow-2xl">
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 bg-slate-900/92 border border-slate-700 p-1 rounded-xl shadow-xl backdrop-blur-md pointer-events-auto overflow-x-auto">
          {modes.map(([mode, label, icon]) => (
            <button key={mode} onClick={() => onChangeColorMode(mode)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${colorMode === mode ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              {icon}{label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-slate-900/92 border border-slate-700 p-1 rounded-xl shadow-xl backdrop-blur-md pointer-events-auto">
          {(['isometric', 'top', 'front', 'side'] as const).map((view) => (
            <button key={view} onClick={() => cameraView(view)} className="px-2 py-1 text-[11px] font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer capitalize">
              {view === 'isometric' ? '3D Iso' : view}
            </button>
          ))}
          <button onClick={() => setAutoRotate((value) => !value)} className={`p-1.5 rounded-lg cursor-pointer ${autoRotate ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`} title="Auto rotate">
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="w-full h-[460px] md:h-[540px] cursor-grab active:cursor-grabbing" />
      {failed && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-sm text-amber-300">WebGL is unavailable. Enable hardware acceleration and reload.</div>}
      {hovered && (
        <div className="absolute z-30 pointer-events-none bg-slate-900/96 border border-cyan-500/50 p-3 rounded-xl shadow-2xl font-mono text-xs -translate-x-1/2 -translate-y-full" style={{ left: mouse.x, top: mouse.y - 12 }}>
          <div className="flex gap-2 mb-1.5 border-b border-slate-800 pb-1.5"><b className="text-white">{hovered.label}</b><span className="text-[9px] text-cyan-300">CLICK FOR HEALTH</span></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px]">
            <span className="text-slate-500">Voltage <b className="text-cyan-300">{hovered.voltage.toFixed(3)} V</b></span>
            <span className="text-slate-500">SoC <b className="text-emerald-300">{hovered.soc.toFixed(1)}%</b></span>
            <span className="text-slate-500">Temp <b className="text-amber-300">{hovered.temperature.toFixed(1)}°C</b></span>
            <span className="text-slate-500">SoH <b className="text-emerald-400">{hovered.soh}%</b></span>
          </div>
        </div>
      )}
      <div className="p-3 border-t border-slate-800 bg-[#0a1222] flex flex-wrap items-center justify-between gap-3 text-[10.5px] font-mono text-slate-500">
        <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} /><span>{isRunning ? 'LIVE GEOMETRY + TELEMETRY' : 'STACK HOLD'}</span><span>· {d.label} · {cells.length} interactive cells</span></div>
        <div className="flex gap-3"><span>Drag: rotate</span><span>Right drag: pan</span><span>Wheel: zoom</span></div>
      </div>
    </div>
  );
}
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fmtT, SESSION } from "../../data/fixtures.js";

const COLORS = {
  bg: 0xfcffff,
  cream: 0xd5d8c5,
  panel: 0xf6f3e8,
  gray: 0xdedfde,
  ink: 0x0a0a0a,
  charcoal: 0x25251f,
  orange: 0xf47920,
  allow: 0x3e8b5c,
  deny: 0xe5562f,
  muted: 0xbec0b6,
};

const STAGES = [
  { id: "devfix", label: "DEVFIX", sub: "agent", x: -8.3, z: -0.95 },
  { id: "request", label: "REQUEST", sub: "current request", x: -6.6, z: 0 },
  { id: "contract", label: "TASK CONTRACT", sub: SESSION.contractId, x: -4.7, z: 0 },
  { id: "context", label: "CONTEXT", sub: "provenance", x: -2.55, z: 0 },
  { id: "cedar", label: "CEDAR", sub: "runtime authority", x: -0.2, z: 0 },
  { id: "gate", label: "DECISION GATE", sub: "allow / deny", x: 1.9, z: 0 },
  { id: "approved", label: "APPROVED RAIL", sub: "allow path", x: 3.65, z: -0.92 },
  { id: "tool", label: "PROTECTED TOOL", sub: "filesystem.read", x: 5.7, z: -1.65 },
  { id: "evidence", label: "EVIDENCE", sub: "recorded proof", x: 3.85, z: 1.38 },
  { id: "hash", label: "SHA-256", sub: "hash chain", x: 5.65, z: 1.62 },
  { id: "investigation", label: "POST-HOC", sub: "investigation", x: 7.55, z: 1.76 },
] as const;

type StageId = typeof STAGES[number]["id"];
type MachineRoute = StageId[];

const ALLOW_ROUTE: MachineRoute = ["devfix", "request", "contract", "context", "cedar", "gate", "approved", "tool"];
const DENY_ROUTE: MachineRoute = ["devfix", "request", "contract", "context", "cedar", "gate", "evidence", "hash", "investigation"];
const NEUTRAL_ROUTE: MachineRoute = ["devfix", "request", "contract", "context", "cedar", "gate"];

const INSPECTOR: Record<StageId, { title: string; body: string; boundary: string }> = {
  devfix: {
    title: "DevFix / Agent",
    body: "Reference remediation agent. It originates a request but cannot grant itself authority.",
    boundary: "Agent intent is input only; authorization is externalized to Cedar.",
  },
  request: {
    title: "Request Chamber",
    body: "The single orange request ball represents the current event as it moves through the machine.",
    boundary: "There is exactly one request object in the visual route.",
  },
  contract: {
    title: "Task Contract",
    body: "Declared scope travels with the request as an enforcement constraint.",
    boundary: "Current runtime displays fixture/declarative contract data without changing backend semantics.",
  },
  context: {
    title: "Context / Provenance",
    body: "Trust and origin metadata are attached to the request, including UNTRUSTED_EXTERNAL when present.",
    boundary: "Untrusted provenance does not mean malicious; it is metadata for authorization context.",
  },
  cedar: {
    title: "Cedar Runtime Authority",
    body: "Cedar is the central runtime authorization chamber. The request enters here before any protected execution.",
    boundary: "Cedar decides. Bedrock and investigation never authorize runtime access.",
  },
  gate: {
    title: "Decision Gate",
    body: "A mechanical diverter separates the approved rail from the rejected rail.",
    boundary: "ALLOW and DENY branch once and never reconnect.",
  },
  approved: {
    title: "Approved Rail",
    body: "The dedicated green rail carries allowed requests from the decision gate to protected execution.",
    boundary: "This branch terminates at the protected tool.",
  },
  tool: {
    title: "Protected Tool",
    body: "The guarded execution chamber is reachable only on ALLOW.",
    boundary: "DENY never enters the protected tool.",
  },
  evidence: {
    title: "Evidence",
    body: "Denied and recorded events continue into the evidence archive for accountability.",
    boundary: "Evidence is a record, not an authorization gate.",
  },
  hash: {
    title: "SHA-256 Chain",
    body: "Linked blocks represent immutable event chaining without exposing long hash paragraphs.",
    boundary: "Chain integrity is post-event verification.",
  },
  investigation: {
    title: "Post-Hoc Investigation",
    body: "The terminal denied-path machine analyzes evidence after the runtime decision.",
    boundary: "Investigation is post-hoc and never changes the runtime decision.",
  },
};

const stageById = Object.fromEntries(STAGES.map((stage) => [stage.id, stage])) as Record<StageId, typeof STAGES[number]>;
const DEFAULT_CAMERA = new THREE.Vector3(0.2, 11.8, 11.8);
const DEFAULT_ORBIT = new THREE.Vector3(-0.35, 0.12, 0.2);
const FULL_CAMERA = new THREE.Vector3(0.1, 14.6, 14.6);
const FULL_ORBIT = new THREE.Vector3(-0.25, 0.08, 0.12);
const MIN_CAMERA_DISTANCE = 9.2;
const MAX_CAMERA_DISTANCE = 23.5;

function material(color: number, roughness = 0.74) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
  mat.transparent = true;
  return mat;
}

function lineMaterial(color: number) {
  const mat = new THREE.LineBasicMaterial({ color });
  mat.transparent = true;
  return mat;
}

function vectorFor(id: StageId, y = 0.24) {
  const stage = stageById[id];
  return new THREE.Vector3(stage.x, y, stage.z);
}

function railBetween(a: THREE.Vector3, b: THREE.Vector3, color: number, radius = 0.04) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14), material(color, 0.45));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function block(w: number, h: number, d: number, color = 0xf6f3e8) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.solid = true;
  group.add(body);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), lineMaterial(COLORS.ink));
  group.add(edges);
  return group;
}

function addAccent(group: THREE.Group, w = 0.7, z = -0.42) {
  const accent = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, 0.08), material(COLORS.orange, 0.38));
  accent.position.set(0, 0.38, z);
  accent.castShadow = true;
  group.add(accent);
  return accent;
}

function setStageId(group: THREE.Group, id: StageId) {
  group.userData.stageId = id;
  group.traverse((obj) => {
    obj.userData.stageId = id;
  });
}

function makeAgent() {
  const group = new THREE.Group();
  group.add(block(1.05, 0.82, 0.82, 0xf0eee4));
  addAccent(group, 0.58);
  const frame = block(1.22, 0.12, 1.0, COLORS.charcoal);
  frame.position.y = -0.52;
  group.add(frame);
  const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), material(COLORS.orange, 0.3));
  indicator.position.set(0.34, 0.52, -0.35);
  group.add(indicator);
  group.userData.revealParts = [{ obj: indicator, base: indicator.position.clone(), axis: "y", amount: 0.22 }];
  return group;
}

function makeRequest() {
  const group = new THREE.Group();
  const chamber = block(0.95, 0.58, 0.86, 0xf6f3e8);
  group.add(chamber);
  const lid = block(0.72, 0.12, 0.56, COLORS.gray);
  lid.position.set(0, 0.44, 0);
  group.add(lid);
  addAccent(group, 0.5);
  group.userData.revealParts = [{ obj: lid, base: lid.position.clone(), axis: "y", amount: 0.2 }];
  return group;
}

function makeContract() {
  const group = new THREE.Group();
  group.add(block(1.18, 0.56, 0.92, 0xf0eee4));
  for (let i = 0; i < 3; i += 1) {
    const plate = block(0.76, 0.055, 0.55, i === 0 ? COLORS.cream : 0xfcffff);
    plate.position.set(0, 0.17 + i * 0.09, -0.02 + i * 0.015);
    group.add(plate);
    plate.userData.reveal = { index: i };
  }
  addAccent(group, 0.74);
  group.userData.revealParts = group.children
    .filter((child) => child.userData.reveal)
    .map((obj: any) => ({ obj, base: obj.position.clone(), axis: "x", amount: 0.08 + obj.userData.reveal.index * 0.08 }));
  return group;
}

function makeContext() {
  const group = new THREE.Group();
  group.add(block(1.15, 0.62, 0.9, 0xf7f5ed));
  const bands: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i += 1) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.045, 0.08), material(i === 2 ? COLORS.orange : COLORS.cream));
    band.position.set(0, 0.02 + i * 0.17, -0.48);
    band.castShadow = true;
    group.add(band);
    bands.push(band);
  }
  group.userData.revealParts = bands.map((obj, index) => ({ obj, base: obj.position.clone(), axis: "z", amount: -0.1 - index * 0.05 }));
  return group;
}

function makeCedar() {
  const group = new THREE.Group();
  group.add(block(1.36, 1.24, 1.22, COLORS.ink));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 24), material(COLORS.orange, 0.3));
  core.rotation.x = Math.PI / 2;
  core.position.set(0, 0.08, -0.64);
  group.add(core);
  const left = block(0.18, 1.0, 1.04, COLORS.charcoal);
  const right = block(0.18, 1.0, 1.04, COLORS.charcoal);
  left.position.x = -0.78;
  right.position.x = 0.78;
  group.add(left, right);
  group.userData.revealParts = [
    { obj: left, base: left.position.clone(), axis: "x", amount: -0.22 },
    { obj: right, base: right.position.clone(), axis: "x", amount: 0.22 },
    { obj: core, base: core.position.clone(), axis: "z", amount: -0.18 },
  ];
  return group;
}

function makeGate() {
  const group = new THREE.Group();
  group.add(block(0.92, 0.7, 0.92, 0xf6f3e8));
  const pivot = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.2), material(COLORS.orange, 0.42));
  arm.position.z = 0.25;
  pivot.add(arm);
  pivot.position.y = 0.35;
  group.add(pivot);
  const allow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.08), material(COLORS.allow, 0.42));
  allow.position.set(0.34, 0.52, -0.5);
  const deny = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.08), material(COLORS.deny, 0.42));
  deny.position.set(0.34, 0.52, 0.5);
  group.add(allow, deny);
  group.userData.gatePivot = pivot;
  group.userData.revealParts = [{ obj: pivot, baseRot: pivot.rotation.clone(), rotateY: 0.8 }];
  return group;
}

function makeTool() {
  const group = new THREE.Group();
  group.add(block(1.35, 0.78, 1.1, COLORS.gray));
  const guard = block(1.0, 0.28, 0.14, COLORS.allow);
  guard.position.set(0, 0.55, -0.58);
  group.add(guard);
  const enclosure = block(1.54, 0.18, 1.28, COLORS.charcoal);
  enclosure.position.y = -0.48;
  group.add(enclosure);
  group.userData.revealParts = [{ obj: guard, base: guard.position.clone(), axis: "y", amount: 0.28 }];
  return group;
}

function makeApprovedRailModule() {
  const group = new THREE.Group();
  const base = block(0.9, 0.22, 0.72, COLORS.allow);
  base.position.y = -0.18;
  group.add(base);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 28, Math.PI), material(COLORS.allow, 0.38));
  arch.rotation.z = Math.PI;
  arch.position.set(0, 0.24, -0.08);
  arch.castShadow = true;
  group.add(arch);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12), material(COLORS.ink, 0.42));
  pin.position.set(0, 0.12, -0.08);
  group.add(pin);
  group.userData.revealParts = [{ obj: arch, base: arch.position.clone(), axis: "y", amount: 0.16 }];
  return group;
}

function makeEvidence() {
  const group = new THREE.Group();
  group.add(block(1.22, 0.72, 0.98, 0xf0eee4));
  const lid = block(1.0, 0.13, 0.74, COLORS.orange);
  lid.position.y = 0.48;
  group.add(lid);
  for (let i = 0; i < 3; i += 1) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.045), material(COLORS.ink, 0.5));
    slot.position.set(0, -0.08 + i * 0.14, -0.52);
    group.add(slot);
  }
  group.userData.revealParts = [{ obj: lid, base: lid.position.clone(), axis: "y", amount: 0.22 }];
  return group;
}

function makeHash() {
  const group = new THREE.Group();
  const blocks: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i += 1) {
    const h = block(0.42, 0.42, 0.42, i % 2 ? COLORS.gray : 0xf6f3e8);
    h.position.set((i - 1.5) * 0.42, 0, 0);
    group.add(h);
    blocks.push(h);
    if (i > 0) {
      const rail = railBetween(new THREE.Vector3((i - 2) * 0.42 + 0.21, 0, 0), new THREE.Vector3((i - 1.5) * 0.42 - 0.21, 0, 0), COLORS.ink, 0.018);
      group.add(rail);
    }
  }
  group.userData.revealParts = blocks.map((obj, index) => ({ obj, base: obj.position.clone(), axis: "x", amount: (index - 1.5) * 0.08 }));
  return group;
}

function makeInvestigation() {
  const group = new THREE.Group();
  group.add(block(1.32, 0.64, 1.0, COLORS.gray));
  const screen = block(0.76, 0.5, 0.08, COLORS.charcoal);
  screen.position.set(0, 0.42, -0.5);
  group.add(screen);
  const tray = block(0.9, 0.12, 0.42, COLORS.cream);
  tray.position.set(0, -0.05, 0.55);
  group.add(tray);
  group.userData.revealParts = [
    { obj: screen, base: screen.position.clone(), axis: "y", amount: 0.18 },
    { obj: tray, base: tray.position.clone(), axis: "z", amount: 0.18 },
  ];
  return group;
}

function buildModule(id: StageId) {
  switch (id) {
    case "devfix": return makeAgent();
    case "request": return makeRequest();
    case "contract": return makeContract();
    case "context": return makeContext();
    case "cedar": return makeCedar();
    case "gate": return makeGate();
    case "approved": return makeApprovedRailModule();
    case "tool": return makeTool();
    case "evidence": return makeEvidence();
    case "hash": return makeHash();
    case "investigation": return makeInvestigation();
    default: return block(1, 0.6, 0.8);
  }
}

function routeForDecision(decision: string): MachineRoute {
  if (decision === "ALLOW") return ALLOW_ROUTE;
  if (decision === "DENY") return DENY_ROUTE;
  return NEUTRAL_ROUTE;
}

function routePosition(route: MachineRoute, index: number) {
  return vectorFor(route[Math.max(0, Math.min(route.length - 1, index))], 0.62);
}

function routeIndexForEvent(event: any, route: MachineRoute, replayIndex = 0, total = 1) {
  if (!event) return Math.min(route.length - 1, 1);
  if (event.decision === "ISSUED") return Math.max(0, route.indexOf("contract"));
  if (event.decision === "UNAVAILABLE") return Math.max(0, route.indexOf("gate"));

  const toolIndex = route.indexOf("tool");
  const investigationIndex = route.indexOf("investigation");
  const branchEnd = event.decision === "DENY"
    ? (investigationIndex >= 0 ? investigationIndex : route.length - 1)
    : event.decision === "ALLOW"
      ? (toolIndex >= 0 ? toolIndex : route.length - 1)
      : route.length - 1;

  if (total <= 1) return branchEnd;

  if (replayIndex >= total - 1) return branchEnd;
  if (event.decision === "ALLOW" && replayIndex >= Math.max(0, total - 2)) return branchEnd;
  if (event.decision === "DENY" && replayIndex >= Math.max(0, total - 2)) return branchEnd;

  return Math.min(branchEnd, Math.max(1, replayIndex + 1));
}

function routePoints(route: MachineRoute, routeIndex: number) {
  return route.slice(0, Math.max(1, routeIndex + 1)).map((id) => vectorFor(id, 0.62));
}

function positionAlong(points: THREE.Vector3[], progress: number) {
  if (points.length === 0) return new THREE.Vector3();
  if (points.length === 1) return points[0].clone();
  const scaled = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return points[index].clone().lerp(points[index + 1], local);
}

function stageAlong(route: MachineRoute, progress: number) {
  const index = Math.min(route.length - 1, Math.max(0, Math.round(progress * (route.length - 1))));
  return route[index];
}

export default function BoundaryVisual({ height = 440, event = null, replayIndex = 0, total = 1 }: any) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<any>(null);
  const [selected, setSelected] = useState<StageId | null>(null);
  const [revealTick, setRevealTick] = useState(0);
  const [fullView, setFullView] = useState(false);
  const decision = event?.decision === "DENY" ? "DENY" : event?.decision === "ALLOW" ? "ALLOW" : "PENDING";
  const route = useMemo(() => routeForDecision(decision), [decision]);
  const activeStage = useMemo(() => route[routeIndexForEvent(event, route, replayIndex, total)] || "request", [event, route, replayIndex, total]);
  const inspector = selected ? INSPECTOR[selected] : INSPECTOR[activeStage];

  const selectStage = (stageId: StageId) => {
    setSelected(stageId);
    setRevealTick((tick) => tick + 1);
    const s = stateRef.current;
    if (!s) return;
    const stage = stageById[stageId];
    s.targetOrbit.set(stage.x, 0.2, stage.z);
    s.targetCamera.set(stage.x + 1.9, 4.5, stage.z + 3.7);
    s.revealStage = stageId;
    s.revealStart = performance.now();
  };

  const resizeRenderer = () => {
    const s = stateRef.current;
    if (!s || !mountRef.current) return;
    const w = Math.max(360, mountRef.current.clientWidth || 900);
    const h = Math.max(260, mountRef.current.clientHeight || height);
    s.renderer.setSize(w, h);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  };

  const resetMachineView = (useFullView = fullView) => {
    const s = stateRef.current;
    setSelected(null);
    if (!s) return;
    s.targetOrbit.copy(useFullView ? FULL_ORBIT : DEFAULT_ORBIT);
    s.targetCamera.copy(useFullView ? FULL_CAMERA : DEFAULT_CAMERA);
    s.revealStage = null;
    s.revealStart = 0;
  };

  const zoomMachine = (factor: number) => {
    const s = stateRef.current;
    if (!s) return;
    const dir = new THREE.Vector3().subVectors(s.targetCamera, s.targetOrbit);
    const nextDistance = Math.max(MIN_CAMERA_DISTANCE, Math.min(MAX_CAMERA_DISTANCE, dir.length() * factor));
    dir.normalize().multiplyScalar(nextDistance);
    s.targetCamera.copy(s.targetOrbit).add(dir);
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    mount.replaceChildren();
    const w = Math.max(360, mount.clientWidth || 900);
    const h = height;
    let rafId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.Fog(COLORS.bg, 28, 72);

    const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 1000);
    camera.position.copy(DEFAULT_CAMERA);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false;
    controls.enablePan = true;
    controls.maxPolarAngle = Math.PI / 2.18;
    controls.target.copy(DEFAULT_ORBIT);

    scene.add(new THREE.AmbientLight(0xffffff, 1.22));
    const key = new THREE.DirectionalLight(0xffffff, 2.35);
    key.position.set(-6, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffdfc0, 1.3);
    fill.position.set(8, 6, -6);
    scene.add(fill);

    const grid = new THREE.GridHelper(22, 22, COLORS.cream, 0xe8e8df);
    grid.position.y = -0.62;
    scene.add(grid);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.18, 5.8), material(0xf8f6ef, 0.9));
    platform.position.set(-0.2, -0.74, 0.28);
    platform.receiveShadow = true;
    scene.add(platform);

    const modules: Record<StageId, THREE.Group> = {} as Record<StageId, THREE.Group>;
    STAGES.forEach((stage) => {
      const module = buildModule(stage.id);
      module.position.set(stage.x, stage.id === "cedar" ? 0.05 : -0.06, stage.z);
      setStageId(module, stage.id);
      modules[stage.id] = module;
      scene.add(module);
    });

    const rails = {
      main: [
        railBetween(vectorFor("devfix"), vectorFor("request"), COLORS.orange),
        railBetween(vectorFor("request"), vectorFor("contract"), COLORS.orange),
        railBetween(vectorFor("contract"), vectorFor("context"), COLORS.orange),
        railBetween(vectorFor("context"), vectorFor("cedar"), COLORS.orange),
        railBetween(vectorFor("cedar"), vectorFor("gate"), COLORS.orange),
      ],
      allow: [
        railBetween(vectorFor("gate"), vectorFor("approved"), COLORS.allow, 0.045),
        railBetween(vectorFor("approved"), vectorFor("tool"), COLORS.allow, 0.045),
      ],
      deny: [
        railBetween(vectorFor("gate"), vectorFor("evidence"), COLORS.deny, 0.045),
        railBetween(vectorFor("evidence"), vectorFor("hash"), COLORS.deny, 0.045),
        railBetween(vectorFor("hash"), vectorFor("investigation"), COLORS.deny, 0.045),
      ],
    };
    [...rails.main, ...rails.allow, ...rails.deny].forEach((rail) => scene.add(rail));

    const requestBall = new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 28), material(COLORS.orange, 0.32));
    requestBall.castShadow = true;
    requestBall.name = "single-request-ball";
    scene.add(requestBall);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clickable = Object.values(modules);

    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickable, true)[0];
      const stageId = hit?.object?.userData?.stageId as StageId | undefined;
      if (!stageId) return;
      selectStage(stageId);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    stateRef.current = {
      scene,
      camera,
      renderer,
      controls,
      modules,
      rails,
      requestBall,
      ballRoute: routePoints(route, 1),
      ballProgress: 1,
      ballActiveStage: activeStage,
      targetCamera: DEFAULT_CAMERA.clone(),
      targetOrbit: DEFAULT_ORBIT.clone(),
      revealStage: null,
      revealStart: 0,
      activeStage,
      decision,
    };

    const resetRevealParts = () => {
      Object.values(modules).forEach((module: any) => {
        (module.userData.revealParts || []).forEach((part: any) => {
          if (part.base) part.obj.position.copy(part.base);
          if (part.baseRot) part.obj.rotation.copy(part.baseRot);
        });
      });
    };

    const animate = () => {
      if (disposed) return;
      const s = stateRef.current;
      if (!s || s.renderer !== renderer) return;

      s.ballProgress = Math.min(1, s.ballProgress + 0.022);
      const ballBase = positionAlong(s.ballRoute, s.ballProgress);
      s.requestBall.position.copy(ballBase);
      s.requestBall.position.y += Math.sin(Date.now() * 0.006) * 0.025;
      s.ballActiveStage = stageAlong(s.ballRoute.map((point: THREE.Vector3) => {
        const match = STAGES.find((stage) => Math.abs(stage.x - point.x) < 0.01 && Math.abs(stage.z - point.z) < 0.01);
        return (match?.id || "request") as StageId;
      }), s.ballProgress);

      resetRevealParts();
      const elapsed = performance.now() - s.revealStart;
      const reveal = s.revealStage && elapsed < 1300 ? Math.sin(Math.min(1, elapsed / 650) * Math.PI) : 0;
      if (s.revealStage && reveal > 0) {
        const module = modules[s.revealStage as StageId] as any;
        (module.userData.revealParts || []).forEach((part: any) => {
          if (part.axis && part.base) {
            part.obj.position.copy(part.base);
            part.obj.position[part.axis] += part.amount * reveal;
          }
          if (part.rotateY && part.baseRot) {
            part.obj.rotation.copy(part.baseRot);
            part.obj.rotation.y += part.rotateY * reveal * (s.decision === "DENY" ? -1 : 1);
          }
        });
      }

      s.camera.position.lerp(s.targetCamera, 0.055);
      s.controls.target.lerp(s.targetOrbit, 0.055);
      s.controls.update();
      s.renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => resizeRenderer();
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount && renderer.domElement.parentElement === mount) mount.replaceChildren();
      if (stateRef.current?.renderer === renderer) stateRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const routeIndex = routeIndexForEvent(event, route, replayIndex, total);
    s.ballRoute = routePoints(route, routeIndex);
    s.ballProgress = 0;
    s.activeStage = activeStage;
    s.decision = decision;

    Object.entries(s.modules).forEach(([id, module]: any) => {
      const dim = selected && id !== selected;
      module.scale.setScalar(id === activeStage || id === selected ? 1.08 : 1);
      module.traverse((obj: any) => {
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat: any) => {
            mat.transparent = true;
            mat.opacity = dim ? 0.28 : 1;
          });
        }
      });
    });
    [...s.rails.main, ...s.rails.allow, ...s.rails.deny].forEach((rail: THREE.Mesh) => {
      const mat = rail.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = 1;
    });
    s.rails.allow.forEach((rail: THREE.Mesh) => ((rail.material as THREE.MeshStandardMaterial).opacity = decision === "DENY" ? 0.18 : 1));
    s.rails.deny.forEach((rail: THREE.Mesh) => ((rail.material as THREE.MeshStandardMaterial).opacity = decision === "ALLOW" ? 0.18 : 1));
    (s.requestBall.material as THREE.MeshStandardMaterial).color.setHex(decision === "DENY" ? COLORS.deny : decision === "ALLOW" ? COLORS.allow : COLORS.orange);
  }, [event, route, replayIndex, total, activeStage, decision, selected, revealTick]);

  useEffect(() => {
    if (!fullView) return;
    document.body.classList.add("machine-fullview-open");
    return () => {
      document.body.classList.remove("machine-fullview-open");
    };
  }, [fullView]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      resizeRenderer();
      resetMachineView(fullView);
    });
    return () => cancelAnimationFrame(raf);
  }, [fullView, height]);

  const hint = event?.decision === "DENY"
    ? "DENY route: Cedar to Decision Gate to Evidence to SHA-256 to Post-Hoc Investigation."
    : event?.decision === "ALLOW"
      ? "ALLOW route: Cedar to Decision Gate to Protected Tool, then stop."
      : "Replay or select an event to move the single request ball through the machine.";

  return (
    <div className={["viz", "boundary-machine", fullView ? "boundary-machine-full" : ""].filter(Boolean).join(" ")} style={{ height: fullView ? "100vh" : height }}>
      <div ref={mountRef} className="boundary-machine-mount" />
      <div className="machine-view-controls" aria-label="3D machine view controls">
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); zoomMachine(0.84); }}>ZOOM IN</button>
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); zoomMachine(1.18); }}>ZOOM OUT</button>
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); resetMachineView(fullView); }}>RESET VIEW</button>
        <button
          className="btn sm"
          onClick={(e) => {
            e.stopPropagation();
            setFullView((value) => !value);
          }}>
          {fullView ? "EXIT FULL VIEW" : "FULL VIEW"}
        </button>
      </div>
      <div className="boundary-labels">
        {STAGES.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={"boundary-label boundary-label-" + stage.id}
            onClick={(e) => {
              e.stopPropagation();
              selectStage(stage.id);
            }}>
            <strong>{stage.label}</strong>
            <span>{stage.id === "request" ? event?.resource || stage.sub : stage.id === "contract" ? event?.contractId || stage.sub : stage.sub}</span>
          </button>
        ))}
      </div>
      <div className="vizlegend boundary-machine-legend">
        <span><span className="sdot" style={{ background: "#F47920" }} /> Runtime Pipeline</span>
        <span><span className="sdot" style={{ background: "#3E8B5C" }} /> Approved Rail</span>
        <span><span className="sdot" style={{ background: "#E5562F" }} /> Rejected Rail</span>
      </div>
      <div className="vizhint">{hint}</div>
      {event ? (
        <div className="vizstate">
          <div className="mono dim" style={{ fontSize: 9 }}>{fmtT(event.t)} &middot; {event.id}</div>
          <div style={{ marginTop: 2 }}>
            <span className={event.decision === "DENY" ? "d" : "a"}>{event.decision}</span>
            <span className="dim"> &middot; {event.action}</span>
          </div>
        </div>
      ) : null}
      {total > 1 ? (
        <div className="boundary-replay-index mono">
          {String(replayIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      ) : null}
      <aside className="machine-inspector" aria-live="polite">
        <div className="mono">{selected ? "INSPECTING" : "ACTIVE MODULE"}</div>
        <h3>{inspector.title}</h3>
        <p>{inspector.body}</p>
        <strong>{inspector.boundary}</strong>
      </aside>
    </div>
  );
}

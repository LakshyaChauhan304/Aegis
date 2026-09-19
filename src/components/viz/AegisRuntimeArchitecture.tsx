import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  RUNTIME_ARCHITECTURE_NODES,
  RUNTIME_ARCHITECTURE_RAILS,
  RuntimeBranch,
  RuntimeEventLike,
  RuntimeNodeId,
  RUNTIME_COMPONENT_EXPLANATIONS,
  RuntimeCedarDecision,
  RuntimeDemoMode,
  RuntimeRoute,
  buildRuntimeArchitectureInspector,
  getRuntimeArchitectureDemoRoute,
  getRuntimeArchitectureRoute,
  nodeById,
} from "./AegisRuntimeArchitectureModel.ts";

type SceneObject = THREE.Object3D & { material?: THREE.Material | THREE.Material[] };

type Props = {
  height?: number;
  event?: RuntimeEventLike | null;
  chain?: any;
  analysis?: any;
};

type RuntimeInspectionPhase = "overview" | "focused" | "revealed";
type RuntimeCedarDecisionState = "EVALUATING" | RuntimeCedarDecision;

type RuntimeSceneState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  root: THREE.Group;
  nodes: Record<string, THREE.Group>;
  rails: THREE.Group[];
  route: RuntimeRoute;
  selected: RuntimeNodeId | null;
  fullView: boolean;
  compactUi: boolean;
  inspectionPhase: RuntimeInspectionPhase;
  targetCamera: THREE.Vector3;
  targetOrbit: THREE.Vector3;
  routeProgress: number;
  routeKey: string;
  cedarDecision: RuntimeCedarDecisionState;
  demoSpeed: number;
  targetDemoSpeed: number;
  demoPlaying: boolean;
};

const COLORS = {
  bg: 0x101216,
  floor: 0x191c21,
  grid: 0x343940,
  shell: 0xe8e5dc,
  shellWarm: 0xf4f1e9,
  aluminum: 0xb9c0c4,
  brushed: 0x9ea7ac,
  darkMetal: 0x30343a,
  blackDetail: 0x111418,
  glass: 0x9ed7ff,
  cyan: 0x5e8fc9,
  allow: 0x57a96c,
  deny: 0xd96a3d,
  amber: 0xc4922f,
  fg: 0xe7e9ec,
  dim: 0x5c636b,
};

const ZOOM_LIMITS = { min: 3.2, max: 38 };
const WHEEL_ZOOM_SENSITIVITY = 0.00085;
const PINCH_ZOOM_SENSITIVITY = 0.00105;
const DEFAULT_CAMERA = new THREE.Vector3(3.2, 9.8, 19.5);
const DEFAULT_ORBIT = new THREE.Vector3(2.2, 0, 0);
const FULL_VIEW_CAMERA = new THREE.Vector3(2.4, 12.6, 27.2);
const FULL_VIEW_ORBIT = new THREE.Vector3(2.2, -0.05, 0);

const DEMO_STATUS: Record<RuntimeDemoMode, { label: string; path: string; terminal: string; color: string }> = {
  allow: {
    label: "DEMO MODE · ALLOW",
    path: "AUTHORIZATION PATH",
    terminal: "TERMINAL: PROTECTED TOOL",
    color: "var(--allow)",
  },
  deny: {
    label: "DEMO MODE · DENY",
    path: "ERROR / STOP PATH",
    terminal: "TERMINAL: POST-HOC INVESTIGATION",
    color: "var(--deny)",
  },
};

function getDemoAwareExplanation(selected: RuntimeNodeId | null, mode: RuntimeDemoMode) {
  const key = selected || "cedar";
  const explanation = RUNTIME_COMPONENT_EXPLANATIONS[key];

  if (key === "cedar") {
    return {
      ...explanation,
      howItWorks:
        mode === "allow"
          ? "REQUEST -> CONTEXT -> AUTHORIZATION CORE -> ALLOW -> APPROVED PATH. Cedar produces ALLOW for this demo and the request continues only to the decision gate and protected tool."
          : "REQUEST -> CONTEXT -> AUTHORIZATION CORE -> DENY -> STOPPED / AUDIT PATH. Cedar produces DENY for this demo and the request stays off the protected-tool branch.",
      relatedComponents:
        mode === "allow"
          ? "Context -> Cedar -> Allow -> Decision Gate -> Protected Tool"
          : "Context -> Cedar -> Deny -> Stop / Lock -> Evidence -> Hash Chain -> Investigation",
    };
  }

  if (key === "decision") {
    return {
      ...explanation,
      howItWorks:
        mode === "allow"
          ? "ALLOW opens the enforcement gate; the request ball passes through and stops at the protected tool."
          : "DENY keeps the protected-tool gate locked; the request ball never enters the tool branch and continues along the stopped/audit path.",
      relatedComponents:
        mode === "allow"
          ? "Cedar -> Allow -> Decision Gate -> Protected Tool"
          : "Cedar -> Deny -> Stop / Lock -> Evidence",
    };
  }

  return explanation;
}

function runtimeStateForNode(selected: RuntimeNodeId | null, cedarDecision: RuntimeCedarDecisionState) {
  if (!selected) return "REQUEST ENTERING CONTROL PLANE";
  if (cedarDecision === "EVALUATING") return "CEDAR EVALUATING";
  if (selected === "tool" && cedarDecision === "DENY") return "INACTIVE - DENIED PATH";
  if ((selected === "evidence" || selected === "hash" || selected === "investigation") && cedarDecision === "ALLOW") {
    return "INSPECTABLE - NOT ON CURRENT ALLOW RUNTIME PATH";
  }
  if ((selected === "decision" || selected === "tool") && cedarDecision === "ALLOW") return "ACTIVE - APPROVED PATH";
  if ((selected === "evidence" || selected === "hash" || selected === "investigation") && cedarDecision === "DENY") {
    return "ACTIVE - DENIED AUDIT PATH";
  }
  return cedarDecision === "ALLOW" ? "ALLOW DECISION ACTIVE" : "DENY DECISION ACTIVE";
}

function normalizedWheelDelta(event: WheelEvent) {
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
  return THREE.MathUtils.clamp(event.deltaY * scale, -360, 360);
}

function zoomFactorFromWheel(event: WheelEvent) {
  const sensitivity = event.ctrlKey ? PINCH_ZOOM_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY;
  return Math.exp(THREE.MathUtils.clamp(normalizedWheelDelta(event) * sensitivity, -0.32, 0.32));
}

function applyCameraZoom(state: RuntimeSceneState, factor: number) {
  const target = state.targetOrbit;
  const cameraTarget = state.targetCamera;
  const direction = cameraTarget.clone().sub(target);
  const nextDistance = THREE.MathUtils.clamp(
    direction.length() * factor,
    state.controls.minDistance || ZOOM_LIMITS.min,
    state.controls.maxDistance || ZOOM_LIMITS.max
  );
  cameraTarget.copy(target.clone().add(direction.normalize().multiplyScalar(nextDistance)));
}

function makeMaterial(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.46,
    metalness: 0.38,
    ...options,
  });
}

function makeLineMaterial(color: number, opacity = 0.7) {
  return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
}

function setNodeId(object: THREE.Object3D, nodeId: RuntimeNodeId) {
  object.userData.nodeId = nodeId;
  object.traverse((child) => {
    child.userData.nodeId = nodeId;
  });
}

function setBranch(object: THREE.Object3D, branch: RuntimeBranch) {
  object.userData.branch = branch;
  object.traverse((child) => {
    child.userData.branch = branch;
  });
}

function routeDecision(route: RuntimeRoute): RuntimeCedarDecision {
  return route.activeBranch === "approved" ? "ALLOW" : "DENY";
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child: SceneObject) => {
    if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
    const material = child.material;
    const disposeMaterial = (mat: THREE.Material) => {
      const maybeMapped = mat as THREE.Material & { map?: THREE.Texture };
      if (maybeMapped.map) maybeMapped.map.dispose();
      mat.dispose();
    };
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
}

function copyOpacity(material: THREE.Material | THREE.Material[], opacity: number) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    const m = mat as THREE.MeshStandardMaterial;
    m.transparent = opacity < 1 || m.transparent;
    m.opacity = opacity;
  }
}

function createBox(size: [number, number, number], material: THREE.Material, position: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    makeLineMaterial(COLORS.blackDetail, 0.24)
  );
  edges.userData.decorative = true;
  mesh.add(edges);
  return mesh;
}

function createCylinder(radius: number, depth: number, material: THREE.Material, position: [number, number, number], axis: "x" | "y" | "z" = "y") {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 28), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function addBolts(group: THREE.Group, positions: Array<[number, number, number]>, material: THREE.Material) {
  for (const pos of positions) {
    const bolt = createCylinder(0.055, 0.035, material, pos, "z");
    group.add(bolt);
  }
}

function addVentSlats(group: THREE.Group, x: number, y: number, z: number, count: number, material: THREE.Material) {
  for (let i = 0; i < count; i += 1) {
    group.add(createBox([0.05, 0.04, 0.58], material, [x + i * 0.13, y, z]));
  }
}

function rememberExploded(object: THREE.Object3D, exploded: [number, number, number]) {
  object.userData.closedPosition = object.position.clone();
  object.userData.explodedPosition = new THREE.Vector3(exploded[0], exploded[1], exploded[2]);
}

function addInspectionCallout(group: THREE.Group, text: string, pos: [number, number, number], points: Array<[number, number, number]>) {
  group.add(createTechLabel(text, pos));
  group.add(createLeaderLine(points));
}

function createLabel(text: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 34px Inter, Segoe UI, sans-serif";
  ctx.fillStyle = "#E7E9EC";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 52);
  ctx.font = "24px JetBrains Mono, Consolas, monospace";
  ctx.fillStyle = "#8A9198";
  ctx.fillText(subtitle, 256, 92);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.86 }));
  sprite.scale.set(2.15, 0.54, 1);
  sprite.position.y = 1.48;
  sprite.userData.decorative = true;
  sprite.userData.worldLabel = true;
  return sprite;
}

function createTechLabel(text: string, position: [number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 20px JetBrains Mono, Consolas, monospace";
  ctx.fillStyle = "#DCEEFF";
  ctx.textAlign = "left";
  ctx.fillText(text, 18, 45);
  ctx.strokeStyle = "rgba(94,143,201,.55)";
  ctx.strokeRect(6, 12, Math.min(610, ctx.measureText(text).width + 32), 48);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0 }));
  sprite.scale.set(1.8, 0.28, 1);
  sprite.position.set(position[0], position[1], position[2]);
  sprite.userData.inspectLabel = true;
  sprite.userData.decorative = true;
  return sprite;
}

function createLeaderLine(points: Array<[number, number, number]>) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
    makeLineMaterial(COLORS.cyan, 0)
  );
  line.userData.inspectLabel = true;
  line.userData.decorative = true;
  return line;
}

function createNodeHitTarget(nodeId: RuntimeNodeId) {
  const width = nodeId === "hash" ? 2.6 : nodeId === "investigation" ? 2.7 : 2.45;
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(width, 2.45, 2.45), material);
  hit.position.set(0, 0.35, 0);
  hit.name = `${nodeId}-hit-target`;
  hit.userData.hitTarget = true;
  return hit;
}

function createRail(from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const group = new THREE.Group();
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from);
  const length = dir.length();
  const railMat = makeMaterial(COLORS.aluminum, { roughness: 0.34, metalness: 0.78 });
  const accentMat = makeMaterial(color, { emissive: color, emissiveIntensity: 0.18, roughness: 0.38, metalness: 0.48 });

  for (const offset of [-0.22, 0.22]) {
    const geo = new THREE.BoxGeometry(length, 0.11, 0.09);
    const mesh = new THREE.Mesh(geo, railMat.clone());
    mesh.position.copy(mid);
    mesh.position.x += dir.z === 0 ? 0 : 0;
    mesh.position.z += offset;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
    group.add(mesh);
  }
  const accent = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, 0.04), accentMat);
  accent.position.copy(mid);
  accent.position.y += 0.1;
  accent.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
  group.add(accent);

  const sleeperCount = Math.max(2, Math.floor(length / 1.1));
  for (let i = 1; i < sleeperCount; i += 1) {
    const t = i / sleeperCount;
    const pos = from.clone().lerp(to, t);
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.78), makeMaterial(COLORS.darkMetal, { roughness: 0.5, metalness: 0.7 }));
    sleeper.position.copy(pos);
    sleeper.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
    group.add(sleeper);
  }

  const hit = new THREE.Mesh(new THREE.BoxGeometry(length, 0.45, 1.05), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(mid);
  hit.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
  group.add(hit);
  return group;
}

function createMachineNode(nodeId: RuntimeNodeId) {
  const node = nodeById(nodeId)!;
  const group = new THREE.Group();
  const branchColor = node.branch === "approved" ? COLORS.allow : node.branch === "rejected" ? COLORS.deny : COLORS.cyan;
  const baseMat = makeMaterial(COLORS.shell, { roughness: 0.42, metalness: 0.28 });
  const warmMat = makeMaterial(COLORS.shellWarm, { roughness: 0.38, metalness: 0.2 });
  const aluminumMat = makeMaterial(COLORS.aluminum, { roughness: 0.31, metalness: 0.86 });
  const brushedMat = makeMaterial(COLORS.brushed, { roughness: 0.48, metalness: 0.8 });
  const darkMat = makeMaterial(COLORS.darkMetal, { roughness: 0.5, metalness: 0.78 });
  const blackMat = makeMaterial(COLORS.blackDetail, { roughness: 0.55, metalness: 0.62 });
  const glassMat = makeMaterial(COLORS.glass, { transparent: true, opacity: 0.28, metalness: 0.04, roughness: 0.08 });
  const accentMat = makeMaterial(branchColor, { emissive: branchColor, emissiveIntensity: 0.18, roughness: 0.35, metalness: 0.42 });
  const cyanMat = makeMaterial(COLORS.cyan, { emissive: COLORS.cyan, emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.35 });

  if (nodeId === "cedar") {
    group.add(createBox([2.35, 1.42, 1.9], brushedMat, [0, 0.24, 0]));
    group.add(createBox([1.92, 1.04, 1.48], warmMat, [0, 0.32, 0]));
    const leftShell = createBox([0.48, 1.66, 2.08], baseMat, [-1.24, 0.38, 0]);
    const rightShell = createBox([0.48, 1.66, 2.08], baseMat, [1.24, 0.38, 0]);
    const topShell = createBox([2.36, 0.24, 2.08], baseMat, [0, 1.26, 0]);
    const glassPanel = createBox([1.48, 0.08, 1.18], glassMat, [0, 1.42, 0]);
    leftShell.name = "cedar-left-shell";
    rightShell.name = "cedar-right-shell";
    topShell.name = "cedar-top-shell";
    glassPanel.name = "cedar-glass-panel";
    rememberExploded(leftShell, [-1.86, 0.42, -0.18]);
    rememberExploded(rightShell, [1.86, 0.42, 0.18]);
    rememberExploded(topShell, [0, 1.82, 0]);
    rememberExploded(glassPanel, [0, 1.62, -0.72]);
    group.add(leftShell, rightShell, topShell, glassPanel);

    const core = createCylinder(0.44, 0.5, cyanMat, [0, 0.48, 0], "z");
    core.name = "cedar-core";
    rememberExploded(core, [0, 0.48, -0.34]);
    group.add(core);
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.18, 0.025, 10, 48), i % 2 ? aluminumMat : cyanMat);
      ring.position.set(0, 0.48, -0.02 + i * 0.04);
      ring.rotation.x = Math.PI / 2;
      ring.name = `cedar-ring-${i}`;
      rememberExploded(ring, [0, 0.48 + i * 0.08, -0.16 - i * 0.12]);
      group.add(ring);
    }
    for (const x of [-0.72, -0.36, 0.36, 0.72]) {
      group.add(createBox([0.05, 0.66, 0.08], blackMat, [x, 0.45, 0.66]));
      group.add(createBox([0.05, 0.66, 0.08], blackMat, [x, 0.45, -0.66]));
    }
    for (const z of [-0.86, 0.86]) {
      group.add(createCylinder(0.07, 0.68, aluminumMat, [-0.78, 0.42, z], "x"));
      group.add(createCylinder(0.07, 0.68, aluminumMat, [0.78, 0.42, z], "x"));
    }
    for (const x of [-0.98, 0.98]) {
      group.add(createBox([0.18, 0.18, 2.34], darkMat, [x, -0.48, 0]));
    }
    addBolts(group, [
      [-1.26, 1.05, -0.86], [-1.26, 1.05, 0.86], [1.26, 1.05, -0.86], [1.26, 1.05, 0.86],
      [-1.26, -0.18, -0.86], [-1.26, -0.18, 0.86], [1.26, -0.18, -0.86], [1.26, -0.18, 0.86],
    ], blackMat);
    addVentSlats(group, -0.42, 1.05, 1.04, 7, blackMat);

    const labels: Array<{
      text: string;
      pos: [number, number, number];
      points: Array<[number, number, number]>;
    }> = [
      { text: "CEDAR AUTHORIZATION CORE", pos: [1.34, 1.38, -1.12], points: [[0.4, 0.62, -0.28], [1.0, 1.14, -0.9]] },
      { text: "TRANSPARENT INSPECTION WINDOW", pos: [-2.08, 1.56, -0.82], points: [[-0.54, 1.42, -0.42], [-1.54, 1.45, -0.7]] },
      { text: "MECHANICAL POLICY RINGS", pos: [1.24, 0.04, 1.04], points: [[0.62, 0.5, 0.22], [1.0, 0.22, 0.78]] },
    ];
    for (const { text, pos, points } of labels) {
      group.add(createTechLabel(text, pos));
      group.add(createLeaderLine(points));
    }
  } else if (nodeId === "decision") {
    group.add(createBox([2.25, 0.28, 1.42], brushedMat, [0, -0.3, 0]));
    group.add(createBox([2.42, 0.18, 0.16], aluminumMat, [0, 0.86, -0.82]));
    group.add(createBox([2.42, 0.18, 0.16], aluminumMat, [0, 0.86, 0.82]));
    group.add(createBox([0.16, 1.34, 1.6], darkMat, [-1.22, 0.32, 0]));
    group.add(createBox([0.16, 1.34, 1.6], darkMat, [1.22, 0.32, 0]));
    const leftGate = createBox([0.82, 1.08, 0.22], accentMat, [-0.44, 0.28, 0]);
    const rightGate = createBox([0.82, 1.08, 0.22], accentMat, [0.44, 0.28, 0]);
    leftGate.name = "gate-left";
    rightGate.name = "gate-right";
    rememberExploded(leftGate, [-1.05, 0.28, -0.08]);
    rememberExploded(rightGate, [1.05, 0.28, 0.08]);
    group.add(leftGate, rightGate);
    group.add(createBox([1.7, 0.36, 0.75], baseMat, [0, 1.12, 0]));
    group.add(createCylinder(0.12, 2.18, darkMat, [0, 1.1, -0.98], "x"));
    group.add(createBox([0.18, 0.18, 0.18], accentMat, [0.92, 1.34, 0.5]));
    addBolts(group, [[-1.1, 0.96, -0.72], [1.1, 0.96, -0.72], [-1.1, 0.96, 0.72], [1.1, 0.96, 0.72]], blackMat);
    addInspectionCallout(group, "DECISION GATE / PEP", [1.12, 1.55, -1.0], [[0.55, 0.62, -0.1], [0.98, 1.24, -0.78]]);
  } else if (nodeId === "rejected") {
    group.add(createBox([2.25, 0.32, 1.35], brushedMat, [0, -0.3, 0]));
    group.add(createBox([1.86, 1.1, 0.32], accentMat, [0, 0.28, 0]));
    group.add(createBox([1.22, 0.58, 0.46], baseMat, [0, 0.18, 0]));
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.075, 10, 32, Math.PI), accentMat);
    shackle.position.set(0, 0.98, 0);
    shackle.rotation.z = Math.PI;
    group.add(shackle);
    addBolts(group, [[-0.72, 0.44, -0.19], [0.72, 0.44, -0.19], [-0.72, -0.08, -0.19], [0.72, -0.08, -0.19]], blackMat);
    addInspectionCallout(group, "STOP / LOCK", [1.06, 1.28, 0.82], [[0.42, 0.66, 0.08], [0.9, 1.04, 0.62]]);
  } else if (nodeId === "tool") {
    group.add(createBox([2.35, 1.15, 1.35], baseMat, [0, 0.25, 0]));
    const toolCover = createBox([1.82, 0.62, 0.96], glassMat, [0, 0.34, 0]);
    toolCover.name = "tool-glass-cover";
    rememberExploded(toolCover, [0, 0.74, -0.45]);
    group.add(toolCover);
    const toolCore = createBox([1.04, 0.28, 0.42], accentMat, [0, 0.28, 0]);
    toolCore.name = "tool-core";
    rememberExploded(toolCore, [0, 0.28, -0.2]);
    group.add(toolCore);
    group.add(createBox([1.98, 0.12, 0.16], accentMat, [0, 1.04, -0.52]));
    group.add(createBox([1.98, 0.12, 0.16], accentMat, [0, 1.04, 0.52]));
    const approvedEnd = createBox([0.34, 0.74, 1.08], accentMat, [1.34, 0.32, 0]);
    approvedEnd.name = "approved-terminal-end";
    group.add(approvedEnd);
    group.add(createCylinder(0.08, 1.9, darkMat, [0, -0.18, -0.72], "x"));
    group.add(createCylinder(0.08, 1.9, darkMat, [0, -0.18, 0.72], "x"));
    addVentSlats(group, -0.46, 0.86, 0.7, 8, blackMat);
    addInspectionCallout(group, "PROTECTED TOOL / filesystem.read", [1.26, 1.34, -0.92], [[0.36, 0.46, -0.18], [1.04, 1.06, -0.72]]);
    addInspectionCallout(group, "APPROVED END", [1.42, -0.18, 0.96], [[1.28, 0.34, 0.44], [1.38, 0.02, 0.78]]);
  } else if (nodeId === "evidence") {
    group.add(createBox([2.2, 1.15, 1.45], baseMat, [0, 0.25, 0]));
    group.add(createBox([1.78, 0.8, 1.02], warmMat, [0, 0.25, 0]));
    for (let i = 0; i < 4; i += 1) {
      const record = createBox([0.22, 0.58, 1.05], accentMat, [-0.66 + i * 0.44, 0.35, 0]);
      record.name = `evidence-record-${i}`;
      rememberExploded(record, [-0.66 + i * 0.44, 0.35 + i * 0.03, -0.18 - i * 0.08]);
      group.add(record);
    }
    group.add(createBox([1.9, 0.06, 1.2], glassMat, [0, 1.02, 0]));
    addBolts(group, [[-0.96, 0.82, -0.58], [0.96, 0.82, -0.58], [-0.96, 0.82, 0.58], [0.96, 0.82, 0.58]], blackMat);
    addInspectionCallout(group, "EVIDENCE / EVENT RECORD", [1.15, 1.34, -0.94], [[0.35, 0.58, -0.3], [0.94, 1.08, -0.76]]);
  } else if (nodeId === "hash") {
    for (let i = 0; i < 4; i += 1) {
      const block = createBox([0.72, 0.72, 0.72], i % 2 ? baseMat : aluminumMat, [-0.9 + i * 0.6, 0.25, 0]);
      block.rotation.y = Math.PI / 4;
      block.name = `hash-block-${i}`;
      rememberExploded(block, [-1.1 + i * 0.74, 0.25, i % 2 ? 0.18 : -0.18]);
      group.add(block);
      if (i < 3) group.add(createCylinder(0.045, 0.42, darkMat, [-0.6 + i * 0.6, 0.25, 0], "x"));
    }
    addInspectionCallout(group, "SHA-256 HASH CHAIN", [1.25, 1.18, -0.86], [[0.35, 0.46, -0.15], [1.02, 0.96, -0.68]]);
  } else if (nodeId === "investigation") {
    group.add(createBox([2.1, 0.9, 1.3], baseMat, [0, 0.18, 0]));
    const analysisPane = createBox([1.5, 0.44, 0.82], glassMat, [0, 0.25, 0]);
    const evidenceInput = createBox([0.58, 0.18, 0.72], cyanMat, [-0.48, 0.28, -0.08]);
    const postHocOutput = createBox([0.58, 0.18, 0.72], accentMat, [0.48, 0.28, 0.08]);
    rememberExploded(analysisPane, [0, 0.52, -0.42]);
    rememberExploded(evidenceInput, [-0.78, 0.28, -0.32]);
    rememberExploded(postHocOutput, [0.78, 0.28, 0.32]);
    group.add(analysisPane, evidenceInput, postHocOutput);
    group.add(createBox([1.6, 0.08, 0.12], accentMat, [0, 0.82, 0]));
    addVentSlats(group, -0.38, 0.62, 0.64, 7, blackMat);
    addInspectionCallout(group, "INVESTIGATION / POST-HOC", [1.24, 1.18, -0.86], [[0.34, 0.5, -0.18], [1.0, 0.94, -0.66]]);
  } else {
    group.add(createBox([2, 0.95, 1.18], baseMat, [0, 0.18, 0]));
    const inner = createBox([1.55, 0.5, 0.78], nodeId === "context" ? glassMat : warmMat, [0, 0.25, 0]);
    const topPlate = createBox([1.75, 0.08, 0.12], accentMat, [0, 0.82, 0]);
    rememberExploded(inner, [0, 0.36, nodeId === "context" ? -0.34 : -0.2]);
    rememberExploded(topPlate, [0, 1.04, 0]);
    group.add(inner, topPlate);
    group.add(createBox([0.12, 0.82, 1.36], darkMat, [-1.05, 0.14, 0]));
    group.add(createBox([0.12, 0.82, 1.36], darkMat, [1.05, 0.14, 0]));
    addBolts(group, [[-0.84, 0.58, -0.46], [0.84, 0.58, -0.46], [-0.84, -0.12, 0.46], [0.84, -0.12, 0.46]], blackMat);
    if (nodeId === "request") {
      const packetCore = createBox([1.08, 0.24, 0.48], aluminumMat, [0, 0.32, 0]);
      const metadataPlate = createBox([0.82, 0.08, 0.54], cyanMat, [0, 0.54, -0.02]);
      packetCore.name = "request-metadata-packet";
      metadataPlate.name = "request-metadata-plate";
      rememberExploded(packetCore, [0, 0.32, -0.28]);
      rememberExploded(metadataPlate, [0, 0.74, -0.34]);
      group.add(packetCore, metadataPlate);
    } else if (nodeId === "devfix") {
      const identityCore = createBox([0.82, 0.26, 0.52], cyanMat, [0, 0.28, 0]);
      identityCore.name = "devfix-identity-core";
      rememberExploded(identityCore, [0, 0.38, -0.3]);
      group.add(identityCore);
    } else if (nodeId === "contract") {
      for (let i = 0; i < 3; i += 1) {
        const layer = createBox([1.1 - i * 0.16, 0.06, 0.58], i === 1 ? cyanMat : accentMat, [0, 0.2 + i * 0.16, 0]);
        layer.name = `contract-scope-layer-${i}`;
        rememberExploded(layer, [0, 0.2 + i * 0.18, -0.22 - i * 0.11]);
        group.add(layer);
      }
    } else if (nodeId === "context") {
      for (let i = 0; i < 3; i += 1) {
        const pane = createBox([0.18, 0.46, 0.64], i === 2 ? accentMat : glassMat, [-0.42 + i * 0.42, 0.28, 0]);
        pane.name = `context-provenance-pane-${i}`;
        rememberExploded(pane, [-0.5 + i * 0.5, 0.34, -0.24 - i * 0.05]);
        group.add(pane);
      }
    }
    const calloutText =
      nodeId === "devfix" ? "DEVFIX / AGENT"
        : nodeId === "request" ? "REQUEST / TOOL CALL"
          : nodeId === "contract" ? "TASK CONTRACT / SCOPE"
            : "CONTEXT / PROVENANCE";
    addInspectionCallout(group, calloutText, [1.12, 1.16, -0.76], [[0.32, 0.5, -0.12], [0.92, 0.94, -0.58]]);
  }

  group.add(createLabel(node.label, node.subtitle));
  group.add(createNodeHitTarget(nodeId));
  group.position.set(node.position[0], node.position[1], node.position[2]);
  setNodeId(group, nodeId);
  setBranch(group, node.branch);
  return group;
}

export default function AegisRuntimeArchitecture({ height = 320, event, chain, analysis }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<RuntimeSceneState | null>(null);
  const [selected, setSelected] = useState<RuntimeNodeId | null>(null);
  const [revealCycle, setRevealCycle] = useState(0);
  const [fullView, setFullView] = useState(false);
  const [inspectionPhase, setInspectionPhase] = useState<RuntimeInspectionPhase>("overview");
  const [demoMode, setDemoMode] = useState<RuntimeDemoMode>("allow");
  const [cedarDecision, setCedarDecision] = useState<RuntimeCedarDecisionState>("EVALUATING");
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [compactUi, setCompactUi] = useState(false);
  const route = useMemo(() => getRuntimeArchitectureDemoRoute(demoMode), [demoMode]);
  const liveRoute = useMemo(() => getRuntimeArchitectureRoute(event), [event]);
  const inspector = useMemo(
    () => buildRuntimeArchitectureInspector(selected || "cedar", event, chain, analysis),
    [selected, event, chain, analysis]
  );
  const explanation = useMemo(() => getDemoAwareExplanation(selected, demoMode), [selected, demoMode]);
  const demoStatus = DEMO_STATUS[demoMode];
  const selectInspectionNode = (nodeId: RuntimeNodeId | null) => {
    if (!nodeId) return;
    setInspectionPhase("focused");
    setSelected(nodeId);
    setRevealCycle((cycle) => cycle + 1);
    setFullView(true);
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth || 900;
    const initialHeight = mount.clientHeight || height;
    setCompactUi(width < 620);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.Fog(COLORS.bg, 28, 58);

    const camera = new THREE.PerspectiveCamera(42, width / initialHeight, 0.1, 1000);
    camera.position.copy(DEFAULT_CAMERA);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, initialHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableZoom = false;
    controls.minDistance = 4;
    controls.maxDistance = 46;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.enablePan = true;
    controls.zoomSpeed = 0.55;
    controls.rotateSpeed = 0.58;
    controls.panSpeed = 0.42;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.target.copy(DEFAULT_ORBIT);

    scene.add(new THREE.AmbientLight(0xffffff, 0.56));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-8, 12, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaecfff, 1.1);
    fill.position.set(8, 7, -7);
    scene.add(fill);
    const cyan = new THREE.PointLight(COLORS.cyan, 1.55, 18);
    cyan.position.set(1, 4, -4);
    scene.add(cyan);
    const warn = new THREE.PointLight(COLORS.amber, 0.8, 16);
    warn.position.set(7, 4, 4);
    scene.add(warn);

    const rearPanelMat = makeMaterial(0x171b21, { roughness: 0.72, metalness: 0.16 });
    for (let i = 0; i < 6; i += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.05, 1.2), rearPanelMat);
      panel.position.set(-12 + i * 6.4, -0.92, -4.15);
      panel.rotation.x = -0.16;
      panel.userData.decorative = true;
      scene.add(panel);
    }

    const floor = new THREE.Mesh(new THREE.BoxGeometry(43, 0.1, 7.4), makeMaterial(COLORS.floor, { roughness: 0.58, metalness: 0.26 }));
    floor.position.set(4, -0.86, 0);
    scene.add(floor);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(42, 0.04, 5.8), makeMaterial(0x20242b, { roughness: 0.5, metalness: 0.34 }));
    platform.position.set(4, -0.78, 0);
    platform.userData.decorative = true;
    scene.add(platform);
    const grid = new THREE.GridHelper(42, 26, COLORS.grid, COLORS.darkMetal);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const mat of gridMaterials) {
      mat.transparent = true;
      mat.opacity = 0.08;
    }
    grid.position.set(4, -0.8, 0);
    scene.add(grid);

    const root = new THREE.Group();
    scene.add(root);
    const nodes: Record<string, THREE.Group> = {};
    const rails: THREE.Group[] = [];
    const clickables: THREE.Object3D[] = [];

    for (const rail of RUNTIME_ARCHITECTURE_RAILS) {
      const from = nodeById(rail.from)!;
      const to = nodeById(rail.to)!;
      const color = rail.branch === "approved" ? COLORS.allow : rail.branch === "rejected" ? COLORS.deny : COLORS.cyan;
      const railGroup = createRail(
        new THREE.Vector3(from.position[0], -0.48, from.position[2]),
        new THREE.Vector3(to.position[0], -0.48, to.position[2]),
        color
      );
      railGroup.userData.railId = rail.id;
      railGroup.userData.nodeId = rail.branch === "approved" ? "approved" : rail.branch === "rejected" ? "rejected" : rail.to;
      setBranch(railGroup, rail.branch);
      root.add(railGroup);
      rails.push(railGroup);
      clickables.push(...railGroup.children);
    }

    for (const node of RUNTIME_ARCHITECTURE_NODES) {
      const group = createMachineNode(node.id);
      root.add(group);
      nodes[node.id] = group;
      clickables.push(...group.children);
    }

    const requestBallMat = makeMaterial(COLORS.aluminum, { emissive: COLORS.cyan, emissiveIntensity: 0.18, roughness: 0.22, metalness: 0.86 });
    const requestBall = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 20), requestBallMat);
    requestBall.name = "runtime-request-ball";
    requestBall.position.set(-16, -0.18, 0);
    root.add(requestBall);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const targetCamera = DEFAULT_CAMERA.clone();
    const targetOrbit = DEFAULT_ORBIT.clone();
    const isSelectableHit = (object: THREE.Object3D) => {
      if (!object.userData.nodeId || object.userData.decorative || !(object instanceof THREE.Mesh)) return false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      return !materials.some((material) => material instanceof THREE.MeshBasicMaterial && material.visible === false);
    };

    const onPointerDown = (ev: PointerEvent) => {
      ev.stopPropagation();
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      let selectedId: RuntimeNodeId | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const node of RUNTIME_ARCHITECTURE_NODES) {
        const projected = new THREE.Vector3(node.position[0], 0.35, node.position[2]).project(camera);
        const distance = projected.distanceTo(new THREE.Vector3(pointer.x, pointer.y, projected.z));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          selectedId = node.id;
        }
      }
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickables, true);
      const hit = hits.find((item) => isSelectableHit(item.object));
      const hitId = hit?.object.userData.nodeId as RuntimeNodeId | undefined;
      const nodeId = nearestDistance < 0.22 ? selectedId : hitId || null;
      if (nodeId) {
        setSelected(nodeId);
        setFullView(true);
        setInspectionPhase("focused");
      }
    };

    const onWheel = (ev: WheelEvent) => {
      if (!renderer.domElement.contains(ev.target as Node)) return;
      const absX = Math.abs(ev.deltaX);
      const absY = Math.abs(ev.deltaY);
      if (absY > 0 || ev.ctrlKey || absX > absY) {
        ev.preventDefault();
        if (stateRef.current) applyCameraZoom(stateRef.current, zoomFactorFromWheel(ev));
      }
    };

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || width;
      const h = mountRef.current.clientHeight || height;
      setCompactUi(w < 620);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    let frame = 0;
    let raf = 0;
    const animate = () => {
      frame += 0.01;
      const animatedRoute = stateRef.current?.route || route;
      const selectedNode = stateRef.current?.selected || null;
      const phase = stateRef.current?.inspectionPhase || "overview";
      const state = stateRef.current;
      const architectureScale = state?.fullView && state.compactUi && !selectedNode ? 0.58 : 1;
      root.scale.lerp(new THREE.Vector3(architectureScale, architectureScale, architectureScale), 0.08);
      if (state) {
        state.demoSpeed += (state.targetDemoSpeed - state.demoSpeed) * 0.045;
      }
      const cedarWaypointIndex = animatedRoute.waypoints.indexOf("cedar");
      const nextDecision = routeDecision(animatedRoute);
      if (state && cedarWaypointIndex >= 0) {
        const reachedCedar = state.routeProgress >= cedarWaypointIndex;
        if (reachedCedar && state.cedarDecision !== nextDecision) {
          state.cedarDecision = nextDecision;
          setCedarDecision(nextDecision);
        } else if (!reachedCedar && state.cedarDecision !== "EVALUATING") {
          state.cedarDecision = "EVALUATING";
          setCedarDecision("EVALUATING");
        }
      }
      const active = state?.cedarDecision === "EVALUATING" ? "neutral" : animatedRoute.activeBranch;
      const revealAmount = selectedNode && phase === "revealed" ? 1 : 0;

      const routeNodes = animatedRoute.waypoints
        .map((id: RuntimeNodeId) => nodeById(id))
        .filter(Boolean)
        .map((node: any) => new THREE.Vector3(node.position[0], 0.85, node.position[2]));
      if (routeNodes.length > 1) {
        const total = routeNodes.length - 1;
        if (state && state.demoPlaying) {
          state.routeProgress = Math.min(total, state.routeProgress + 0.012 * state.demoSpeed);
          if (state.routeProgress >= total) {
            state.demoPlaying = false;
            setDemoPlaying(false);
          }
        }
        const raw = Math.min(state?.routeProgress ?? 0, total);
        const idx = Math.floor(raw);
        const local = raw - idx;
        requestBall.position.copy(routeNodes[idx].clone().lerp(routeNodes[Math.min(idx + 1, total)], local));
        requestBall.position.y = -0.18 + Math.sin(frame * 6) * 0.035;
        const requestColor = active === "approved" ? COLORS.allow : active === "rejected" ? COLORS.deny : COLORS.fg;
        requestBallMat.color.setHex(requestColor);
        requestBallMat.emissive.setHex(requestColor);
      }

      for (const node of RUNTIME_ARCHITECTURE_NODES) {
        const group = nodes[node.id];
        const selectedMatch = selectedNode === node.id;
        const branchActive = active === "neutral" || node.branch === "neutral" || node.branch === active;
        const opacity = selectedNode ? (selectedMatch ? 1 : branchActive ? 0.28 : 0.16) : branchActive ? 1 : 0.24;
        group.traverse((child: SceneObject) => {
          if (child.userData.hitTarget) return;
          if (child.material) copyOpacity(child.material, opacity);
          if (child.userData.worldLabel && child.material) {
            copyOpacity(child.material, selectedNode ? (selectedMatch ? 0.72 : 0.03) : 0.72);
          }
        });
        group.scale.lerp(new THREE.Vector3(selectedMatch ? 1.12 : 1, selectedMatch ? 1.12 : 1, selectedMatch ? 1.12 : 1), 0.08);
      }

      for (const rail of rails) {
        const branch = rail.userData.branch;
        const activeRail = active === "neutral" || branch === "neutral" || branch === active;
        rail.traverse((child: SceneObject) => {
          if (child.material) copyOpacity(child.material, selectedNode ? (activeRail ? 0.72 : 0.14) : activeRail ? 1 : 0.2);
        });
      }

      const gate = nodes.decision;
      const gateOpen = active === "approved";
      const inspectGate = selectedNode === "decision";
      const leftGate = gate.getObjectByName("gate-left");
      const rightGate = gate.getObjectByName("gate-right");
      if (leftGate && rightGate) {
        leftGate.position.x += ((inspectGate ? -1.05 : gateOpen ? -0.88 : -0.44) - leftGate.position.x) * 0.08;
        rightGate.position.x += ((inspectGate ? 1.05 : gateOpen ? 0.88 : 0.44) - rightGate.position.x) * 0.08;
      }

      for (const node of RUNTIME_ARCHITECTURE_NODES) {
        const group = nodes[node.id];
        const inspectNode = selectedNode === node.id;
        group.traverse((part: SceneObject) => {
          if (part.userData.hitTarget) return;
          const closed = part.userData.closedPosition as THREE.Vector3 | undefined;
          const exploded = part.userData.explodedPosition as THREE.Vector3 | undefined;
          if (closed && exploded && node.id !== "decision") {
            part.position.lerp(inspectNode && phase === "revealed" ? exploded : closed, 0.08);
          }
          if (inspectNode && revealAmount) {
            if (node.id === "cedar" && part.name.startsWith("cedar-ring-")) {
              part.rotation.z += 0.012 + Number(part.name.slice(-1)) * 0.004;
            }
            if (node.id === "hash" && part.name.startsWith("hash-block-")) {
              part.rotation.y += 0.006;
            }
            if (node.id === "evidence" && part.name.startsWith("evidence-record-")) {
              part.position.y += Math.sin(frame * 4 + Number(part.name.slice(-1))) * 0.002;
            }
            if (node.id === "context" && part.name.startsWith("context-provenance-pane-")) {
              part.position.z += Math.sin(frame * 3 + Number(part.name.slice(-1))) * 0.0015;
            }
          }
          if (part.userData.inspectLabel && part.material) {
            const list = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of list) {
              material.transparent = true;
              material.opacity += ((inspectNode && phase === "revealed" ? 0.84 : 0) - material.opacity) * 0.1;
            }
          }
        });
      }

      camera.position.lerp(targetCamera, 0.045);
      controls.target.lerp(targetOrbit, 0.065);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    stateRef.current = {
      scene,
      camera,
      renderer,
      controls,
      root,
      nodes,
      rails,
      route,
      selected: null,
      fullView: false,
      compactUi: width < 620,
      inspectionPhase: "overview",
      targetCamera,
      targetOrbit,
      routeProgress: 0,
      routeKey: route.waypoints.join(">"),
      cedarDecision: "EVALUATING",
      demoSpeed: 1,
      targetDemoSpeed: 1,
      demoPlaying: false,
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!stateRef.current) return;
    const routeKey = route.waypoints.join(">");
    if (stateRef.current.routeKey !== routeKey) {
      stateRef.current.routeProgress = 0;
      stateRef.current.routeKey = routeKey;
      stateRef.current.cedarDecision = "EVALUATING";
      stateRef.current.demoPlaying = false;
      setCedarDecision("EVALUATING");
      setDemoPlaying(false);
    }
    stateRef.current.route = route;
  }, [route]);

  useEffect(() => {
    if (!selected) {
      setInspectionPhase("overview");
      return;
    }
    setInspectionPhase("focused");
    const timer = window.setTimeout(() => setInspectionPhase("revealed"), 260);
    return () => window.clearTimeout(timer);
  }, [selected]);

  useEffect(() => {
    if (!stateRef.current) return;
    stateRef.current.selected = selected;
    stateRef.current.fullView = fullView;
    stateRef.current.compactUi = compactUi;
    stateRef.current.inspectionPhase = inspectionPhase;
    stateRef.current.targetDemoSpeed = selected ? 0.32 : 1;
    const renderer = stateRef.current.renderer as THREE.WebGLRenderer;
    const camera = stateRef.current.camera as THREE.PerspectiveCamera;
    requestAnimationFrame(() => {
      if (!mountRef.current || !renderer || !camera) return;
      const w = mountRef.current.clientWidth || 900;
      const h = mountRef.current.clientHeight || height;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
      const selectedNode = selected ? nodeById(selected) : null;
    if (selectedNode) {
      const [x, , z] = selectedNode.position;
      stateRef.current.targetOrbit.set(x, selected === "cedar" ? 0.62 : 0.42, z);
      const cameraPresets: Partial<Record<RuntimeNodeId, [number, number, number]>> = {
        devfix: [2.5, 3.2, 4.2],
        request: [2.4, 3.0, 3.9],
        contract: [2.4, 3.1, 4.0],
        context: [2.5, 3.2, 4.0],
        cedar: [2.8, 3.45, 4.8],
        approved: [2.4, 2.9, 3.8],
        rejected: [2.4, 2.9, 3.8],
        decision: [2.7, 3.2, 4.0],
        tool: [2.5, 3.1, 4.0],
        evidence: [2.5, 3.0, 3.9],
        hash: [2.35, 2.9, 3.7],
        investigation: [2.6, 3.15, 4.1],
      };
      const [dx, dy, dz] = cameraPresets[selected] || [2.6, 4.1, 5.0];
      stateRef.current.targetCamera.set(x + dx, dy, z + dz);
      stateRef.current.controls.minDistance = 2.6;
      stateRef.current.controls.maxDistance = 12;
    } else {
      stateRef.current.targetOrbit.copy(fullView ? FULL_VIEW_ORBIT : DEFAULT_ORBIT);
      stateRef.current.targetCamera.copy(fullView ? FULL_VIEW_CAMERA : DEFAULT_CAMERA);
      stateRef.current.controls.minDistance = 4;
      stateRef.current.controls.maxDistance = 46;
    }
  }, [selected, fullView, compactUi, inspectionPhase, height]);

  const activeText =
    cedarDecision === "EVALUATING"
      ? "CEDAR EVALUATING..."
      : cedarDecision === "ALLOW"
        ? "CEDAR DECISION: ALLOW"
        : "CEDAR DECISION: DENY";
  const runtimeStateText = runtimeStateForNode(selected, cedarDecision);
  const liveText =
    liveRoute.activeBranch === "approved"
      ? "LIVE EVENT · ALLOW"
      : liveRoute.activeBranch === "rejected"
        ? "LIVE EVENT · DENY"
        : "LIVE EVENT · AWAITING DECISION";
  const condensedDemoPanel = compactUi && fullView;

  const zoomCamera = (factor: number) => {
    const state = stateRef.current;
    if (!state) return;
    applyCameraZoom(state, factor);
  };

  const restartDemo = () => {
    setSelected(null);
    setInspectionPhase("overview");
    const state = stateRef.current;
    if (!state) return;
    state.routeProgress = 0;
    state.routeKey = route.waypoints.join(">");
    state.cedarDecision = "EVALUATING";
    state.demoSpeed = 1;
    state.targetDemoSpeed = 1;
    state.demoPlaying = true;
    setCedarDecision("EVALUATING");
    setDemoPlaying(true);
  };

  const changeDemoMode = (mode: RuntimeDemoMode) => {
    if (mode === demoMode) {
      restartDemo();
      return;
    }
    const state = stateRef.current;
    if (state) {
      state.routeProgress = 0;
      state.cedarDecision = "EVALUATING";
      state.demoSpeed = 1;
      state.targetDemoSpeed = 1;
      state.demoPlaying = false;
    }
    setSelected(null);
    setInspectionPhase("overview");
    setCedarDecision("EVALUATING");
    setDemoPlaying(false);
    setDemoMode(mode);
  };

  const resetView = () => {
    setSelected(null);
    setInspectionPhase("overview");
    setFullView(false);
    const state = stateRef.current;
    if (!state) return;
    state.targetOrbit.copy(DEFAULT_ORBIT);
    state.targetCamera.copy(DEFAULT_CAMERA);
    state.targetDemoSpeed = 1;
  };

  return (
    <div
      className="viz"
      style={{
        height: fullView ? "calc(100vh - 48px)" : height,
        position: fullView ? "fixed" : "relative",
        inset: fullView ? 24 : undefined,
        zIndex: fullView ? 1000 : undefined,
        border: fullView ? "1px solid var(--line-2)" : undefined,
        boxShadow: fullView ? "0 24px 80px rgba(0,0,0,.72)" : undefined,
      }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {!demoPlaying && !selected ? (
        <div
          style={{
            position: "absolute",
            left: selected && !compactUi ? "50%" : "var(--s3)",
            top: fullView ? 18 : "var(--s3)",
            right: compactUi ? "var(--s3)" : undefined,
            transform: selected && !compactUi ? "translateX(-50%)" : undefined,
            pointerEvents: "auto",
            zIndex: 30,
            border: "1px solid rgba(158,215,255,.18)",
            background: "rgba(12,14,18,.76)",
            backdropFilter: "blur(10px)",
            padding: condensedDemoPanel ? 7 : 8,
            width: compactUi ? "auto" : fullView ? 300 : 252,
          }}>
          <div className="mono dim" style={{ fontSize: 9, letterSpacing: ".12em", marginBottom: condensedDemoPanel ? 4 : 6 }}>RUNTIME DEMO</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: condensedDemoPanel ? 5 : 7 }}>
            <button
              className="btn sm"
              aria-pressed={demoMode === "allow"}
              onClick={(e) => {
                e.stopPropagation();
                changeDemoMode("allow");
              }}
              style={{
                borderColor: demoMode === "allow" ? "rgba(87,169,108,.72)" : undefined,
                color: demoMode === "allow" ? "var(--allow)" : undefined,
              }}>
              ALLOW
            </button>
            <button
              className="btn sm"
              aria-pressed={demoMode === "deny"}
              onClick={(e) => {
                e.stopPropagation();
                changeDemoMode("deny");
              }}
              style={{
                borderColor: demoMode === "deny" ? "rgba(217,106,61,.72)" : undefined,
                color: demoMode === "deny" ? "var(--deny)" : undefined,
              }}>
              DENY / ERROR
            </button>
          </div>
          {condensedDemoPanel ? (
            <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.45, color: demoStatus.color }}>
              {demoMode === "allow" ? "DEMO ALLOW" : "DEMO DENY"} · CEDAR: {cedarDecision} · {liveText}
            </div>
          ) : (
            <>
              <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.55, color: demoStatus.color }}>
                <div>{cedarDecision === "EVALUATING" ? demoStatus.label : "DEMO COMPLETE"}</div>
                <div>{demoStatus.path}</div>
                <div>{demoStatus.terminal}</div>
                <div style={{ color: cedarDecision === "EVALUATING" ? "var(--muted)" : demoStatus.color }}>
                  CEDAR: {cedarDecision}
                </div>
              </div>
              <div className="mono dim" style={{ fontSize: 9, marginTop: 6 }}>{liveText}</div>
            </>
          )}
          <button
            className="btn sm"
            onClick={(e) => {
              e.stopPropagation();
              restartDemo();
            }}
            style={{ marginTop: condensedDemoPanel ? 5 : 7, width: "100%" }}>
            REPLAY DEMO
          </button>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: compactUi ? "var(--s3)" : "var(--s3)",
          left: compactUi ? "var(--s3)" : undefined,
          top: compactUi ? (demoPlaying ? "var(--s3)" : fullView ? 134 : 252) : "var(--s3)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          width: compactUi ? "auto" : fullView ? 230 : 198,
          pointerEvents: "auto",
          zIndex: 50,
        }}>
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); zoomCamera(0.82); }}>ZOOM IN</button>
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); zoomCamera(1.18); }}>ZOOM OUT</button>
        {selected ? (
          <button className="btn sm" style={{ gridColumn: "1 / -1" }} onClick={(e) => { e.stopPropagation(); resetView(); }}>
            BACK TO ARCHITECTURE
          </button>
        ) : (
          <>
            <button className="btn sm" onClick={(e) => { e.stopPropagation(); resetView(); }}>RESET VIEW</button>
            <button
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                setFullView((v) => !v);
              }}>
              {fullView ? "EXIT FULL VIEW" : "FULL VIEW"}
            </button>
          </>
        )}
      </div>
      <div className="vizlegend" style={{ zIndex: 20, pointerEvents: "none", display: compactUi ? "none" : undefined }}>
        <span><span className="sdot" style={{ background: "#5E8FC9" }} /> RUNTIME PIPELINE</span>
        <span><span className="sdot" style={{ background: "#57A96C" }} /> APPROVED RAIL</span>
        <span><span className="sdot" style={{ background: "#D25C5C" }} /> REJECTED RAIL</span>
      </div>
      <div className="vizhint" style={{ zIndex: 20, pointerEvents: "none", display: compactUi ? "none" : undefined }}>{activeText}</div>
      {demoPlaying ? (
        <div
          style={{
            position: "absolute",
            right: "var(--s3)",
            bottom: fullView ? 24 : 46,
            zIndex: 45,
            pointerEvents: "none",
          }}>
          <button
            className="btn sm"
            onClick={(e) => {
              e.stopPropagation();
              restartDemo();
            }}
            style={{
              pointerEvents: "auto",
              borderColor: "rgba(158,215,255,.26)",
              background: "rgba(12,14,18,.72)",
              backdropFilter: "blur(8px)",
            }}>
            REPLAY DEMO
          </button>
        </div>
      ) : null}
      {selected ? (
        <div
          style={{
            position: "absolute",
            left: compactUi ? "var(--s3)" : fullView ? 28 : "var(--s3)",
            right: compactUi ? "var(--s3)" : fullView ? "auto" : "var(--s4)",
            top: compactUi ? (fullView ? 212 : 300) : fullView ? 84 : 86,
            bottom: fullView ? 28 : 42,
            width: compactUi ? "auto" : fullView ? 360 : "min(360px, calc(100% - 28px))",
            pointerEvents: "auto",
            zIndex: 40,
          }}>
          <div style={{ border: "1px solid rgba(158,215,255,.22)", background: "rgba(12,14,18,.84)", backdropFilter: "blur(10px)", padding: 14, overflow: "auto", height: "100%", maxHeight: "100%", boxShadow: "0 20px 70px rgba(0,0,0,.42)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 10 }}>
              <div>
                <div className="mono dim" style={{ fontSize: 9, letterSpacing: ".12em" }}>INSPECTION · {inspectionPhase.toUpperCase()}</div>
                <div style={{ fontWeight: 800, fontSize: 18, marginTop: 3 }}>{inspector.title}</div>
                <div className="dim" style={{ fontSize: 11 }}>{explanation.runtimeRole}</div>
              </div>
            </div>
            <div className="mono" style={{ fontSize: 10, color: route.activeBranch === "approved" ? "var(--allow)" : route.activeBranch === "rejected" ? "var(--deny)" : "var(--muted)", marginBottom: 12 }}>
              {activeText}
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 9, marginTop: 9 }}>
              <div className="mono dim" style={{ fontSize: 9, letterSpacing: ".1em", marginBottom: 5 }}>RUNTIME STATE</div>
              <div className="mono" style={{ fontSize: 11, color: cedarDecision === "ALLOW" ? "var(--allow)" : cedarDecision === "DENY" ? "var(--deny)" : "var(--muted)" }}>{runtimeStateText}</div>
            </div>
            {[
              ["WHAT IT DOES", explanation.whatItDoes],
              ["HOW IT WORKS", explanation.howItWorks],
              ["SECURITY BOUNDARY", explanation.securityBoundary],
              ["RELATED", explanation.relatedComponents],
            ].map(([label, value]) => (
              <div key={label} style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 9, marginTop: 9 }}>
                <div className="mono dim" style={{ fontSize: 9, letterSpacing: ".1em", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55 }}>{value}</div>
              </div>
            ))}
            <div className="mono dim" style={{ fontSize: 9, letterSpacing: ".1em", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}>RUNTIME DATA</div>
            {inspector.rows.map((row) => (
              <div key={row.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, fontSize: 10.5, padding: "3px 0", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                <span className="dim">{row.label}</span>
                <span className="mono" style={{ overflowWrap: "anywhere" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

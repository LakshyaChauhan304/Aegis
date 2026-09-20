import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CONTRACT, SESSION } from "../../data/fixtures.js";

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
};

type MachineId = "agent" | "request" | "contract" | "context" | "pep" | "cedar" | "decision" | "tool" | "evidence" | "hash" | "investigation";

const MACHINE_STAGES: Array<{
  id: MachineId;
  label: string;
  sub: string;
  pos: [number, number, number];
  size: [number, number, number];
  tone: number;
}> = [
  { id: "agent", label: "AGENT", sub: "DEVFIX", pos: [-2.35, 2.35, 0], size: [1.4, 0.84, 0.74], tone: 0xf2efe5 },
  { id: "request", label: "REQUEST", sub: "ACTION", pos: [-1.55, 1.06, 0], size: [1.24, 0.68, 0.72], tone: 0xfcffff },
  { id: "contract", label: "TASK", sub: "CONTRACT", pos: [-0.78, -0.28, 0], size: [1.56, 0.8, 0.86], tone: 0xf6f3e8 },
  { id: "context", label: "CONTEXT", sub: "PROVENANCE", pos: [0.15, -1.38, 0], size: [1.34, 0.72, 0.82], tone: 0xfcffff },
  { id: "pep", label: "AEGIS", sub: "PEP", pos: [-0.18, -2.62, 0], size: [1.58, 1.12, 1.0], tone: 0x161613 },
  { id: "cedar", label: "CEDAR", sub: "AUTHORITY", pos: [1.28, -1.88, 0.18], size: [1.14, 0.96, 0.86], tone: 0x24241f },
  { id: "decision", label: "DECISION", sub: "GATE", pos: [1.28, -3.12, 0], size: [0.92, 0.62, 0.7], tone: 0xf6f3e8 },
  { id: "tool", label: "PROTECTED", sub: "TOOL", pos: [-1.48, -4.45, -0.05], size: [1.42, 0.8, 0.9], tone: 0xf4f1e8 },
  { id: "evidence", label: "EVIDENCE", sub: "RECORDED", pos: [1.78, -4.4, 0.05], size: [1.5, 0.8, 0.9], tone: 0xf4f1e8 },
  { id: "hash", label: "SHA-256", sub: "CHAIN", pos: [3.35, -4.3, 0.1], size: [1.0, 0.58, 0.7], tone: 0xf6f3e8 },
  { id: "investigation", label: "POST-HOC", sub: "INVESTIGATION", pos: [4.75, -4.12, 0.12], size: [1.34, 0.66, 0.82], tone: 0xf4f1e8 },
];

const stageById = Object.fromEntries(MACHINE_STAGES.map((stage) => [stage.id, stage])) as Record<MachineId, typeof MACHINE_STAGES[number]>;
const FLOW_ROUTE: MachineId[] = ["agent", "request", "contract", "context", "pep", "cedar", "decision", "tool", "evidence", "hash", "investigation"];
const FOCUS_VIEWS: Partial<Record<MachineId, { offset: [number, number, number]; lift: number }>> = {
  agent: { offset: [1.35, 1.55, 3.15], lift: 0.32 },
  request: { offset: [1.35, 1.45, 3], lift: 0.28 },
  contract: { offset: [1.55, 1.28, 3.05], lift: 0.24 },
  context: { offset: [1.45, 1.18, 2.9], lift: 0.22 },
  pep: { offset: [1.7, 1.45, 3.15], lift: 0.2 },
  cedar: { offset: [1.45, 1.3, 2.8], lift: 0.24 },
  decision: { offset: [1.25, 1.05, 2.45], lift: 0.18 },
  tool: { offset: [1.35, 1.1, 2.65], lift: 0.2 },
  evidence: { offset: [1.25, 1.05, 2.55], lift: 0.2 },
  hash: { offset: [1.2, 1, 2.35], lift: 0.18 },
  investigation: { offset: [1.25, 1, 2.45], lift: 0.18 },
};

function mat(color: number, roughness = 0.72) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06 });
  material.transparent = true;
  return material;
}

function edgeMat(color = COLORS.ink) {
  const material = new THREE.LineBasicMaterial({ color });
  material.transparent = true;
  return material;
}

function textTexture(label: string, sub: string, dark = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark ? "#FCFFFF" : "#0A0A0A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 54px Arial, sans-serif";
  ctx.fillText(label, 256, 102);
  ctx.font = "800 28px Arial, sans-serif";
  ctx.fillText(sub, 256, 158);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

function makeLabel(stage: typeof MACHINE_STAGES[number]) {
  const dark = stage.tone < 0x303030;
  const texture = textTexture(stage.label, stage.sub, dark);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(stage.size[0] * 0.74, stage.size[1] * 0.44),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  plane.position.set(0, stage.size[1] * 0.08, stage.size[2] / 2 + 0.006);
  return plane;
}

function makeBlock(stage: typeof MACHINE_STAGES[number]) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(...stage.size), mat(stage.tone, stage.id === "pep" || stage.id === "cedar" ? 0.48 : 0.76));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), edgeMat(stage.tone < 0x303030 ? 0xfcffff : COLORS.ink));
  group.add(edges);

  const accent = new THREE.Mesh(new THREE.BoxGeometry(stage.size[0] * 0.56, 0.065, 0.08), mat(COLORS.orange, 0.36));
  accent.position.set(0, stage.size[1] / 2 + 0.04, -stage.size[2] * 0.32);
  accent.castShadow = true;
  group.add(accent);

  const base = new THREE.Mesh(new THREE.BoxGeometry(stage.size[0] + 0.24, 0.12, stage.size[2] + 0.24), mat(stage.id === "pep" ? COLORS.charcoal : COLORS.cream, 0.82));
  base.position.y = -stage.size[1] / 2 - 0.1;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  group.add(makeLabel(stage));
  group.position.set(...stage.pos);
  group.userData.id = stage.id;
  group.traverse((obj) => {
    obj.userData.id = stage.id;
  });
  return group;
}

function pointFor(id: MachineId, lift = 0.56) {
  const stage = stageById[id];
  return new THREE.Vector3(stage.pos[0], stage.pos[1] + lift, stage.pos[2]);
}

function railBetween(a: THREE.Vector3, b: THREE.Vector3, color = COLORS.orange, radius = 0.045) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 18), mat(color, 0.36));
  rail.position.copy(a).add(b).multiplyScalar(0.5);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  rail.castShadow = true;
  return rail;
}

function routePosition(progress: number) {
  const points = FLOW_ROUTE.map((id) => pointFor(id, 0.72));
  const scaled = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  return points[index].clone().lerp(points[index + 1], scaled - index);
}

function introEase(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerpNumber(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sampleVector(keys: Array<{ p: number; value: THREE.Vector3 }>, progress: number) {
  const p = clamp01(progress);
  for (let index = 0; index < keys.length - 1; index += 1) {
    const current = keys[index];
    const next = keys[index + 1];
    if (p >= current.p && p <= next.p) {
      const local = introEase((p - current.p) / Math.max(0.0001, next.p - current.p));
      return current.value.clone().lerp(next.value, local);
    }
  }
  return keys[keys.length - 1].value.clone();
}

function OnboardingMachine() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<any>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    mount.replaceChildren();
    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.Fog(COLORS.bg, 22, 54);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const target = new THREE.Vector3(1.15, -2.18, 0);
    const model = new THREE.Group();
    scene.add(model);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-5, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffd6a6, 1.35);
    fill.position.set(7, 4, -5);
    scene.add(fill);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.12, 5.4), mat(0xf7f4ea, 0.9));
    floor.position.set(0.55, -3.18, 0.05);
    floor.rotation.z = -0.01;
    floor.receiveShadow = true;
    model.add(floor);

    const grid = new THREE.GridHelper(11, 22, COLORS.cream, 0xe8e8df);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0.55, -3.09, 0.08);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.34;
    });
    model.add(grid);

    const backdrop = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 20, 80), mat(COLORS.orange, 0.6));
    backdrop.position.set(1.65, -0.92, -1.24);
    backdrop.rotation.set(1.1, 0, -0.08);
    backdrop.scale.set(1, 1, 0.16);
    model.add(backdrop);

    const modules: Record<MachineId, THREE.Group> = {} as Record<MachineId, THREE.Group>;
    MACHINE_STAGES.forEach((stage) => {
      const module = makeBlock(stage);
      modules[stage.id] = module;
      model.add(module);
    });

    const rails: THREE.Mesh[] = [];
    FLOW_ROUTE.slice(0, -1).forEach((id, index) => {
      const next = FLOW_ROUTE[index + 1];
      const start = pointFor(id, 0.72);
      const end = pointFor(next, 0.72);
      rails.push(railBetween(start, end, COLORS.orange));
    });
    rails.forEach((rail) => model.add(rail));

    const gateArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 1.05), mat(COLORS.orange, 0.36));
    gateArm.position.copy(pointFor("decision", 0.98));
    gateArm.rotation.z = -0.38;
    gateArm.castShadow = true;
    model.add(gateArm);

    const capsule = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 32), mat(COLORS.orange, 0.26));
    (capsule.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(COLORS.orange);
    (capsule.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.22;
    capsule.castShadow = true;
    model.add(capsule);

    const requestLight = new THREE.PointLight(COLORS.orange, 1.1, 3.4);
    model.add(requestLight);

    const trail = Array.from({ length: 5 }, (_, index) => {
      const material = mat(COLORS.orange, 0.42);
      material.opacity = 0.28 - index * 0.035;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13 - index * 0.012, 20, 20), material);
      model.add(dot);
      return dot;
    });

    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), mat(COLORS.orange, 0.32));
    (pulse.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(COLORS.orange);
    (pulse.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.16;
    model.add(pulse);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clickable = Object.values(modules);

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const framing = {
      center,
      size,
      distance: 18,
    };

    const fitDistance = (aspect: number, margin = 1.55) => {
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const vertical = size.y / (2 * Math.tan(fov / 2));
      const horizontal = size.x / (2 * Math.tan(fov / 2) * Math.max(0.65, aspect));
      return Math.max(12, Math.max(vertical, horizontal) * margin + size.z * 1.25);
    };

    const resize = () => {
      if (!mountRef.current) return;
      const w = Math.max(320, mountRef.current.clientWidth || 900);
      const h = Math.max(320, mountRef.current.clientHeight || 700);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      framing.distance = fitDistance(camera.aspect, w < 720 ? 1.9 : 1.58);
    };
    resize();

    const setFocus = (id: MachineId | null) => {
      const s = stateRef.current;
      if (!s) return;
      s.focus = id;
      if (id) {
        const view = FOCUS_VIEWS[id] || { lift: 0.24, offset: [1.45, 1.25, 2.85] as [number, number, number] };
        s.target.copy(pointFor(id, view.lift));
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickable, true)[0];
      const id = hit?.object?.userData?.id as MachineId | undefined;
      renderer.domElement.style.cursor = id ? "pointer" : "default";
      stateRef.current.hover = id || null;
    };

    const onPointerLeave = () => {
      renderer.domElement.style.cursor = "default";
      stateRef.current.hover = null;
    };

    const onPointerDown = () => {
      const hitId = stateRef.current.hover as MachineId | null;
      if (!hitId) {
        setFocus(null);
        return;
      }
      setFocus(stateRef.current.focus === hitId ? null : hitId);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocus(null);
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);

    stateRef.current = {
      camera,
      target,
      focus: null,
      hover: null,
      modules,
      rails,
      trail,
      requestLight,
      model,
      box,
      center,
      size,
      framing,
      started: performance.now(),
      scroll: 0,
    };

    const onScroll = () => {
      const host = mountRef.current?.closest(".onboard-scroll-stage") as HTMLElement | null;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const max = Math.max(1, host.offsetHeight - window.innerHeight);
      stateRef.current.scroll = clamp01(-rect.top / max);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const animate = () => {
      if (disposed) return;
      const s = stateRef.current;
      const now = performance.now();
      const intro = introEase((now - s.started) / 2700);
      const scroll = s.scroll || 0;
      const idle = Math.sin(now * 0.0011) * 0.006;
      const cycle = clamp01(lerpNumber(intro * 0.08, scroll, 0.92) + idle);

      capsule.position.copy(routePosition(cycle));
      capsule.position.z += Math.sin(now * 0.004) * 0.035;
      requestLight.position.copy(capsule.position);
      requestLight.position.z += 0.45;
      trail.forEach((dot: THREE.Mesh, index: number) => {
        const lag = Math.max(0, cycle - (index + 1) * 0.016);
        dot.position.copy(routePosition(lag));
        dot.position.z += 0.025 + index * 0.01;
        (dot.material as THREE.MeshStandardMaterial).opacity = 0.26 - index * 0.035;
      });
      pulse.position.copy(routePosition(Math.min(1, cycle + 0.05)));

      const denyMoment = scroll > 0.58 && scroll < 0.73;
      const allowMoment = scroll > 0.72 && scroll < 0.88;
      gateArm.rotation.z = (denyMoment ? -0.86 : allowMoment ? 0.28 : -0.18) + Math.sin(now * 0.0018) * 0.04;
      backdrop.rotation.z = -0.08 + Math.sin(now * 0.00055) * 0.035;

      const d = s.framing.distance;
      const cameraKeys = [
        { p: 0, value: new THREE.Vector3(s.center.x + 1.4, s.center.y + 5.85, d * 0.78) },
        { p: 0.18, value: new THREE.Vector3(-4.7, 4.55, d * 0.66) },
        { p: 0.36, value: new THREE.Vector3(-2.05, 2.0, d * 0.5) },
        { p: 0.56, value: new THREE.Vector3(1.95, 0.35, d * 0.42) },
        { p: 0.72, value: new THREE.Vector3(3.35, -1.45, d * 0.4) },
        { p: 0.88, value: new THREE.Vector3(0.3, -4.2, d * 0.52) },
        { p: 1, value: new THREE.Vector3(s.center.x + 1.75, s.center.y + 5.95, d * 0.86) },
      ];
      const targetKeys = [
        { p: 0, value: new THREE.Vector3(s.center.x + 0.15, s.center.y - 0.1, 0) },
        { p: 0.18, value: pointFor("request", 0.34) },
        { p: 0.36, value: pointFor("contract", 0.26) },
        { p: 0.56, value: new THREE.Vector3(0.7, -2.12, 0.05) },
        { p: 0.72, value: pointFor("decision", 0.26) },
        { p: 0.88, value: new THREE.Vector3(0.15, -4.32, 0.08) },
        { p: 1, value: new THREE.Vector3(s.center.x + 0.22, s.center.y - 0.24, 0) },
      ];
      const scrollCamera = sampleVector(cameraKeys, scroll);
      scrollCamera.x += Math.sin(now * 0.00055) * 0.08;
      scrollCamera.z += Math.cos(now * 0.0007) * 0.12;
      if (s.focus) {
        const id = s.focus as MachineId;
        const view = FOCUS_VIEWS[id] || { lift: 0.24, offset: [1.45, 1.25, 2.85] as [number, number, number] };
        const focusTarget = pointFor(id, view.lift);
        scrollCamera.set(
          focusTarget.x + view.offset[0],
          focusTarget.y + view.offset[1],
          focusTarget.z + view.offset[2]
        );
      }
      camera.position.lerp(scrollCamera, 0.055);
      target.lerp(s.focus ? s.target : sampleVector(targetKeys, scroll), 0.065);
      camera.lookAt(target);
      model.rotation.z = THREE.MathUtils.lerp(model.rotation.z, -0.025 + Math.sin(scroll * Math.PI * 1.7) * 0.05, 0.05);
      model.rotation.x = THREE.MathUtils.lerp(model.rotation.x, Math.sin(scroll * Math.PI) * 0.018, 0.05);

      Object.entries(modules).forEach(([id, module]) => {
        const active = id === s.hover || id === s.focus;
        const routeActive = FLOW_ROUTE[Math.round(cycle * (FLOW_ROUTE.length - 1))] === id;
        const scale = active ? 1.14 : routeActive ? 1.08 : 1;
        module.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
        module.traverse((obj: any) => {
          if (!obj.material) return;
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((material: any) => {
            if (material.opacity == null) return;
            material.opacity = s.focus && id !== s.focus ? 0.5 : 1;
            if (material.emissive) {
              material.emissive = new THREE.Color(active || routeActive ? COLORS.orange : 0x000000);
              material.emissiveIntensity = active ? 0.16 : routeActive ? 0.08 : 0;
            }
          });
        });
      });

      const cedar = modules.cedar;
      cedar.position.z = stageById.cedar.pos[2] + Math.sin(now * 0.0022) * 0.025;
      rails.forEach((rail, index) => {
        (rail.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(COLORS.orange);
        (rail.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.02 + Math.max(0, Math.sin(now * 0.003 - index * 0.45)) * 0.08;
      });

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((material: any) => {
            if (material.map) material.map.dispose();
            material.dispose?.();
          });
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === mount) mount.replaceChildren();
      stateRef.current = null;
    };
  }, []);

  return (
    <div className="onboard-machine-wrap">
      <div ref={mountRef} className="onboard-machine-canvas" />
    </div>
  );
}

const STORY_STATES = [
  {
    eyebrow: "01 / WELCOME",
    title: "FROM AGENT INTENT\nTO VERIFIED OUTCOMES",
    copy: "A security control plane for autonomous AI agents.",
    meta: "",
  },
  {
    eyebrow: "02 / HOW IT WORKS",
    title: "REQUEST -> CONTRACT -> CEDAR -> DECISION",
    copy: "Every action passes through declared scope, provenance, policy authority, and enforcement before anything reaches a tool.",
    meta: "Agent · Request · Task Contract · Context · AEGIS PEP",
  },
  {
    eyebrow: "03 / SEE IT DECIDE",
    title: "AEGIS DECIDES\nBEFORE THE TOOL DOES.",
    copy: "ALLOW opens the gate to protected execution. DENY stops the request, records evidence, and preserves the chain.",
    meta: "ALLOW package.json · DENY .env",
  },
  {
    eyebrow: "04 / READY",
    title: "CONTROL\nOBSERVE\nINVESTIGATE\nVERIFY",
    copy: "The complete system resolves into one accountable runtime path: policy, evidence, and investigation in one control plane.",
    meta: "Complete machine revealed",
  },
];

export default function Onboarding({ go }: { go: (route: string) => void }) {
  const [activeState, setActiveState] = useState(0);
  const [started, setStarted] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const updateActive = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const max = Math.max(1, stage.offsetHeight - window.innerHeight);
      const progress = clamp01(-rect.top / max);
      const next = progress < 0.23 ? 0 : progress < 0.5 ? 1 : progress < 0.76 ? 2 : 3;
      setActiveState(next);
    };
    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  const beginExperience = () => {
    setStarted(true);
    const stage = stageRef.current;
    if (!stage) return;
    const y = stage.offsetTop + window.innerHeight * 0.72;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <main className={`onboarding onboarding-premium ${started ? "onboarding-started" : ""}`}>
      <section ref={stageRef} className="onboard-scroll-stage">
        <div className="onboard-sticky-experience">
          <div className="onboard-editorial">
            <div className="onboard-brand">
              <span className="mini-mark" />
              <span>AEGIS</span>
              <small>SECURITY FOR AI AGENTS</small>
            </div>

            <div className="onboard-story-stack" aria-live="polite">
              {STORY_STATES.map((state, index) => (
                <article className={`onboard-story-card ${activeState === index ? "active" : ""}`} key={state.eyebrow}>
                  <span className="story-index">{state.eyebrow}</span>
                  <h1>{state.title}</h1>
                  <p>{state.copy}</p>
                  {state.meta ? <em>{state.meta}</em> : null}
                </article>
              ))}
            </div>

            {activeState === 0 && !started ? (
              <button className="btn primary onboard-start-button" onClick={beginExperience}>
                GET STARTED -&gt;
              </button>
            ) : null}
            {activeState === 3 ? (
              <button className="btn primary onboard-enter-button" onClick={() => go("overview")}>
                ENTER AEGIS -&gt;
              </button>
            ) : null}

            <div className="onboard-runtime-notes" aria-hidden="true">
              <span>{SESSION.id}</span>
              <span>DevFix</span>
              <span>{CONTRACT.id}</span>
            </div>
          </div>

          <div className="onboard-machine-panel" aria-label="AEGIS 3D control plane machine">
            <OnboardingMachine />
            <div className="onboard-micro-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${(activeState + 1) / STORY_STATES.length})` }} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

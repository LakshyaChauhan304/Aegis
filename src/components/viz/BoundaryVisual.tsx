import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Uses React Three Fiber primitives ported to vanilla Three.js for direct DOM attachment
export default function BoundaryVisual({ height = 400, event = null, compact = false }: any) {
  const mountRef = useRef<any>(null);
  const stateRef = useRef<any>({});

  const [hint, setHint] = useState("");

  const theme = {
    bg: 0xfcffff,
    grid: 0xd5d8c5,
    pep: 0x0a0a0a,
    tool: 0xdedfde,
    allow: 0x3e8b5c,
    deny: 0xe5562f,
    amber: 0xf47920,
    fg: 0xf47920,
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    mount.replaceChildren();
    const w = mount.clientWidth;
    const h = height;
    let rafId = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.bg);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, compact ? 12 : 18, compact ? 12 : 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    mount.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground

    // Grid
    const grid = new THREE.GridHelper(40, 40, theme.grid, theme.grid);
    grid.position.y = -0.5;
    scene.add(grid);

    // Geometry
    const gw = 12;
    const pepGeo = new THREE.BoxGeometry(gw, 1, 4);
    const pepMat = new THREE.MeshBasicMaterial({ color: theme.pep, wireframe: true });
    const pepMesh = new THREE.Mesh(pepGeo, pepMat);
    pepMesh.position.set(0, 0, 0);
    scene.add(pepMesh);

    const toolGeo = new THREE.BoxGeometry(gw - 2, 0.8, 2);
    const toolMat = new THREE.MeshBasicMaterial({ color: theme.tool, wireframe: true });
    const toolMesh = new THREE.Mesh(toolGeo, toolMat);
    toolMesh.position.set(0, 0, -4);
    scene.add(toolMesh);

    // Particle system (Request)
    const pGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const pMat = new THREE.MeshBasicMaterial({ color: theme.fg });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    pMesh.position.set(0, 0, 5);
    scene.add(pMesh);

    stateRef.current = {
      scene, camera, renderer, controls,
      pMesh, pMat,
      t: 0,
      animating: false,
      result: "none", // 'allow' or 'deny'
    };

    const animate = () => {
      if (disposed) return;
      const s = stateRef.current;
      if (!s || s.renderer !== renderer) return;

      if (s.animating) {
        s.t += 0.02;
        if (s.t > 1) s.t = 1;

        if (s.result === "allow") {
          // Move from 5 to -4 (through PEP to Tool)
          s.pMesh.position.z = 5 - (s.t * 9);
          s.pMat.color.setHex(s.t > 0.5 ? theme.allow : theme.fg);
        } else if (s.result === "deny") {
          // Move from 5 to 1 (Stop at PEP)
          s.pMesh.position.z = 5 - (s.t * 4);
          if (s.t >= 1) s.pMat.color.setHex(theme.deny);
        }
        
        if (s.t >= 1) s.animating = false;
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount && renderer.domElement.parentElement === mount) {
        mount.replaceChildren();
      }
      if (stateRef.current?.renderer === renderer) {
        stateRef.current = null;
      }
    };
  }, [height, compact]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s || !event) return;

    // Trigger animation based on event
    s.t = 0;
    s.animating = true;
    s.result = event.decision === "ALLOW" ? "allow" : "deny";
    s.pMat.color.setHex(theme.fg);
    s.pMesh.position.set(0, 0, 5);
    
    if (event.decision === "DENY") {
      setHint("Gateway refused request. Tool never invoked.");
    } else {
      setHint("Policy permitted request. Tool invoked.");
    }

  }, [event]);

  const handleResize = () => {
    if (!mountRef.current || !stateRef.current) return;
    const w = mountRef.current.clientWidth;
    const h = height;
    stateRef.current.renderer.setSize(w, h);
    stateRef.current.camera.aspect = w / h;
    stateRef.current.camera.updateProjectionMatrix();
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="viz" style={{ height }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div className="vizlegend">
        <span><span className="sdot" style={{ background: "#0A0A0A" }} /> PEP GATEWAY</span>
        <span><span className="sdot" style={{ background: "#DEDFDE" }} /> TOOL</span>
        <span><span className="sdot" style={{ background: "#F47920" }} /> REQUEST</span>
      </div>
      <div className="vizhint">{hint}</div>
      {event ? (
        <div className="vizstate">
          <div className="mono dim" style={{ fontSize: 9 }}>T+{event.t.toFixed(3)} &middot; {event.id}</div>
          <div style={{ marginTop: 2 }}>
            <span className={event.decision === "DENY" ? "d" : "a"}>{event.decision}</span>
            <span className="dim"> &middot; {event.action}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

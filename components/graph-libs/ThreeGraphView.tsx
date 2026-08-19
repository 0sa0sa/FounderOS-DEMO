'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { resolveKindColor, resolveVar, useContainerSize, type FlatGraph } from '@/lib/graph-lib-adapter';

function sumCharCodes(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

function nodePositions(graph: FlatGraph): Map<string, THREE.Vector3> {
  const byRing = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const list = byRing.get(n.ring) ?? [];
    list.push(n.id);
    byRing.set(n.ring, list);
  }
  const pos = new Map<string, THREE.Vector3>();
  for (const n of graph.nodes) {
    const ringNodes = byRing.get(n.ring)!;
    const i = ringNodes.indexOf(n.id);
    const count = ringNodes.length;
    const angle = (i / count) * Math.PI * 2;
    const radius = n.ring * 26 + 10;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    const y = (sumCharCodes(n.id) % 12) - 6;
    pos.set(n.id, new THREE.Vector3(x, y, z));
  }
  return pos;
}

export function ThreeGraphView({ graph }: { graph: FlatGraph }) {
  const [wrapRef, { width, height }] = useContainerSize<HTMLDivElement>();
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const ready = width > 0 && height > 0;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !ready) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
    camera.position.set(0, 60, 160);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color(resolveVar('--surface', '#0a0f0c')));
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const positions = nodePositions(graph);

    const sphere = new THREE.SphereGeometry(1.6, 12, 12);
    for (const node of graph.nodes) {
      const material = new THREE.MeshBasicMaterial({ color: resolveKindColor(node.kind) });
      const mesh = new THREE.Mesh(sphere, material);
      mesh.position.copy(positions.get(node.id)!);
      scene.add(mesh);
    }

    const edgeColor = new THREE.Color(resolveVar('--border-strong', '#243029'));
    for (const link of graph.links) {
      const a = positions.get(link.source);
      const b = positions.get(link.target);
      if (!a || !b) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: edgeColor }));
      scene.add(line);
    }

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, [graph, ready]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera || !ready) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }, [width, height, ready]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        three.js r185 (WebGL)
      </div>
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}

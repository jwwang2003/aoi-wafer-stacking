import { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function WaferScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return; // guard against null

    // === THREE.JS SETUP ===
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const aspect = width / height;
    const camera = new THREE.OrthographicCamera(
      -aspect, aspect,
      1, -1,
      0.1, 10
    );
    camera.position.z = 1;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // === WAFER DISK (BOTTOM LAYER) ===
    const waferRadius = 0.8;
    const waferGeometry = new THREE.CircleGeometry(waferRadius, 64);
    const waferMaterial = new THREE.MeshBasicMaterial({ color: 0xd0d0d0 });
    const waferMesh = new THREE.Mesh(waferGeometry, waferMaterial);
    scene.add(waferMesh);

    // === DIE GRID (TOP LAYER) ===
    const dieSize = 0.1;
    const dieCount = 10;
    const spacing = dieSize * 1.1;
    const gridWidth = (dieCount - 1) * spacing;
    const dieGeometry = new THREE.PlaneGeometry(dieSize, dieSize);

    for (let i = 0; i < dieCount; i++) {
      for (let j = 0; j < dieCount; j++) {
        const x = -gridWidth / 2 + i * spacing;
        const y = -gridWidth / 2 + j * spacing;
        if (Math.sqrt(x*x + y*y) + dieSize * 0.7 <= waferRadius) {
          const material = new THREE.MeshBasicMaterial({ color: 0x4444ff, transparent: true, opacity: 0.8 });
          const dieMesh = new THREE.Mesh(dieGeometry, material);
          dieMesh.position.set(x, y, 0.01);
          scene.add(dieMesh);
        }
      }
    }

    // === RENDER LOOP ===
    const animate = () => {
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // === CLEANUP ON UNMOUNT ===
    return () => {
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div style={{ width: '100%', height: '100%' }} ref={mountRef} />;
}
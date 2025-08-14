// SubstrateRenderer.tsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box } from '@mantine/core';
import { SubstrateDefectRecord } from '@/types/Wafer';

interface SubstrateRendererProps {
  filePath: string;
  gridSize?: number;
  overlapColor?: number;
  style?: React.CSSProperties;
  selectedSheetId: string | null;
  sheetsData: Record<string, SubstrateDefectRecord[]>;
}

export default function SubstrateRenderer({
  gridSize = 5,
  overlapColor = 0xfa5959,
  style,
  selectedSheetId,
  sheetsData,
}: SubstrateRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const defectObjectsRef = useRef<THREE.Object3D[]>([]);
  const gridObjectsRef = useRef<THREE.Object3D[]>([]);

  // 颜色映射表
  const colorMap = new Map<string, number>([
    ['Unclassified', 0xff0000],
    ['Particle', 0x000000],
    ['Pit', 0x00ff00],
    ['Bump', 0xadaf08],
    ['MicroPipe', 0x0000ff],
    ['Line', 0x00ffff],
    ['carrot', 0xff92f8],
    ['triangle', 0xc15dd7],
    ['Downfall', 0x0000ff],
    ['scratch', 0xc15dd7],
    ['PL_Black', 0xffa500],
    ['PL_White', 0xff007b],
    ['PL_BPD', 0x38d1ff],
    ['PL_SF', 0x6d6df2],
    ['PL_BSF', 0xff92f8],
  ]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    const camera = new THREE.OrthographicCamera(
      width / -2,
      width / 2,
      height / 2,
      height / -2,
      0.1,
      1000
    );
    camera.position.z = 10;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0xffffff);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    const handleResize = () => {
      if (!container || !camera || !renderer) return;

      const { width, height } = container.getBoundingClientRect();
      camera.left = width / -2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = height / -2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    const animationFrame = () => {
      controls.update();
      renderer.render(sceneRef.current, camera);
      requestAnimationFrame(animationFrame);
    };
    requestAnimationFrame(animationFrame);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!selectedSheetId || !sheetsData[selectedSheetId]) {
      defectObjectsRef.current.forEach((obj) => sceneRef.current.remove(obj));
      gridObjectsRef.current.forEach((obj) => sceneRef.current.remove(obj));
      setError('没有选中的工作表或工作表数据为空');
      return;
    }

    const renderSheetData = () => {
      defectObjectsRef.current.forEach((obj) => sceneRef.current.remove(obj));
      gridObjectsRef.current.forEach((obj) => sceneRef.current.remove(obj));

      const defects = sheetsData[selectedSheetId] as SubstrateDefectRecord[];

      if (defects.length === 0) {
        setError('当前工作表中未找到缺陷数据');
        return;
      }

      // 创建缺陷对象
      const defectObjects: THREE.Object3D[] = [];
      defects.forEach((item) => {
        const geometry = new THREE.PlaneGeometry(item.w / 300, item.h / 300);
        const color = colorMap.get(item.class) || 0xff00ff;
        const material = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(item.x, item.y, 0);
        sceneRef.current.add(mesh);
        defectObjects.push(mesh);
      });
      defectObjectsRef.current = defectObjects;

      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;

      defects.forEach((item) => {
        minX = Math.min(minX, item.x - item.w / 600);
        maxX = Math.max(maxX, item.x + item.w / 600);
        minY = Math.min(minY, item.y - item.h / 600);
        maxY = Math.max(maxY, item.y + item.h / 600);
      });

      createGrid({ minX, maxX, minY, maxY }, defects);

      if (cameraRef.current && controlsRef.current && containerRef.current) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const container = containerRef.current;
        const { width, height } = container.getBoundingClientRect();
        const dataWidth = maxX - minX;
        const dataHeight = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const margin = 1.3;

        const scaleX = width / (dataWidth * margin || 1);
        const scaleY = height / (dataHeight * margin || 1);
        const scale = Math.min(scaleX, scaleY) || 1;

        camera.left = -width / 2 / scale;
        camera.right = width / 2 / scale;
        camera.top = height / 2 / scale;
        camera.bottom = -height / 2 / scale;
        camera.position.x = centerX;
        camera.position.y = centerY;
        camera.updateProjectionMatrix();

        controls.target.set(centerX, centerY, 0);
        controls.update();
      }
    };

    renderSheetData();
    setError(null);
  }, [selectedSheetId, sheetsData, gridSize, overlapColor]);

  const createGrid = (
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    defects: SubstrateDefectRecord[]
  ) => {
    const { minX, maxX, minY, maxY } = bounds;
    const maxGridX = Math.ceil(
      Math.max(Math.abs(minX), Math.abs(maxX)) / gridSize
    );
    const maxGridY = Math.ceil(
      Math.max(Math.abs(minY), Math.abs(maxY)) / gridSize
    );
    const offsetX = gridSize / 2;
    const offsetY = gridSize / 2;
    const baseGridColor = 0x8cefa1;

    gridObjectsRef.current.forEach((obj) => sceneRef.current.remove(obj));
    gridObjectsRef.current = [];

    const gridMaterial = new THREE.MeshBasicMaterial({
      color: baseGridColor,
      opacity: 0.3,
      transparent: false,
      side: THREE.DoubleSide,
    });
    const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    for (let i = -maxGridX; i <= maxGridX; i++) {
      for (let j = -maxGridY; j <= maxGridY; j++) {
        const distance = Math.sqrt(
          Math.pow(i / maxGridX || 0, 2) + Math.pow(j / maxGridY || 0, 2)
        );
        if (distance <= 1.0) {
          const gridX = i * gridSize + offsetX;
          const gridY = j * gridSize + offsetY;
          const gridMinX = gridX - gridSize / 2;
          const gridMaxX = gridX + gridSize / 2;
          const gridMinY = gridY - gridSize / 2;
          const gridMaxY = gridY + gridSize / 2;

          const hasOverlap = defects.some(
            (d) =>
              d.x >= gridMinX &&
              d.x <= gridMaxX &&
              d.y >= gridMinY &&
              d.y <= gridMaxY
          );

          const material = hasOverlap
            ? new THREE.MeshBasicMaterial({
                color: overlapColor,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
              })
            : gridMaterial;

          const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(gridX, gridY, -0.1);
          sceneRef.current.add(mesh);
          gridObjectsRef.current.push(mesh);

          // 创建网格边框
          const edges = new THREE.EdgesGeometry(geometry);
          const border = new THREE.LineSegments(edges, borderMaterial);
          border.position.copy(mesh.position);
          border.renderOrder = 1;
          sceneRef.current.add(border);
          gridObjectsRef.current.push(border);
        }
      }
    }
  };

  return (
    <Box
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {error && (
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            padding: '1rem',
            backgroundColor: '#ff4444',
            color: 'white',
          }}
        >
          {error}
        </Box>
      )}
    </Box>
  );
}

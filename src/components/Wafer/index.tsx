import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Slider, Paper, Group, Text } from '@mantine/core';
import { AsciiDie, WaferMapDie, SubstrateDefectXlsResult } from '@/types/ipc';

interface SubstrateRendererProps {
    gridWidth?: number;
    gridHeight?: number;
    overlapColor?: number;
    style?: React.CSSProperties;
    selectedSheetId: string | null;
    sheetsData: SubstrateDefectXlsResult;
    gridOffset?: { x: number; y: number };
    dies: AsciiDie[] | WaferMapDie[] | null;
}

export default function SubstrateRenderer({
    gridWidth = 4.134,
    gridHeight = 3.74,
    overlapColor = 0xfa5959,
    style,
    selectedSheetId,
    sheetsData,
    gridOffset = { x: 0, y: 0 },
    dies
}: SubstrateRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    // NEW: zoom state (orthographic camera 'zoom'), 1 = default
    const [zoom, setZoom] = useState(1); // min 0.25, max 5 recommended

    const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const defectObjectsRef = useRef<THREE.Object3D[]>([]);
    const gridObjectsRef = useRef<THREE.Object3D[]>([]);
    const { x: offsetX, y: offsetY } = gridOffset;

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

    // Init three.js once
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const { width, height } = container.getBoundingClientRect();
        const camera = new THREE.OrthographicCamera(
            width / -2, width / 2, height / 2, height / -2, 0.1, 1000
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

        // Disable zooming (wheel/pinch); allow only panning
        controls.enableRotate = false;
        controls.enableZoom = false;        // <— disables wheel/pinch zoom
        controls.enablePan = true;
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.PAN,         // no dolly
            RIGHT: THREE.MOUSE.ROTATE,       // won't rotate since enableRotate=false
        };
        controls.touches = {
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.PAN,            // disable pinch-dolly
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

        let raf = 0;
        const animate = () => {
            controls.update();
            renderer.render(sceneRef.current, camera);
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(raf);
            if (renderer && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer?.dispose();
        };
    }, []);

    // Apply zoom state to camera
    useEffect(() => {
        const camera = cameraRef.current;
        if (!camera) return;
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
    }, [zoom]);

    // Deduce map coordinates from dies (unique (x,y))
    const mapCoordinates = useMemo<[number, number][]>(() => {
        if (!dies || dies.length === 0) return [];
        const seen = new Set<string>();
        const coords: [number, number][] = [];
        for (const d of dies) {
            const k = `${d.x}|${d.y}`;
            if (!seen.has(k)) {
                seen.add(k);
                coords.push([d.x, d.y]);
            }
        }
        return coords;
    }, [dies]);

    // Rebuild grid + overlay whenever inputs change
    useEffect(() => {
        defectObjectsRef.current.forEach(obj => sceneRef.current.remove(obj));
        gridObjectsRef.current.forEach(obj => sceneRef.current.remove(obj));
        defectObjectsRef.current = [];
        gridObjectsRef.current = [];

        if (mapCoordinates.length === 0) {
            setError(dies && dies.length === 0 ? '没有可显示的晶圆点位' : null);
            return;
        }

        createGridFromCoordinates();

        if (selectedSheetId && sheetsData[selectedSheetId]) {
            const defects = sheetsData[selectedSheetId];
            const defectObjects: THREE.Object3D[] = [];

            defects.forEach(item => {
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
        }

        adjustCameraView();
        setError(null);
    }, [mapCoordinates, selectedSheetId, sheetsData, gridWidth, gridHeight, overlapColor, offsetX, offsetY]);

    const createGridFromCoordinates = () => {
        const baseGridColor = 0x8cefa1;
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        const gridObjects: THREE.Object3D[] = [];

        for (const [xCoord, yCoord] of mapCoordinates) {
            const x = xCoord * gridWidth + offsetX;
            const y = yCoord * gridHeight + offsetY;

            const hasOverlap = selectedSheetId && sheetsData[selectedSheetId]
                ? sheetsData[selectedSheetId].some(d => {
                    const gridMinX = x;
                    const gridMaxX = x + gridWidth;
                    const gridMinY = y;
                    const gridMaxY = y + gridHeight;
                    return d.x >= gridMinX && d.x <= gridMaxX && d.y >= gridMinY && d.y <= gridMaxY;
                })
                : false;

            const material = hasOverlap
                ? new THREE.MeshBasicMaterial({
                    color: overlapColor,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.DoubleSide,
                })
                : new THREE.MeshBasicMaterial({
                    color: baseGridColor,
                    opacity: 0.3,
                    transparent: false,
                    side: THREE.DoubleSide,
                });

            const geometry = new THREE.PlaneGeometry(gridWidth, gridHeight);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x + gridWidth / 2, y + gridHeight / 2, -0.1);
            sceneRef.current.add(mesh);
            gridObjects.push(mesh);

            const edges = new THREE.EdgesGeometry(geometry);
            const border = new THREE.LineSegments(edges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            sceneRef.current.add(border);
            gridObjects.push(border);
        }

        gridObjectsRef.current = gridObjects;
    };

    const adjustCameraView = () => {
        if (!cameraRef.current || !controlsRef.current || !containerRef.current) return;

        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const container = containerRef.current;
        const { width, height } = container.getBoundingClientRect();

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const [xCoord, yCoord] of mapCoordinates) {
            const x = xCoord * gridWidth + offsetX;
            const y = yCoord * gridHeight + offsetY;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + gridWidth);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y + gridHeight);
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const dataWidth = maxX - minX;
        const dataHeight = maxY - minY;
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

        // re-apply current zoom on every fit
        camera.zoom = zoom;
        camera.updateProjectionMatrix();

        controls.target.set(centerX, centerY, 0);
        controls.update();
    };

    return (
        <Box
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                height: 'calc(100vh - 50px)',
                overflow: 'hidden',
                ...style,
            }}
        >
            {/* Zoom slider UI */}
            <Paper
                shadow="sm"
                p="xs"
                style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 220,
                    zIndex: 200,
                }}
            >
                <Group justify="space-between" mb={6}>
                    <Text size="sm" c="dimmed">缩放</Text>
                    <Text size="sm">{zoom.toFixed(2)}×</Text>
                </Group>
                <Slider
                    min={0.25}
                    max={5}
                    step={0.01}
                    value={zoom}
                    onChange={setZoom}
                    marks={[
                        { value: 0.5, label: '0.5×' },
                        { value: 1, label: '1×' },
                        { value: 2, label: '2×' },
                        { value: 4, label: '4×' },
                    ]}
                />
            </Paper>

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
                        zIndex: 100,
                    }}
                >
                    {error}
                </Box>
            )}
        </Box>
    );
}


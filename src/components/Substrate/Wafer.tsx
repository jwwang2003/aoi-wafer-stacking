import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Slider, Paper, Group, Text, Button, Card } from '@mantine/core';
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

export const colorMap = new Map<string, number>([
    ['Unclassified', 0xff0000],
    ['Particle', 0x010101],
    ['Pit', 0x00ff6d],
    ['Bump', 0xaaaa00],
    ['MicroPipe', 0x0000ff],
    ['Line', 0x00ffff],
    ['carrot', 0xff80ff],
    ['triangle', 0xba00ff],
    ['Downfall', 0x0101ff],
    ['scratch', 0xba00ff],
    ['PL_Black', 0xffa500],
    ['PL_White', 0xff007f],
    ['PL_BPD', 0x00adff],
    ['PL_SF', 0x5555ff],
    ['PL_BSF', 0xff80ff],
]);

export default function SubstrateRenderer({
    gridWidth = 4.134,
    gridHeight = 3.74,
    overlapColor = 0xfa5959,
    style,
    selectedSheetId,
    sheetsData,
    gridOffset = { x: 0, y: 0 },
    dies,
}: SubstrateRendererProps) {
    // This is the square box (aspect ratio 1:1)
    const squareRef = useRef<HTMLDivElement>(null);

    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);

    const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const defectObjectsRef = useRef<THREE.Object3D[]>([]);
    const gridObjectsRef = useRef<THREE.Object3D[]>([]);
    const { x: offsetX, y: offsetY } = gridOffset;


    // Fit to current square size
    const sizeRendererToSquare = () => {
        const el = squareRef.current;
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        if (!el || !renderer || !camera) return;

        const rect = el.getBoundingClientRect();
        const side = Math.max(1, Math.floor(rect.width)); // height equals width due to aspect-ratio

        // Canvas buffer + CSS size
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(side, side, false);

        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        // Square ortho frustum
        camera.left = -side / 2;
        camera.right = side / 2;
        camera.top = side / 2;
        camera.bottom = -side / 2;
        camera.updateProjectionMatrix();
    };

    const fitCameraToData = () => {
        const el = squareRef.current;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!el || !camera || !controls) return;

        const side = el.getBoundingClientRect().width; // square
        if (side <= 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [xCoord, yCoord] of mapCoordinatesRef.current) {
            const x = xCoord * gridWidth + offsetX;
            const y = -yCoord * gridHeight + offsetY;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + gridWidth);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y + gridHeight);
        }
        if (!isFinite(minX)) return;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const dataW = maxX - minX;
        const dataH = maxY - minY;
        const margin = 1.0;

        const scale = Math.min(
            side / (dataW * margin || 1),
            side / (dataH * margin || 1)
        ) || 1;

        camera.left = -side / 2 / scale;
        camera.right = side / 2 / scale;
        camera.top = side / 2 / scale;
        camera.bottom = -side / 2 / scale;
        camera.position.x = centerX;
        camera.position.y = centerY;
        camera.zoom = zoom;
        camera.updateProjectionMatrix();

        controls.target.set(centerX, centerY, 0);
        controls.update();
    };

    // Keep latest coordinates
    const mapCoordinatesRef = useRef<[number, number][]>([]);
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
    useEffect(() => {
        mapCoordinatesRef.current = mapCoordinates;
    }, [mapCoordinates]);

    // Init
    useEffect(() => {
        const container = squareRef.current;
        if (!container) return;

        // Ensure absolute canvas can fill
        container.style.position = 'relative';

        const side = container.getBoundingClientRect().width;

        const camera = new THREE.OrthographicCamera(
            -side / 2, side / 2, side / 2, -side / 2, 0.1, 1000
        );
        camera.position.z = 10;
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false,
            stencil: false,
            depth: true,
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0xffffff);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        sizeRendererToSquare();

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.dampingFactor = 0;
        controls.enableRotate = false;
        controls.enableZoom = false;
        controls.enablePan = true;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
        controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.PAN };
        controlsRef.current = controls;

        const ro = new ResizeObserver(() => {
            sizeRendererToSquare();
            fitCameraToData();
        });
        ro.observe(container);

        let raf = 0;
        const animate = () => {
            controls.update();
            renderer.render(sceneRef.current, camera);
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);

        return () => {
            ro.disconnect();
            cancelAnimationFrame(raf);
            if (renderer && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer?.dispose();
        };
    }, []);

    // Apply zoom
    useEffect(() => {
        const camera = cameraRef.current;
        if (!camera) return;
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
    }, [zoom]);

    // Rebuild scene on data changes
    useEffect(() => {
        defectObjectsRef.current.forEach((o) => sceneRef.current.remove(o));
        gridObjectsRef.current.forEach((o) => sceneRef.current.remove(o));
        defectObjectsRef.current = [];
        gridObjectsRef.current = [];

        if (mapCoordinates.length === 0) {
            setError(dies && dies.length === 0 ? '没有可显示的晶圆点位' : null);
            return;
        }

        createGridFromCoordinates();

        if (selectedSheetId && sheetsData[selectedSheetId]) {
            const defects = sheetsData[selectedSheetId];
            const nodes: THREE.Object3D[] = [];
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
                nodes.push(mesh);
            });
            defectObjectsRef.current = nodes;
        }

        fitCameraToData();
        setError(null);
    }, [mapCoordinates, selectedSheetId, sheetsData, gridWidth, gridHeight, overlapColor, offsetX, offsetY]);

    const createGridFromCoordinates = () => {
        const baseGridColor = 0x8cefa1;
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        const gridObjs: THREE.Object3D[] = [];

        for (const [xCoord, yCoord] of mapCoordinatesRef.current) {
            const gridLeft = xCoord * gridWidth + offsetX;
            const gridRight = gridLeft + gridWidth;
            const gridTop = -yCoord * gridHeight + offsetY;
            const gridBottom = gridTop + gridHeight;
            const hasOverlap = selectedSheetId && sheetsData[selectedSheetId]
                ? sheetsData[selectedSheetId].some(defect => {
                    const defectLeft = defect.x - (defect.w / 300) / 2;
                    const defectRight = defect.x + (defect.w / 300) / 2;
                    const defectTop = defect.y - (defect.h / 300) / 2;
                    const defectBottom = defect.y + (defect.h / 300) / 2;
                    return !(
                        gridRight < defectLeft ||
                        gridLeft > defectRight ||
                        gridBottom < defectTop ||
                        gridTop > defectBottom
                    );
                })
                : false;

            const material = hasOverlap
                ? new THREE.MeshBasicMaterial({ color: overlapColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
                : new THREE.MeshBasicMaterial({ color: baseGridColor, opacity: 0.3, transparent: false, side: THREE.DoubleSide });

            const geometry = new THREE.PlaneGeometry(gridWidth, gridHeight);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(gridLeft + gridWidth / 2, gridTop + gridHeight / 2, -0.1);
            sceneRef.current.add(mesh);
            gridObjs.push(mesh);

            const edges = new THREE.EdgesGeometry(geometry);
            const border = new THREE.LineSegments(edges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            sceneRef.current.add(border);
            gridObjs.push(border);
        }

        gridObjectsRef.current = gridObjs;
    };

    const adjustCameraView = () => {
        fitCameraToData();
    };

    return (
        // Outer block remains flexible — the inner square ensures at least a square area
        <Card withBorder radius="md" style={{ padding: 0, width: '100%', height: '100%', ...style }}>
            {/* Square enforcer: becomes a square based on width; height grows to match width */}
            <div
                ref={squareRef}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: 'auto',
                    aspectRatio: '1 / 1',    // 👈 enforce square
                    minHeight: 240,          // optional: ensure a practical minimum
                    overflow: 'visible',     // no letterboxing/cropping
                }}
            />

            {/* UI overlay lives on top of the Card, not inside the square div to avoid affecting its size */}
            <Paper
                shadow="sm"
                p="xs"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 220,
                    height: 'min-content',
                    zIndex: 200,
                }}
            >
                <Group justify="space-between" mb={6}>
                    <Text size="sm" c="dimmed">缩放</Text>
                    <Text size="sm">{zoom.toFixed(2)}×</Text>
                </Group>

                <Group mt="xs" grow>
                    <Button size="xs" variant="light" onClick={() => adjustCameraView()}>居中视图</Button>
                    <Button size="xs" variant="light" onClick={() => setZoom(1)}>重置缩放</Button>
                </Group>
                <Slider min={0.5} max={5} step={0.01} value={zoom} onChange={setZoom} />
            </Paper>

            {error && (
                <Box
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        backgroundColor: '#ff4444ff',
                        color: 'white',
                        zIndex: 100,
                    }}
                >
                    {error}
                </Box>
            )}
        </Card>
    );
}

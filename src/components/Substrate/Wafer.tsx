import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js';

import { Box, Slider, Paper, Group, Text, Button, Card } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

import { AsciiDie, WaferMapDie, SubstrateDefectXlsResult, SubstrateDefectRecord } from '@/types/ipc';

import { colorMap } from './constants';

interface SubstrateRendererProps {
    gridWidth?: number;
    gridHeight?: number;
    overlapColor?: number;
    style?: React.CSSProperties;
    selectedSheetId: string | null;
    sheetsData: SubstrateDefectXlsResult;
    gridOffset?: { x: number; y: number };
    dies: AsciiDie[] | WaferMapDie[] | null;
    defectSizeOffset?: { x: number; y: number };
}

export default function SubstrateRenderer({
    gridWidth = 4.134,
    gridHeight = 3.74,
    // Use a softer red for overlap to avoid overpowering other defects
    overlapColor = 0xE58C8C,
    style,
    selectedSheetId,
    sheetsData,
    gridOffset = { x: 0, y: 0 },
    dies,
    defectSizeOffset = { x: 0, y: 0 },
}: SubstrateRendererProps) {
    // This is the square box (aspect ratio 1:1)
    const squareRef = useRef<HTMLDivElement>(null);

    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [reloadToken, setReloadToken] = useState(0);

    const threeRef = useRef<typeof import('three') | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControlsType | null>(null);
    const [threeReady, setThreeReady] = useState(false);
    const defectObjectsRef = useRef<THREE.Object3D[]>([]);
    const gridObjectsRef = useRef<THREE.Object3D[]>([]);
    const { x: offsetX, y: offsetY } = gridOffset;
    const { x: offsetX_defect, y: offsetY_defect } = defectSizeOffset;
    const shouldResetViewRef = useRef(false);


    // Manual refresh — re-run WebGL init effect
    const refreshRenderer = useCallback(() => {
        setError('正在重载渲染器…');
        shouldResetViewRef.current = true;
        setZoom(1);
        setThreeReady(false);
        setReloadToken((token) => token + 1);
    }, []);

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

        // Incorporate current zoom so effective view (frustum/zoom) fits content.
        const currentZoom = camera.zoom || zoom || 1;
        const baseScale = Math.min(
            side / (dataW * margin || 1),
            side / (dataH * margin || 1)
        ) || 1;
        const scale = baseScale / currentZoom;

        camera.left = -side / 2 / scale;
        camera.right = side / 2 / scale;
        camera.top = side / 2 / scale;
        camera.bottom = -side / 2 / scale;
        camera.position.x = centerX;
        camera.position.y = centerY;
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

    // Init: dynamically import three.js and OrbitControls, then construct scene
    useEffect(() => {
        let disposed = false;
        let animationId = 0;
        let contextLostHandler: EventListener | null = null;
        let contextRestoredHandler: EventListener | null = null;

        const boot = async () => {
            const container = squareRef.current;
            if (!container) return;

            container.style.position = 'relative';
            const [THREE, { OrbitControls }] = await Promise.all([
                import('three'),
                import('three/examples/jsm/controls/OrbitControls.js'),
            ]);
            if (disposed) return;
            threeRef.current = THREE;

            const scene = new THREE.Scene();
            sceneRef.current = scene;

            const side = container.getBoundingClientRect().width;
            const camera = new THREE.OrthographicCamera(
                -side / 2, side / 2, side / 2, -side / 2, 0.1, 1000
            );
            camera.position.z = 10;
            camera.zoom = 1;
            camera.updateProjectionMatrix();
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

            const canvas = renderer.domElement;
            contextLostHandler = (event: Event) => {
                event.preventDefault();
                if (disposed) return;
                console.warn('[SubstrateRenderer] WebGL context lost; scheduling refresh.');
                setThreeReady(false);
                setError('检测到 WebGL 上下文丢失，正在尝试恢复…');
                requestAnimationFrame(() => refreshRenderer());
            };
            contextRestoredHandler = () => {
                console.info('[SubstrateRenderer] WebGL context restored.');
                setError(null);
            };
            canvas.addEventListener('webglcontextlost', contextLostHandler as EventListener, { passive: false });
            canvas.addEventListener('webglcontextrestored', contextRestoredHandler as EventListener);

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

            const animate = () => {
                if (!disposed && rendererRef.current && sceneRef.current && cameraRef.current) {
                    controls.update();
                    renderer.render(sceneRef.current, camera);
                }
                animationId = requestAnimationFrame(animate);
            };
            animationId = requestAnimationFrame(animate);

            setThreeReady(true);
        };

        boot();

        return () => {
            disposed = true;
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            const container = squareRef.current;
            const renderer = rendererRef.current;
            const canvas = renderer?.domElement;
            if (canvas) {
                if (contextLostHandler) {
                    canvas.removeEventListener('webglcontextlost', contextLostHandler);
                }
                if (contextRestoredHandler) {
                    canvas.removeEventListener('webglcontextrestored', contextRestoredHandler);
                }
            }
            if (renderer && container && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer?.dispose();
            sceneRef.current?.clear();
            sceneRef.current = null;
            cameraRef.current = null;
            rendererRef.current = null;
            controlsRef.current?.dispose();
            controlsRef.current = null;
            defectObjectsRef.current = [];
            gridObjectsRef.current = [];
        };
    }, [refreshRenderer, reloadToken]);

    // Apply zoom
    useEffect(() => {
        const camera = cameraRef.current;
        if (!camera) return;
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
    }, [zoom]);

    // Active defects: null or missing selectedSheetId means render all sheets
    const activeDefects = useMemo<SubstrateDefectRecord[]>(() => {
        if (!sheetsData) return [];
        // No sheet selected → combine all records
        if (!selectedSheetId) {
            const lists = Object.values(sheetsData) as SubstrateDefectRecord[][];
            return lists.flat();
        }
        const arr = sheetsData[selectedSheetId];
        return Array.isArray(arr) ? arr : [];
    }, [selectedSheetId, sheetsData]);

    // Rebuild scene on data changes
    useEffect(() => {
        if (!threeReady || !sceneRef.current || !threeRef.current) return;
        const THREE = threeRef.current;
        defectObjectsRef.current.forEach((o) => sceneRef.current!.remove(o));
        gridObjectsRef.current.forEach((o) => sceneRef.current!.remove(o));
        defectObjectsRef.current = [];
        gridObjectsRef.current = [];

        if (mapCoordinates.length === 0) {
            setError(dies && dies.length === 0 ? '没有可显示的晶圆点位' : null);
            return;
        }

        createGridFromCoordinates();

        // Helper: create a red question mark sprite
        const makeQuestionMarkSprite = (w: number, h: number) => {
            const canvas = document.createElement('canvas');
            const size = 128;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#ff0000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 100px Arial';
            ctx.fillText('?', size / 2, size / 2 + 6);
            const tex = new THREE.CanvasTexture(canvas);
            tex.needsUpdate = true;
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(w, h, 1);
            return sprite;
        };

        if (activeDefects && activeDefects.length) {
            const nodes: THREE.Object3D[] = [];
            activeDefects.forEach((item) => {
                const hasColor = colorMap.has(item.class);
                const sizeX = Math.max(item.w / 300, gridWidth * 0.5);
                const sizeY = Math.max(item.h / 300, gridHeight * 0.5);
                if (!hasColor) {
                    const sprite = makeQuestionMarkSprite(sizeX, sizeY);
                    sprite.position.set(item.x, item.y, 0.2);
                    sceneRef.current!.add(sprite);
                    nodes.push(sprite);
                } else {
                    const geometry = new THREE.PlaneGeometry((item.w + offsetX_defect) / 300, (item.h + offsetY_defect) / 300);
                    const color = colorMap.get(item.class)!;
                    // Use fully opaque material for accurate, saturated color
                    const material = new THREE.MeshBasicMaterial({
                        color,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1,
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(item.x, item.y, 0);
                    sceneRef.current!.add(mesh);
                    nodes.push(mesh);
                }
            });
            defectObjectsRef.current = nodes;
        }

        fitCameraToData();
        if (shouldResetViewRef.current) {
            centerCameraToData();
            shouldResetViewRef.current = false;
        }
        setError(null);
    }, [threeReady, mapCoordinates, activeDefects, gridWidth, gridHeight, overlapColor, offsetX, offsetY, offsetX_defect, offsetY_defect]);

    const createGridFromCoordinates = () => {
        if (!threeReady || !sceneRef.current || !threeRef.current) return;
        const THREE = threeRef.current;
        const baseGridColor = 0x8cefa1;
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        const gridObjs: THREE.Object3D[] = [];

        for (const [xCoord, yCoord] of mapCoordinatesRef.current) {
            const gridLeft = xCoord * gridWidth + offsetX;
            const gridRight = gridLeft + gridWidth;
            const gridTop = -yCoord * gridHeight + offsetY;
            const gridBottom = gridTop + gridHeight;
            const hasOverlap = activeDefects && activeDefects.length
                ? activeDefects.some(defect => {
                    const defectLeft = defect.x - ((defect.w + offsetX_defect) / 300) / 2;
                    const defectRight = defect.x + ((defect.w + offsetX_defect) / 300) / 2;
                    const defectTop = defect.y - ((defect.h + offsetY_defect) / 300) / 2;
                    const defectBottom = defect.y + ((defect.h + offsetY_defect) / 300) / 2;
                    return !(
                        gridRight < defectLeft ||
                        gridLeft > defectRight ||
                        gridBottom < defectTop ||
                        gridTop > defectBottom
                    );
                })
                : false;

            const material = hasOverlap
                // Opaque overlap to avoid washed-out colors
                ? new THREE.MeshBasicMaterial({ color: overlapColor, transparent: false, opacity: 1, side: THREE.DoubleSide })
                // Opaque base grid to ensure saturation
                : new THREE.MeshBasicMaterial({ color: baseGridColor, transparent: false, opacity: 1, side: THREE.DoubleSide });

            const geometry = new THREE.PlaneGeometry(gridWidth, gridHeight);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(gridLeft + gridWidth / 2, gridTop + gridHeight / 2, -0.1);
            sceneRef.current!.add(mesh);
            gridObjs.push(mesh);

            const edges = new THREE.EdgesGeometry(geometry);
            const border = new THREE.LineSegments(edges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            sceneRef.current!.add(border);
            gridObjs.push(border);
        }

        gridObjectsRef.current = gridObjs;
    };

    const centerCameraToData = () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const coords = mapCoordinatesRef.current;
        if (!camera || !controls || !coords.length) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [xCoord, yCoord] of coords) {
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

        // Only move camera/target; do not change frustum or zoom
        camera.position.x = centerX;
        camera.position.y = centerY;
        camera.updateProjectionMatrix();
        controls.target.set(centerX, centerY, 0);
        controls.update();
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
                    <Button size="xs" variant="light" onClick={() => centerCameraToData()}>居中视图</Button>
                    <Button size="xs" variant="light" onClick={() => setZoom(1)}>重置缩放</Button>
                </Group>
                <Slider min={0.5} max={5} step={0.01} value={zoom} onChange={setZoom} py="md" />
                <Button
                    size="xs"
                    variant="outline"
                    mt="xs"
                    leftSection={<IconRefresh size={14} />}
                    onClick={refreshRenderer}
                >
                    刷新渲染器
                </Button>
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CSS2DRenderer as CSS2DRendererType } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { Box, Slider, Paper, Group, Text, Button, Card } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

import { AsciiDie, WaferMapDie, SubstrateDefectXlsResult, SubstrateDefectRecord } from '@/types/ipc';
import { computeDieRect, GridOffset, normalizeDefect, rectsOverlap } from '@/utils/substrateMapping';

import { colorMap } from './Constants';

interface SubstrateRendererProps {
    gridWidth?: number;
    gridHeight?: number;
    overlapColor?: number;
    style?: React.CSSProperties;
    selectedSheetId: string | null;
    sheetsData: SubstrateDefectXlsResult;
    gridOffset?: GridOffset;
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
    const labelRendererRef = useRef<CSS2DRendererType | null>(null);
    const css2dObjectCtorRef = useRef<typeof import('three/examples/jsm/renderers/CSS2DRenderer.js').CSS2DObject | null>(null);
    const [threeReady, setThreeReady] = useState(false);
    const defectObjectsRef = useRef<THREE.Object3D[]>([]);
    const gridObjectsRef = useRef<THREE.Object3D[]>([]);
    const gridMeshCoordsRef = useRef<Array<{ mesh: THREE.Mesh, coord: { x: number, y: number } }>>([]);
    const hoverOverlayRef = useRef<THREE.Object3D[]>([]);
    const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);
    const [pointerVersion, setPointerVersion] = useState(0);
    const { x: offsetX, y: offsetY } = gridOffset;
    // defectSizeOffset is specified in micrometers in the UI; convert with the raw defect data
    const { x: offsetX_defect, y: offsetY_defect } = defectSizeOffset;
    const EPS = 1e-6; // keep overlap rules consistent with algorithm path
    const shouldResetViewRef = useRef(false);
    const raycasterRef = useRef<THREE.Raycaster | null>(null);
    const pointerRef = useRef<THREE.Vector2 | null>(null);
    const pointerWorldRef = useRef<{ x: number; y: number } | null>(null);

    // Shared helpers
    // Remove a tracked set of objects from the scene without touching refs.
    const clearSceneObjects = useCallback((objects: THREE.Object3D[]) => {
        const scene = sceneRef.current;
        if (!scene) return;
        objects.forEach((obj) => scene.remove(obj));
    }, []);

    // Guard against negative defect dimensions from upstream data.
    const clampDefectSize = useCallback((val: number) => Math.max(0, val), []);

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
        const labelRenderer = labelRendererRef.current;
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

        if (labelRenderer) {
            labelRenderer.setSize(side, side);
            const labelEl = labelRenderer.domElement;
            labelEl.style.position = 'absolute';
            labelEl.style.left = '0';
            labelEl.style.top = '0';
            labelEl.style.width = '100%';
            labelEl.style.height = '100%';
            labelEl.style.pointerEvents = 'none';
        }
    };

    // Coordinate helpers ------------------------------------------------------
    const mapCoordinatesRef = useRef<[number, number][]>([]);
    const mapCoordinates = useMemo<[number, number][]>(() => {
        // Deduplicate dies to avoid overlapping cells
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

    const getCoordExtents = useCallback(() => {
        let minCoordX = Infinity, maxCoordX = -Infinity, minCoordY = Infinity, maxCoordY = -Infinity;
        for (const [xCoord, yCoord] of mapCoordinatesRef.current) {
            minCoordX = Math.min(minCoordX, xCoord);
            maxCoordX = Math.max(maxCoordX, xCoord);
            minCoordY = Math.min(minCoordY, yCoord);
            maxCoordY = Math.max(maxCoordY, yCoord);
        }
        if (!isFinite(minCoordX) || !isFinite(minCoordY)) return null;
        return { minCoordX, maxCoordX, minCoordY, maxCoordY };
    }, []);

    const getBounds = useCallback(() => {
        const extents = getCoordExtents();
        if (!extents) return null;
        const { minCoordX, maxCoordX, minCoordY, maxCoordY } = extents;

        // Include header row/column plus a right/bottom padding cell
        const minX = minCoordX * gridWidth + offsetX;                // header column
        const maxX = maxCoordX * gridWidth + offsetX;                // right padding
        const maxY = -(minCoordY - 2) * gridHeight + offsetY;        // header row top edge
        const minY = -maxCoordY * gridHeight + offsetY;              // extra row below data

        return { minX, maxX, minY, maxY };
    }, [getCoordExtents, gridHeight, gridWidth, offsetX, offsetY]);

    const fitCameraToData = () => {
        const el = squareRef.current;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const bounds = getBounds();
        if (!el || !camera || !controls || !bounds) return;

        const side = el.getBoundingClientRect().width; // square
        if (side <= 0) return;

        const { minX, maxX, minY, maxY } = bounds;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const dataW = maxX - minX;
        const dataH = maxY - minY;
        const margin = 1.0;

        // Frustum is fit to data bounds; zoom slider uses camera.zoom directly
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
        camera.updateProjectionMatrix();

        controls.target.set(centerX, centerY, 0);
        controls.update();
    };

    // Init: dynamically import three.js and OrbitControls, then construct scene.
    // Kept inside an effect to avoid loading heavy deps when the component is unused.
    useEffect(() => {
        let disposed = false;
        let animationId = 0;
        let contextLostHandler: EventListener | null = null;
        let contextRestoredHandler: EventListener | null = null;

        const boot = async () => {
            const container = squareRef.current;
            if (!container) return;

            container.style.position = 'relative';
            const [THREE, { OrbitControls }, { CSS2DRenderer, CSS2DObject }] = await Promise.all([
                import('three'),
                import('three/examples/jsm/controls/OrbitControls.js'),
                import('three/examples/jsm/renderers/CSS2DRenderer.js'),
            ]);
            if (disposed) return;
            threeRef.current = THREE;
            css2dObjectCtorRef.current = CSS2DObject;

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
            raycasterRef.current = new THREE.Raycaster();
            pointerRef.current = new THREE.Vector2();

            const labelRenderer = new CSS2DRenderer();
            labelRenderer.setSize(side, side);
            labelRenderer.domElement.style.position = 'absolute';
            labelRenderer.domElement.style.top = '0';
            labelRenderer.domElement.style.left = '0';
            labelRenderer.domElement.style.width = '100%';
            labelRenderer.domElement.style.height = '100%';
            labelRenderer.domElement.style.pointerEvents = 'none';
            container.appendChild(labelRenderer.domElement);
            labelRendererRef.current = labelRenderer;

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
                    labelRendererRef.current?.render(sceneRef.current, camera);
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
            const labelRenderer = labelRendererRef.current;
            const canvas = renderer?.domElement;
            if (canvas) {
                if (contextLostHandler) {
                    canvas.removeEventListener('webglcontextlost', contextLostHandler);
                }
                if (contextRestoredHandler) {
                    canvas.removeEventListener('webglcontextrestored', contextRestoredHandler);
                }
            }
            const labelCanvas = labelRenderer?.domElement;
            if (labelCanvas && container?.contains(labelCanvas)) {
                container.removeChild(labelCanvas);
            }
            if (renderer && container && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer?.dispose();
            if (labelRenderer) {
                const maybeDispose = (labelRenderer as unknown as { dispose?: () => void }).dispose;
                if (typeof maybeDispose === 'function') {
                    maybeDispose.call(labelRenderer);
                }
            }
            sceneRef.current?.clear();
            sceneRef.current = null;
            cameraRef.current = null;
            rendererRef.current = null;
            labelRendererRef.current = null;
            css2dObjectCtorRef.current = null;
            controlsRef.current?.dispose();
            controlsRef.current = null;
            defectObjectsRef.current = [];
            gridObjectsRef.current = [];
            gridMeshCoordsRef.current = [];
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

    const createGridFromCoordinates = useCallback(() => {
        if (!threeReady || !sceneRef.current || !threeRef.current) return;
        const THREE = threeRef.current;
        const baseGridColor = 0x8cefa1;
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        const gridObjs: THREE.Object3D[] = [];
        const gridMeshCoords: Array<{ mesh: THREE.Mesh, coord: { x: number; y: number } }> = [];
        const extents = getCoordExtents();
        if (!extents) return;
        const { minCoordX, minCoordY } = extents;

        for (const [xCoord, yCoord] of mapCoordinatesRef.current) {
            const gridRect = computeDieRect(
                { x: xCoord, y: yCoord },
                { width: gridWidth, height: gridHeight },
                gridOffset as GridOffset
            );
            const hasOverlap = activeDefects && activeDefects.length
                ? activeDefects.some(defect => {
                    const norm = normalizeDefect(defect, { x: offsetX_defect, y: offsetY_defect });
                    const defectRect = {
                        left: norm.x,
                        right: norm.x + norm.w,
                        top: norm.y,
                        bottom: norm.y + norm.h,
                    };
                    return rectsOverlap(gridRect, defectRect, EPS);
                })
                : false;

            const material = hasOverlap
                ? new THREE.MeshBasicMaterial({ color: overlapColor, transparent: false, opacity: 1, side: THREE.DoubleSide })
                : new THREE.MeshBasicMaterial({ color: baseGridColor, transparent: false, opacity: 1, side: THREE.DoubleSide });

            const geometry = new THREE.PlaneGeometry(gridWidth, gridHeight);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(gridRect.left + gridWidth / 2, gridRect.top + gridHeight / 2, -0.1);
            mesh.userData.coord = { x: xCoord, y: yCoord };
            sceneRef.current!.add(mesh);
            gridObjs.push(mesh);
            gridMeshCoords.push({ mesh, coord: { x: xCoord, y: yCoord } });

            const edges = new THREE.EdgesGeometry(geometry);
            const border = new THREE.LineSegments(edges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            sceneRef.current!.add(border);
            gridObjs.push(border);
        }

        // Header labels (Excel-like headers)
        const makeLabel = (text: string, color = '#000000') => {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = '#e1f4ff';
            ctx.fillRect(0, 0, size, size);
            ctx.strokeStyle = '#9bbad1';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, size, size);
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 128px Arial';
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillText(text, size / 2, size / 2 + 4);
            const tex = new THREE.CanvasTexture(canvas);
            tex.needsUpdate = true;
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            const sprite = new THREE.Sprite(mat);
            // Match grid cell size so headers align flush with the grid
            sprite.scale.set(gridWidth, gridHeight, 1);
            return sprite;
        };

        if (isFinite(minCoordX) && isFinite(minCoordY)) {
            const headerXCoord = minCoordX - 1;
            const headerYCoord = minCoordY - 1;
            const headerRowTop = -headerYCoord * gridHeight + offsetY;
            const headerColLeft = headerXCoord * gridWidth + offsetX;

            const seenX = new Set<number>();
            for (const [xCoord] of mapCoordinatesRef.current) {
                if (seenX.has(xCoord)) continue;
                seenX.add(xCoord);
                const label = makeLabel(String(xCoord));
                if (label) {
                    const gridLeft = xCoord * gridWidth + offsetX;
                    label.position.set(gridLeft + gridWidth / 2, headerRowTop + gridHeight / 2, 0.3);
                    sceneRef.current!.add(label);
                    gridObjs.push(label);
                }
            }

            const seenY = new Set<number>();
            for (const [, yCoord] of mapCoordinatesRef.current) {
                if (seenY.has(yCoord)) continue;
                seenY.add(yCoord);
                const label = makeLabel(String(yCoord));
                if (label) {
                    const gridTop = -yCoord * gridHeight + offsetY;
                    label.position.set(headerColLeft + gridWidth / 2, gridTop + gridHeight / 2, 0.3);
                    sceneRef.current!.add(label);
                    gridObjs.push(label);
                }
            }

            const corner = makeLabel('X/Y');
            if (corner) {
                corner.position.set(headerColLeft + gridWidth / 2, headerRowTop + gridHeight / 2, 0.3);
                sceneRef.current!.add(corner);
                gridObjs.push(corner);
            }
        }

        gridObjectsRef.current = gridObjs;
        gridMeshCoordsRef.current = gridMeshCoords;
    }, [activeDefects, clampDefectSize, getCoordExtents, gridHeight, gridWidth, offsetX, offsetX_defect, offsetY, offsetY_defect, overlapColor, threeReady]);

    // Rebuild scene on data changes (dies, sheet selection, offsets, etc.)
    useEffect(() => {
        if (!threeReady || !sceneRef.current || !threeRef.current) return;
        const THREE = threeRef.current;
        clearSceneObjects(defectObjectsRef.current);
        clearSceneObjects(gridObjectsRef.current);
        clearSceneObjects(hoverOverlayRef.current);
        defectObjectsRef.current = [];
        gridObjectsRef.current = [];
        gridMeshCoordsRef.current = [];
        hoverOverlayRef.current = [];

        if (mapCoordinates.length === 0) {
            setError(dies && dies.length === 0 ? '没有可显示的晶圆点位' : null);
            return;
        }

        createGridFromCoordinates();

        // Helper: create a red question mark sprite
        const makeQuestionMarkSprite = (w: number, h: number) => {
            const canvas = document.createElement('canvas');
            const size = 256;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#ff0000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 160px Arial';
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
                const norm = normalizeDefect(item, { x: offsetX_defect, y: offsetY_defect });
                const adjW = norm.w;
                const adjH = norm.h;
                const hasColor = colorMap.has(item.class);
                const sizeX = Math.max(adjW, gridWidth * 0.5);
                const sizeY = Math.max(adjH, gridHeight * 0.5);
                if (!hasColor) {
                    const sprite = makeQuestionMarkSprite(sizeX, sizeY);
                    sprite.position.set(norm.x + sizeX / 2, norm.y + sizeY / 2, 0.2);
                    sceneRef.current!.add(sprite);
                    nodes.push(sprite);
                } else {
                    const geometry = new THREE.PlaneGeometry(adjW, adjH);
                    const color = colorMap.get(item.class)!;
                    // Use fully opaque material for accurate, saturated color
                    const material = new THREE.MeshBasicMaterial({
                        color,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1,
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(norm.x + adjW / 2, norm.y + adjH / 2, 0);
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
    }, [activeDefects, clampDefectSize, clearSceneObjects, createGridFromCoordinates, dies, gridHeight, gridWidth, mapCoordinates, offsetX, offsetX_defect, offsetY, offsetY_defect, threeReady]);

    const centerCameraToData = () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const bounds = getBounds();
        if (!camera || !controls || !bounds) return;

        const { minX, maxX, minY, maxY } = bounds;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Only move camera/target; do not change frustum or zoom
        camera.position.x = centerX;
        camera.position.y = centerY;
        camera.updateProjectionMatrix();
        controls.target.set(centerX, centerY, 0);
        controls.update();
    };

    const clearHoverOverlays = useCallback(() => {
        clearSceneObjects(hoverOverlayRef.current);
        hoverOverlayRef.current = [];
    }, [clearSceneObjects]);

    const getHeaderBounds = useCallback(() => {
        const extents = getCoordExtents();
        if (!extents) return null;
        const { minCoordX, maxCoordX, minCoordY, maxCoordY } = extents;
        const headerMinX = minCoordX - 1;
        const headerMinY = minCoordY - 1;
        const width = (maxCoordX - headerMinX + 1) * gridWidth;
        const height = (maxCoordY - headerMinY + 1) * gridHeight;
        const left = headerMinX * gridWidth + offsetX;
        const top = -headerMinY * gridHeight + offsetY; // top edge of header row
        const right = left + width;
        const bottom = top - height;
        return {
            left,
            right,
            top,
            bottom,
            minCoordX,
            maxCoordX,
            minCoordY,
            maxCoordY,
        };
    }, [getCoordExtents, gridHeight, gridWidth, offsetX, offsetY]);

    const coordFromWorld = useCallback((wx: number, wy: number) => {
        const bounds = getHeaderBounds();
        if (!bounds) return null;
        const { left, right, top, bottom, minCoordX, maxCoordX, minCoordY, maxCoordY } = bounds;

        // Align with visual highlight: exclude the left header column from valid coords
        const startX = Math.min(left + gridWidth, right);
        const endX = Math.max(left, right);
        const topEdge = Math.max(top, bottom);
        const bottomEdge = Math.min(top, bottom);

        if (wx < startX || wx > endX) return null;
        if (wy > topEdge || wy < bottomEdge) return null;

        const headerMinX = minCoordX;
        const headerMinY = minCoordY;

        const relX = wx - startX;
        const relY = topEdge - wy;
        const x = Math.floor(relX / gridWidth + 1e-6) + headerMinX;
        const y = Math.floor(relY / gridHeight + 1e-6) + headerMinY;
        if (x < headerMinX || x > maxCoordX || y < headerMinY || y > maxCoordY) return null;
        return { x, y };
    }, [getHeaderBounds, gridWidth, gridHeight]);

    // Hover coordinate detection (raycast + fallback from world coords)
    useEffect(() => {
        const canvas = rendererRef.current?.domElement;
        const camera = cameraRef.current;
        const raycaster = raycasterRef.current;
        const THREE = threeRef.current;
        const pointer = pointerRef.current;
        if (!canvas || !camera || !raycaster || !THREE || !pointer) return;

        const handlePointerMove = (evt: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            pointer.set(
                ((evt.clientX - rect.left) / rect.width) * 2 - 1,
                -((evt.clientY - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(pointer, camera);
            const world = new THREE.Vector3(pointer.x, pointer.y, 0);
            world.unproject(camera);
            pointerWorldRef.current = { x: world.x, y: world.y };
            setPointerVersion((v) => v + 1);
            const meshes = gridMeshCoordsRef.current.map((m) => m.mesh);
            const intersects = raycaster.intersectObjects(meshes, false);

            const fallbackCoord = coordFromWorld(world.x, world.y);
            if (intersects.length > 0) {
                const hitMesh = intersects[0].object as THREE.Mesh;
                const found = gridMeshCoordsRef.current.find((m) => m.mesh === hitMesh);
                const nextCoord = found?.coord ?? fallbackCoord;
                if (!nextCoord) clearHoverOverlays();
                setHoverCoord(nextCoord);
            } else {
                if (!fallbackCoord) clearHoverOverlays();
                setHoverCoord(fallbackCoord);
            }
        };
        const handleLeave = () => {
            setHoverCoord(null);
            pointerWorldRef.current = null;
            setPointerVersion((v) => v + 1);
        };

        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerleave', handleLeave);
        return () => {
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerleave', handleLeave);
        };
    }, [clearHoverOverlays, coordFromWorld, threeReady]);

    // Draw Excel-like row/column hover highlight plus a floating label
    const updateHoverOverlays = useCallback(() => {
        if (!sceneRef.current || !threeRef.current) return;
        const THREE = threeRef.current;
        clearHoverOverlays();
        if (!hoverCoord) return;

        const headerBounds = getHeaderBounds();
        if (!headerBounds) return;
        const { left, right, top, bottom } = headerBounds;

        const minWorldX = Math.min(left + gridWidth, right);
        const maxWorldX = Math.max(left, right);
        const minWorldY = Math.min(top, bottom);
        const maxWorldY = Math.max(top, bottom);

        const totalWidth = maxWorldX - minWorldX;
        const totalHeight = maxWorldY - minWorldY;

        const totalCenterX = (minWorldX + maxWorldX) / 2;
        const totalCenterY = (minWorldY + maxWorldY) / 2;

        const rowTop = -hoverCoord.y * gridHeight + offsetY;
        const rowCenterY = rowTop + gridHeight / 2;
        const colLeft = hoverCoord.x * gridWidth + offsetX;
        const colCenterX = colLeft + gridWidth / 2;

        const rawCursorX = pointerWorldRef.current?.x ?? colCenterX;
        const rawCursorY = pointerWorldRef.current?.y ?? rowCenterY;
        if (rawCursorX < minWorldX || rawCursorX > maxWorldX) {
            clearHoverOverlays();
            return;
        }
        const cursorX = Math.min(maxWorldX, Math.max(minWorldX, rawCursorX));
        const cursorY = Math.min(maxWorldY, Math.max(minWorldY, rawCursorY));

        const rowMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.35, depthWrite: false });
        const colMat = new THREE.MeshBasicMaterial({ color: 0xc4e4ff, transparent: true, opacity: 0.35, depthWrite: false });
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.45, depthWrite: false });

        const rowGeo = new THREE.PlaneGeometry(totalWidth, gridHeight);
        const rowMesh = new THREE.Mesh(rowGeo, rowMat);
        rowMesh.position.set(totalCenterX, rowCenterY, 0.12);

        const colGeo = new THREE.PlaneGeometry(gridWidth, totalHeight);
        const colMesh = new THREE.Mesh(colGeo, colMat);
        colMesh.position.set(colCenterX, totalCenterY, 0.11);

        const horizLineGeo = new THREE.PlaneGeometry(totalWidth, Math.max(gridHeight * 0.04, 0.15));
        const horizLine = new THREE.Mesh(horizLineGeo, lineMat);
        horizLine.position.set(totalCenterX, cursorY, 0.2);

        const vertLineGeo = new THREE.PlaneGeometry(Math.max(gridWidth * 0.04, 0.15), totalHeight);
        const vertLine = new THREE.Mesh(vertLineGeo, lineMat);
        vertLine.position.set(cursorX, totalCenterY, 0.2);

        const nodes: THREE.Object3D[] = [rowMesh, colMesh, horizLine, vertLine];

        const ctor = css2dObjectCtorRef.current;
        if (ctor) {
            // Apply custom offset to a child so the renderer's own transform isn't overwritten
            const outer = document.createElement('div');
            const bubble = document.createElement('div');
            bubble.textContent = `(${hoverCoord.x}, ${hoverCoord.y})`;
            bubble.style.fontFamily = 'Inter, "Segoe UI", Arial, sans-serif';
            bubble.style.fontSize = '12px';
            bubble.style.fontWeight = '600';
            bubble.style.color = '#0f172a';
            bubble.style.background = 'rgba(255, 255, 255, 0.92)';
            bubble.style.border = '1px solid rgba(0, 0, 0, 0.12)';
            bubble.style.borderRadius = '6px';
            bubble.style.padding = '2px 6px';
            bubble.style.pointerEvents = 'none';
            bubble.style.transform = 'translate(-50%, 80%)';
            outer.appendChild(bubble);
            const label = new ctor(outer);
            label.position.set(cursorX, cursorY, 0.25);
            nodes.push(label);
        }

        nodes.forEach(n => sceneRef.current!.add(n));
        hoverOverlayRef.current = nodes;
    }, [clearHoverOverlays, getHeaderBounds, gridHeight, gridWidth, hoverCoord, offsetX, offsetY]);

    useEffect(() => {
        updateHoverOverlays();
    }, [updateHoverOverlays, pointerVersion]);

    return (
        <Card withBorder radius="md" padding="md" style={{ width: '100%', height: '100%', ...style }}>
            <Paper
                shadow="sm"
                p="xs"
                radius="md"
                withBorder
                mb="md"
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
                <Group justify="space-between" gap="xs">
                    <Text size="sm" c="dimmed">缩放</Text>
                    <Text size="sm">{zoom.toFixed(2)}×</Text>
                </Group>

                <Group gap="xs" grow>
                    <Button size="xs" variant="light" onClick={() => centerCameraToData()}>居中视图</Button>
                    <Button size="xs" variant="light" onClick={() => setZoom(1)}>重置缩放</Button>
                </Group>

                <Slider min={0.5} max={5} step={0.01} value={zoom} onChange={setZoom} />

                <Button
                    size="xs"
                    variant="outline"
                    leftSection={<IconRefresh size={14} />}
                    onClick={refreshRenderer}
                >
                    刷新渲染
                </Button>

                <Group gap="xs">
                    <Text size="sm" c="dimmed">坐标:</Text>
                    <Text size="sm" fw={600}>
                        {hoverCoord ? `(${hoverCoord.x}, ${hoverCoord.y})` : '—'}
                    </Text>
                </Group>
            </Paper>

            <Box style={{ position: 'relative', width: '100%', height: '100%' }}>
                <div
                    ref={squareRef}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: 'auto',
                        aspectRatio: '1 / 1',
                        minHeight: 240,
                        overflow: 'visible',
                    }}
                />

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
            </Box>
        </Card>
    );
}

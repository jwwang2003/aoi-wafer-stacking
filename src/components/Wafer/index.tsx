import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box } from '@mantine/core';
import { SubstrateDefectRecord } from '@/types/Wafer';

interface SubstrateRendererProps {
    gridWidth?: number;
    gridHeight?: number;
    overlapColor?: number;
    style?: React.CSSProperties;
    selectedSheetId: string | null;
    sheetsData: Record<string, SubstrateDefectRecord[]>;
    gridOffset?: { x: number; y: number };
}

export default function SubstrateRenderer({
    gridWidth = 4.134,
    gridHeight = 3.74,
    overlapColor = 0xfa5959,
    style,
    selectedSheetId,
    sheetsData,
    gridOffset = { x: 0, y: 0 },
}: SubstrateRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [mapCoordinates, setMapCoordinates] = useState<[number, number][]>([]);

    const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const defectObjectsRef = useRef<THREE.Object3D[]>([]);
    const gridObjectsRef = useRef<THREE.Object3D[]>([]);
    const { x: offsetX, y: offsetY } = gridOffset;

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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith('.WaferMap')) {
            setError('请上传.WaferMap格式的文件');
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setFileContent(content);
            setError(null);
        };
        reader.onerror = () => {
            setError('文件读取失败，请重试');
        };
        reader.readAsText(file);
    };

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

    // 解析WaferMap文件内容
    useEffect(() => {
        if (!fileContent) {
            setMapCoordinates([]);
            return;
        }

        try {
            const mapStartIndex = fileContent.indexOf('[MAP]:');
            if (mapStartIndex === -1) {
                setError('文件中未找到[MAP]部分');
                return;
            }

            const mapContent = fileContent.slice(mapStartIndex + '[MAP]:'.length).trim();
            const lines = mapContent.split('\n');
            const coordinates: [number, number][] = [];

            lines.forEach((line: string) => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return;

                const parts = trimmedLine.split(/\s+/).map(Number);
                if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    coordinates.push([parts[0], parts[1]]);
                }
            });

            if (coordinates.length === 0) {
                setError('未从[MAP]部分解析到有效坐标');
                return;
            }

            setMapCoordinates(coordinates);
            setError(null);
        } catch (err) {
            setError(`文件解析失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [fileContent]);

    useEffect(() => {
        defectObjectsRef.current.forEach(obj => sceneRef.current.remove(obj));
        gridObjectsRef.current.forEach(obj => sceneRef.current.remove(obj));

        if (mapCoordinates.length === 0) {
            if (fileContent) {
                setError('未解析到有效的坐标数据');
            }
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

        mapCoordinates.forEach(([xCoord, yCoord]) => {
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
        });

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

        mapCoordinates.forEach(([xCoord, yCoord]) => {
            const x = xCoord * gridWidth + offsetX;
            const y = yCoord * gridHeight + offsetY;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + gridWidth);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y + gridHeight);
        });

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
        camera.updateProjectionMatrix();

        controls.target.set(centerX, centerY, 0);
        controls.update();
    };

    return (
        <>
            <input
                type="file"
                accept=".WaferMap"
                onChange={handleFileUpload}
                style={{
                    margin: '10px 0',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                }}
            />

            <Box
                ref={containerRef}
                style={{
                    width: '100%',
                    height: 'calc(100vh - 50px)',
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
                            zIndex: 100,
                        }}
                    >
                        {error}
                    </Box>
                )}
            </Box>
        </>
    );
}

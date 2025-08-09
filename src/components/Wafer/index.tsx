import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SubstrateDefectRecord {
    no: number;
    x: number;
    y: number;
    w: number;
    h: number;
    area: number;
    class: string;
    contrast: number;
    channel: string;
}

export type FileSpec = {
    id: string;
    label: string;
    file: string;
};

export type ClassColor = {
    class: string;
    color: number;
};

export type DefectViewerProps = {
    files: FileSpec[];
    initialFileId?: string;
    classColorMap?: ClassColor[];
    gridSize?: number;
    overlapColor?: number;
    loader?: (filePath: string) => Promise<SubstrateDefectRecord[]>;
    style?: React.CSSProperties;
    className?: string;
};

const DEFAULT_CLASS_COLORS: ClassColor[] = [
    { class: "Unclassified", color: 0xff0000 },
    { class: "Particle", color: 0x000000 },
    { class: "Pit", color: 0x00ff00 },
    { class: "Bump", color: 0xadaf08 },
    { class: "MicroPipe", color: 0x0000ff },
    { class: "Line", color: 0x00ffff },
    { class: "carrot", color: 0xff92f8 },
    { class: "triangle", color: 0xc15dd7 },
    { class: "Downfall", color: 0x0000ff },
    { class: "scratch", color: 0xc15dd7 },
    { class: "PL_Black", color: 0xffa500 },
    { class: "PL_White", color: 0xff007b },
    { class: "PL_BPD", color: 0x38d1ff },
    { class: "PL_SF", color: 0x6d6df2 },
    { class: "PL_BSF", color: 0xff92f8 },
];

async function defaultLoader(filePath: string): Promise<SubstrateDefectRecord[]> {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Failed to load ${filePath}`);
    return (await res.json()) as SubstrateDefectRecord[];
}

export default function DefectViewer({
    files,
    initialFileId,
    classColorMap = DEFAULT_CLASS_COLORS,
    gridSize = 5,
    overlapColor = 0xfa5959,
    loader = defaultLoader,
    style,
    className,
}: DefectViewerProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const infoRef = useRef<HTMLDivElement | null>(null);
    const legendRef = useRef<HTMLDivElement | null>(null);

    const [currentId, setCurrentId] = useState<string>(
        initialFileId ?? (files[0]?.id ?? "")
    );
    const [loadingText, setLoadingText] = useState<string>("加载中...");

    const defectGroups = useRef<
        Record<string, { objects: THREE.Object3D[]; rawData: SubstrateDefectRecord[] } | undefined>
    >({});

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    // const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const scaleRef = useRef<number | null>(null);

    const gridObjectsRef = useRef<THREE.Object3D[]>([]);

    const colorLookup = useMemo(() => {
        const map = new Map<string, number>();
        for (const item of classColorMap) map.set(item.class, item.color);
        return map;
    }, [classColorMap]);

    function getColorForClass(cls?: string): number {
        if (!cls) return 0xff00ff;
        return colorLookup.get(cls) ?? 0xff00ff;
    }

    function createGrid(bounds: { minX: number; maxX: number; minY: number; maxY: number }, defects: SubstrateDefectRecord[]) {
        const scene = sceneRef.current;
        if (!scene) return;
        gridObjectsRef.current.forEach((obj) => scene.remove(obj));
        gridObjectsRef.current = [];
        const { minX, maxX, minY, maxY } = bounds;
        const maxGridX = Math.ceil(Math.max(Math.abs(minX), Math.abs(maxX)) / gridSize);
        const maxGridY = Math.ceil(Math.max(Math.abs(minY), Math.abs(maxY)) / gridSize);
        const offsetX = gridSize / 2;
        const offsetY = gridSize / 2;
        const baseGridColor = 0x8cefa1;
        const gridMaterial = new THREE.MeshBasicMaterial({ color: baseGridColor, opacity: 0.3, transparent: true, side: THREE.DoubleSide });
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

        for (let i = -maxGridX; i <= maxGridX; i++) {
            for (let j = -maxGridY; j <= maxGridY; j++) {
                const distance = Math.sqrt(Math.pow(i / maxGridX || 0, 2) + Math.pow(j / maxGridY || 0, 2));
                if (distance <= 1.0) {
                    const gridX = i * gridSize + offsetX;
                    const gridY = j * gridSize + offsetY;
                    const gridMinX = gridX - gridSize / 2;
                    const gridMaxX = gridX + gridSize / 2;
                    const gridMinY = gridY - gridSize / 2;
                    const gridMaxY = gridY + gridSize / 2;
                    let hasOverlap = defects?.some(d => d.x >= gridMinX && d.x <= gridMaxX && d.y >= gridMinY && d.y <= gridMaxY);
                    const material = hasOverlap ? new THREE.MeshBasicMaterial({ color: overlapColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide }) : gridMaterial;
                    const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(gridX, gridY, -0.1);
                    scene.add(mesh);
                    gridObjectsRef.current.push(mesh);
                    const edges = new THREE.EdgesGeometry(geometry);
                    const border = new THREE.LineSegments(edges, borderMaterial);
                    border.position.copy(mesh.position);
                    border.renderOrder = 1;
                    scene.add(border);
                    gridObjectsRef.current.push(border);
                }
            }
        }
    }

    function showFile(fileId: string) {
        const group = defectGroups.current[fileId];
        const scene = sceneRef.current;
        const cam = cameraRef.current;
        const controls = controlsRef.current;
        const container = containerRef.current;
        if (!group || !scene || !cam || !controls || !container) return;
        for (const id of Object.keys(defectGroups.current)) {
            if (id === fileId) continue;
            defectGroups.current[id]?.objects.forEach((obj) => scene.remove(obj));
        }
        group.objects.forEach((obj) => scene.add(obj));

        if (group.rawData.length) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const item of group.rawData) {
                const { x, y, w, h } = item;
                minX = Math.min(minX, x - w / 600);
                maxX = Math.max(maxX, x + w / 600);
                minY = Math.min(minY, y - h / 600);
                maxY = Math.max(maxY, y + h / 600);
            }
            createGrid({ minX, maxX, minY, maxY }, group.rawData);
            const dataWidth = maxX - minX;
            const dataHeight = maxY - minY;
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const margin = 1.3;
            const { width, height } = container.getBoundingClientRect();
            const scaleX = width / (dataWidth * margin || 1);
            const scaleY = height / (dataHeight * margin || 1);
            const scale = Math.min(scaleX, scaleY) || 1;
            scaleRef.current = scale;
            cam.left = -width / 2 / scale;
            cam.right = width / 2 / scale;
            cam.top = height / 2 / scale;
            cam.bottom = -height / 2 / scale;
            cam.position.x = centerX;
            cam.position.y = centerY;
            cam.updateProjectionMatrix();
            controls.target.set(centerX, centerY, 0);
            controls.update();
        }
        setCurrentId(fileId);
    }

    useEffect(() => {
        let cancelled = false;
        async function loadAll() {
            if (!files.length) return;
            const results: { id: string; objects: THREE.Object3D[]; rawData: SubstrateDefectRecord[] }[] = await Promise.all(files.map(async (f) => {
                try {
                    setLoadingText(`加载 ${f.label} ...`);
                    const defects = await loader(f.file);
                    const objects: THREE.Object3D[] = defects.map(item => {
                        const geometry = new THREE.PlaneGeometry(item.w / 300, item.h / 300);
                        const material = new THREE.MeshBasicMaterial({
                            color: getColorForClass(item.class),
                            side: THREE.DoubleSide,
                            transparent: true,
                            opacity: 0.8,
                        });
                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.position.set(item.x, item.y, 0);
                        return mesh;
                    });
                    return { id: f.id, objects: [...objects], rawData: defects };
                } catch (e) {
                    console.error(e);
                    return { id: f.id, objects: [], rawData: [] };
                }
            }));
            if (cancelled) return;
            for (const r of results) {
                defectGroups.current[r.id] = { objects: r.objects, rawData: r.rawData };
            }
            const first = initialFileId ?? files[0]?.id;
            if (first) showFile(first);
            if (infoRef.current) {
                const parts = results.map((r) => {
                    const label = files.find((f) => f.id === r.id)?.label ?? r.id;
                    return `${label}：${r.rawData.length} 个缺陷`;
                });
                infoRef.current.textContent = `${parts.join(" | ")}   操作：滚轮缩放 · 右键拖动平移`;
            }
        }
        loadAll();
        return () => { cancelled = true; };
    }, [files, initialFileId, loader]);

    return (
        <div ref={containerRef} className={"relative w-full h-full overflow-hidden " + (className ?? "")} style={style}>
            <div ref={infoRef} className="absolute top-2 left-2 z-50 bg-white/95 border border-gray-300 rounded px-3 py-2 text-sm font-sans">{loadingText}</div>
            <div ref={legendRef} className="absolute top-2 right-2 z-50 bg-white/95 border border-gray-300 rounded px-4 py-3 max-h-[90vh] overflow-y-auto text-sm font-sans" />
            <div className="absolute bottom-5 left-5 z-50 flex gap-2">
                {files.map((f) => (
                    <button key={f.id} onClick={() => showFile(f.id)}
                        className={`px-3 py-2 rounded border-2 text-sm font-sans transition-all ${currentId === f.id ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-900 border-gray-500 hover:bg-gray-50"}`}
                        title={f.file}>
                        {f.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

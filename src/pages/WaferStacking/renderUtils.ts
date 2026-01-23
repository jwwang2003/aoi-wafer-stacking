import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AsciiDie, WaferMapDie } from '@/types/ipc';
import { BinValue } from '@/types/ipc';
import { isNumberBin, isSpecialBin } from '@/types/ipc';
import { PASS_VALUES } from './priority';
import { computeDieRect, GridOffset, GridSize } from './substrateMapping';

const LETTER_TO_NUMBER_MAP: Record<string, number> = {
    'A': 10,
    'B': 11,
    'C': 12,
    'D': 13,
    'E': 14,
    'F': 15,
    'G': 16,
    'H': 17,
    'I': 18,
    'J': 19,
    'z': 20 // ink marker待修
};

const convertBinToNumber = (binKey: string): string | null => {
    if (!isNaN(Number(binKey))) {
        return binKey;
    }
    const mappedNumber = LETTER_TO_NUMBER_MAP[binKey];
    return mappedNumber !== undefined ? mappedNumber.toString() : null;
};

function calculateTestStats(binCounts: Map<string, number>): { totalTested: number; totalPass: number; yieldRate: number } {
    let totalTested = 0, totalPass = 0;
    binCounts.forEach((count, binKey) => {
        if (!['S', '*'].includes(binKey)) totalTested += count;
        if (PASS_VALUES.has(binKey)) totalPass += count;
    });
    return {
        totalTested,
        totalPass,
        yieldRate: totalTested > 0 ? Math.round((totalPass / totalTested) * 10000) / 100 : 0
    };
}

export function countBinValues(dies: (AsciiDie | WaferMapDie)[]): Map<string, number> {
    const binCounts = new Map<string, number>();
    dies.forEach(die => {
        if ('bin' in die) {
            const originalBinKey = isNumberBin(die.bin)
                ? die.bin.number.toString()
                : isSpecialBin(die.bin) ? die.bin.special : '';

            if (!originalBinKey) return;

            const numericBinKey = convertBinToNumber(originalBinKey);
            if (!numericBinKey) return;

            binCounts.set(numericBinKey, (binCounts.get(numericBinKey) || 0) + 1);
        }
    });
    return binCounts;
}

export function formatDateTime(date: Date): string {
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function createInfoLinesCanvas(infoLines: string[], targetWidth: number): HTMLCanvasElement {
    const lineHeight = 24, padding = 15;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = padding * 2 + infoLines.length * lineHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取2D上下文');

    ctx.fillStyle = '#ffffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    infoLines.forEach((line, index) => {
        const y = padding + lineHeight / 2 + index * lineHeight;
        ctx.fillText(line, canvas.width / 2, y);
    });

    return canvas;
}

export function getColorByBin(bin: BinValue, defaultColor: number = 0xcccccc): number {
    if (isNumberBin(bin)) {
        switch (bin.number) {
            case 0: return 0xd8a5bb;
            case 1: return 0x00ff00;
            case 2: return 0x7b7bc6;
            case 3: return 0xff78f6;
            case 4: return 0xfdfe00;
            case 5: return 0x00c8f7;
            case 6: return 0x2469d2;
            case 7: return 0xc85576;
            case 8: return 0xff00e2;
            case 9: return 0x394c44;
            case 10: return 0xcf1afc;
            case 11: return 0x2c31b0;
            case 12: return 0xa8cf7e;
            case 13: return 0x00eb7d;
            case 14: return 0xfbc03a;
            case 15: return 0x9000ca;
            case 16: return 0x085ab4;
            case 17: return 0x3a56b9;
            case 18: return 0xff0700;
            case 19: return 0x00b673;
            case 20: return 0x594543;
        }
    } else if (isSpecialBin(bin)) {
        if (bin.special === 'S') return 0xd1191f;
        const numericBin = LETTER_TO_NUMBER_MAP[bin.special];
        if (numericBin !== undefined) {
            return getColorByBin({ number: numericBin }, defaultColor);
        }
    }
    return defaultColor;
}

function createBinLegend(binCounts: Map<string, number>, targetWidth: number): HTMLCanvasElement {
    const itemsPerRow = 5, itemHeight = 30, padding = 20, titleHeight = 30;
    const allBinKeys = Array.from({ length: 21 }, (_, i) => (i).toString());
    Array.from(binCounts.keys()).forEach(key => {
        if (isNaN(Number(key)) && !allBinKeys.includes(key)) {
            allBinKeys.push(key);
        }
    });

    const rows = Math.ceil(allBinKeys.length / itemsPerRow);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = titleHeight + rows * itemHeight + padding * 2;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取2D上下文');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';

    allBinKeys.forEach((binKey, index) => {
        const row = Math.floor(index / itemsPerRow), col = index % itemsPerRow;
        const x = padding + col * (targetWidth / itemsPerRow);
        const y = padding + titleHeight + row * itemHeight;

        const tempBin: BinValue = !isNaN(Number(binKey))
            ? { number: Number(binKey) }
            : { special: binKey };

        const color = getColorByBin(tempBin);
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(x, y, 20, 20);
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'left';
        ctx.fillText(`BIN ${binKey} = ${binCounts.get(binKey) || 0} `, x + 30, y + 15);
    });
    return canvas;
}

function mergeImages(mainCanvas: HTMLCanvasElement, infoCanvas: HTMLCanvasElement, legendCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = mainCanvas.width;
    mergedCanvas.height = mainCanvas.height + infoCanvas.height + legendCanvas.height;

    const ctx = mergedCanvas.getContext('2d');
    if (!ctx) throw new Error('无法获取2D上下文');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height);
    ctx.drawImage(mainCanvas, 0, 0);
    ctx.drawImage(infoCanvas, 0, mainCanvas.height);
    ctx.drawImage(legendCanvas, 0, mainCanvas.height + infoCanvas.height);

    return mergedCanvas;
}

export async function renderAsJpg(
    dies: (AsciiDie | WaferMapDie)[],
    defects: Array<{ x: number; y: number; w: number; h: number; class: string }>,
    gridWidth: number = 4.134,
    gridHeight: number = 3.74,
    gridOffset: GridOffset = { x: 0, y: 0 },
    header?: Record<string, string>
): Promise<Uint8Array> {
    const mainSize = 1000;
    const container = document.createElement('div');
    container.style.cssText = `position:absolute;top:-9999px;left:-9999px;width:${mainSize}px;height:${mainSize + 500}px`;
    document.body.appendChild(container);

    try {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.OrthographicCamera(
            -mainSize / 2, mainSize / 2, mainSize / 2, -mainSize / 2, 0.1, 1000
        );
        camera.position.z = 10;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: false,
            precision: 'highp'
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(mainSize, mainSize);
        container.appendChild(renderer.domElement);

        // Mark parameter as used to satisfy noUnusedParameters while ignoring defects in rendering
        void defects;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.enableRotate = false;
        controls.enableZoom = false;
        controls.enablePan = true;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
        controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.PAN };

        const gridSize: GridSize = { width: gridWidth, height: gridHeight };
        const dieMap = new Map<string, AsciiDie | WaferMapDie>();
        dies.forEach(die => dieMap.set(`${die.x}|${die.y}`, die));

        const mapCoordinates = Array.from(dieMap.keys()).map(key =>
            key.split('|').map(Number) as [number, number]
        );

        if (mapCoordinates.length === 0) throw new Error('没有可渲染的晶粒数据');

        // Reuse geometries/materials to reduce allocations
        const sharedPlane = new THREE.PlaneGeometry(gridWidth, gridHeight);
        const sharedEdges = new THREE.EdgesGeometry(sharedPlane);
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

        mapCoordinates.forEach(([xCoord, yCoord]) => {
            const die = dieMap.get(`${xCoord}|${yCoord}`);
            if (!die) return;

            const { left: gridLeft, top: gridTop } = computeDieRect({ x: xCoord, y: yCoord }, gridSize, gridOffset);
            const gridColor = 'bin' in die ? getColorByBin(die.bin) : 0x8cefa1;

            const material = new THREE.MeshBasicMaterial({ color: gridColor, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(sharedPlane, material);
            mesh.position.set(gridLeft + gridWidth / 2, gridTop + gridHeight / 2, -0.1);
            mesh.renderOrder = 0;
            scene.add(mesh);

            const border = new THREE.LineSegments(sharedEdges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            scene.add(border);
        });

        // No defect rendering

        const fitCameraToData = () => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

            mapCoordinates.forEach(([xCoord, yCoord]) => {
                const { left: x, top: y } = computeDieRect({ x: xCoord, y: yCoord }, gridSize, gridOffset);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + gridWidth);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y + gridHeight);
            });

            // Defects are ignored for camera fitting

            const padding = 5;
            minX -= padding; maxX += padding; minY -= padding; maxY += padding;

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const dataW = maxX - minX;
            const dataH = maxY - minY;
            const scale = Math.min(
                mainSize / (dataW * 1.0 || 1),
                mainSize / (dataH * 1.0 || 1)
            ) || 1;

            camera.left = -mainSize / 2 / scale;
            camera.right = mainSize / 2 / scale;
            camera.top = mainSize / 2 / scale;
            camera.bottom = -mainSize / 2 / scale;
            camera.position.set(centerX, centerY, 10);
            camera.updateProjectionMatrix();

            controls.target.set(centerX, centerY, 0);
            controls.update();
        };

        fitCameraToData();
        renderer.render(scene, camera);

        const mainCanvas = renderer.domElement;
        const binCounts = countBinValues(dies);
        const { totalTested, totalPass, yieldRate } = calculateTestStats(binCounts);

        const notchDir = header?.['Flat/Notch'] || header?.['Notch'];
        const infoLines = header ? [
            `产品名称: ${(header['Product'] || header['Device Name']) + '_' + (header['Lot No.'] || '') + '_' + (header['Wafer ID'] || '')}       Wafer厚度:0.000`,
            `晶圆尺寸: ${header['Wafer Size'] || 0}       布距: [${header['Index X'] || 0}.000, ${header['Index Y'] || 0}.000]       切角: ${notchDir || 'Unknown'}`,
            `时间: ${new Date().toLocaleString()}    测试总数: ${totalTested}    良品: ${totalPass}    次品: ${totalTested - totalPass}    良率: ${yieldRate}%`
        ] : [];

        const infoCanvas = createInfoLinesCanvas(infoLines, mainSize);
        const legendCanvas = createBinLegend(binCounts, mainSize);
        const mergedCanvas = mergeImages(mainCanvas, infoCanvas, legendCanvas);
        const imageData = mergedCanvas.toDataURL('image/jpeg', 1.0);
        const response = await fetch(imageData);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        return new Uint8Array(arrayBuffer);
    } finally {
        document.body.removeChild(container);
    }
}

export async function renderSubstrateAsJpg(
    dies: (AsciiDie | WaferMapDie)[],
    _defects: Array<{ x: number; y: number; w: number; h: number; class: string }>,
    gridWidth: number = 4.134,
    gridHeight: number = 3.74,
    gridOffset: GridOffset = { x: 0, y: 0 },
    header?: Record<string, string>
): Promise<Uint8Array> {
    const mainSize = 1000;
    const container = document.createElement('div');
    container.style.cssText = `position:absolute;top:-9999px;left:-9999px;width:${mainSize}px;height:${mainSize + 500}px`;
    document.body.appendChild(container);

    try {
        // Mark parameter as used; defects are not rendered in substrate-style output
        void _defects;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.OrthographicCamera(
            -mainSize / 2, mainSize / 2, mainSize / 2, -mainSize / 2, 0.1, 1000
        );
        camera.position.z = 10;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: false
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(mainSize, mainSize);
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.enableRotate = false;
        controls.enableZoom = false;
        controls.enablePan = true;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
        controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.PAN };

        const baseGridColor = 0x8cefa1;
        const gridSize: GridSize = { width: gridWidth, height: gridHeight };
        const dieMap = new Map<string, AsciiDie | WaferMapDie>();
        dies.forEach(die => dieMap.set(`${die.x}|${die.y}`, die));
        const mapCoordinates = Array.from(dieMap.keys()).map(key =>
            key.split('|').map(Number) as [number, number]
        );
        if (mapCoordinates.length === 0) throw new Error('没有可渲染的晶粒数据');

        const sharedPlane = new THREE.PlaneGeometry(gridWidth, gridHeight);
        const sharedEdges = new THREE.EdgesGeometry(sharedPlane);
        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        const fillMaterial = new THREE.MeshBasicMaterial({ color: baseGridColor, side: THREE.DoubleSide });

        mapCoordinates.forEach(([xCoord, yCoord]) => {
            const { left: gridLeft, top: gridTop } = computeDieRect({ x: xCoord, y: yCoord }, gridSize, gridOffset);

            const mesh = new THREE.Mesh(sharedPlane, fillMaterial);
            mesh.position.set(gridLeft + gridWidth / 2, gridTop + gridHeight / 2, -0.1);
            mesh.renderOrder = 0;
            scene.add(mesh);

            const border = new THREE.LineSegments(sharedEdges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            scene.add(border);
        });

        const fitCameraToData = () => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            mapCoordinates.forEach(([xCoord, yCoord]) => {
                const { left: x, top: y } = computeDieRect({ x: xCoord, y: yCoord }, gridSize, gridOffset);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + gridWidth);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y + gridHeight);
            });

            const padding = 5;
            minX -= padding; maxX += padding; minY -= padding; maxY += padding;
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const dataW = maxX - minX;
            const dataH = maxY - minY;
            const scale = Math.min(
                mainSize / (dataW * 1.0 || 1),
                mainSize / (dataH * 1.0 || 1)
            ) || 1;

            camera.left = -mainSize / 2 / scale;
            camera.right = mainSize / 2 / scale;
            camera.top = mainSize / 2 / scale;
            camera.bottom = -mainSize / 2 / scale;
            camera.position.set(centerX, centerY, 10);
            camera.updateProjectionMatrix();

            controls.target.set(centerX, centerY, 0);
            controls.update();
        };
        fitCameraToData();
        renderer.render(scene, camera);

        const mainCanvas = renderer.domElement;
        const binCounts = countBinValues(dies);
        const { totalTested, totalPass, yieldRate } = calculateTestStats(binCounts);

        const notchDir = header?.['Flat/Notch'] || header?.['Notch'];
        const infoLines = header ? [
            `产品名称: ${(header['Product'] || header['Device Name']) + '_' + (header['Lot No.'] || '') + '_' + (header['Wafer ID'] || '')}       Wafer厚度:0.000`,
            `晶圆尺寸: ${header['Wafer Size'] || 0}       布距: [${header['Index X'] || 0}.000, ${header['Index Y'] || 0}.000]       切角: ${notchDir || 'Unknown'}`,
            `时间: ${new Date().toLocaleString()}    测试总数: ${totalTested}    良品: ${totalPass}    次品: ${totalTested - totalPass}    良率: ${yieldRate}%`
        ] : [];

        const infoCanvas = createInfoLinesCanvas(infoLines, mainSize);
        const legendCanvas = createBinLegend(binCounts, mainSize);
        const mergedCanvas = mergeImages(mainCanvas, infoCanvas, legendCanvas);
        const imageData = mergedCanvas.toDataURL('image/jpeg', 1.0);
        const response = await fetch(imageData);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    } finally {
        document.body.removeChild(container);
    }
}

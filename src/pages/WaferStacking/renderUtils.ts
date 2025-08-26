import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AsciiDie, WaferMapDie } from '@/types/ipc';
import { colorMap } from '@/components/Substrate/Wafer';
import { BinValue } from '@/types/ipc';
import { isNumberBin, isSpecialBin } from '@/types/ipc';

function calculateTestStats(binCounts: Map<string, number>): { totalTested: number; totalPass: number; yieldRate: number } {
    let totalTested = 0, totalPass = 0;
    const passBins = ['1', 'G', 'H', 'I', 'J'];

    binCounts.forEach((count, binKey) => {
        if (!['S', '*'].includes(binKey)) totalTested += count;
        if (passBins.includes(binKey)) totalPass += count;
    });

    return {
        totalTested,
        totalPass,
        yieldRate: totalTested > 0 ? Math.round((totalPass / totalTested) * 10000) / 100 : 0
    };
}

function countBinValues(dies: (AsciiDie | WaferMapDie)[]): Map<string, number> {
    const binCounts = new Map<string, number>();
    dies.forEach(die => {
        if ('bin' in die) {
            const binKey = isNumberBin(die.bin)
                ? die.bin.number.toString()
                : isSpecialBin(die.bin) ? die.bin.special : '';

            if (binKey) binCounts.set(binKey, (binCounts.get(binKey) || 0) + 1);
        }
    });
    return binCounts;
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
            case 0: return 0xd49ec3;
            case 1: return 0x19f520;
            case 2: return 0x9790bc;
            case 3: return 0xf686ed;
            case 4: return 0xfff700;
            case 5: return 0x2fc2ef;
            case 6: return 0x2f7ebe;
            case 7: return 0xc0658b;
            case 8: return 0xeb42b0;
            case 9: return 0x675b63;
            case 10: return 0xca57c7;
            case 11: return 0x2338bc;
            case 12: return 0xa4ee6b;
            case 13: return 0x51fd54;
            case 14: return 0xffc929;
            case 15: return 0x9e49cc;
            case 16: return 0x256ebd;
            case 17: return 0x487eb8;
            case 18: return 0xfc3a3a;
            case 19: return 0x23cd64;
            case 20: return 0x685c5c;
        }
    } else if (isSpecialBin(bin)) { //后续字母转数字
        switch (bin.special) {
            case 'A': return 0xe82ef2;
            case 'B': return 0x1d37ac;
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
    gridOffset: { x: number; y: number } = { x: 0, y: 0 },
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

        const dieMap = new Map<string, AsciiDie | WaferMapDie>();
        dies.forEach(die => dieMap.set(`${die.x}|${die.y}`, die));

        const mapCoordinates = Array.from(dieMap.keys()).map(key =>
            key.split('|').map(Number) as [number, number]
        );

        if (mapCoordinates.length === 0) throw new Error('没有可渲染的晶粒数据');

        const borderMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

        mapCoordinates.forEach(([xCoord, yCoord]) => {
            const die = dieMap.get(`${xCoord}|${yCoord}`);
            if (!die) return;

            const gridLeft = xCoord * gridWidth + gridOffset.x;
            const gridTop = -yCoord * gridHeight + gridOffset.y;
            const gridColor = 'bin' in die ? getColorByBin(die.bin) : 0x8cefa1;

            const material = new THREE.MeshBasicMaterial({ color: gridColor, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(gridWidth, gridHeight), material);
            mesh.position.set(gridLeft + gridWidth / 2, gridTop + gridHeight / 2, -0.1);
            mesh.renderOrder = 0;
            scene.add(mesh);

            const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(gridWidth, gridHeight));
            const border = new THREE.LineSegments(edges, borderMaterial);
            border.position.copy(mesh.position);
            border.renderOrder = 1;
            scene.add(border);
        });

        defects.forEach(defect => {
            const defectWidth = Math.max(defect.w / 300, 0.5);
            const defectHeight = Math.max(defect.h / 300, 0.5);
            const geometry = new THREE.PlaneGeometry(defectWidth, defectHeight);
            const color = colorMap.get(defect.class) || 0xff00ff;

            const material = new THREE.MeshBasicMaterial({
                color, side: THREE.DoubleSide, transparent: true, opacity: 0.8
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(defect.x, defect.y, 0.1);
            mesh.renderOrder = 2;
            scene.add(mesh);
        });

        const fitCameraToData = () => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

            mapCoordinates.forEach(([xCoord, yCoord]) => {
                const x = xCoord * gridWidth + gridOffset.x;
                const y = -yCoord * gridHeight + gridOffset.y;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + gridWidth);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y + gridHeight);
            });

            defects.forEach(defect => {
                const defectLeft = defect.x - (defect.w / 300) / 2;
                const defectRight = defect.x + (defect.w / 300) / 2;
                const defectTop = defect.y - (defect.h / 300) / 2;
                const defectBottom = defect.y + (defect.h / 300) / 2;

                minX = Math.min(minX, defectLeft);
                maxX = Math.max(maxX, defectRight);
                minY = Math.min(minY, defectTop);
                maxY = Math.max(maxY, defectBottom);
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

        const infoLines = header ? [
            `产品名称: ${(header['Product'] || header['Device Name']) + '_' + (header['Lot No.'] || '') + '_' + (header['Wafer ID'] || '')}       Wafer厚度:0.000`,
            `晶圆尺寸: ${header['Wafer Size'] || 0}       布距: [${header['Index X'] || 0}.000, ${header['Index Y'] || 0}.000]       切角: ${header['??'] || 'Unknown'}[${header['Flat/Notch'] || 'Unknown'}]`,
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

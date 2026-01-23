import { AsciiDie, isNumberBin, isSpecialBin } from '@/types/ipc';

export type GridSize = { width: number; height: number };
export type GridOffset = { x: number; y: number };
export type DefectRect = { x: number; y: number; w: number; h: number };

export const computeDieRect = (
    die: { x: number; y: number },
    gridSize: GridSize,
    gridOffset: GridOffset
) => {
    const left = die.x * gridSize.width + gridOffset.x;
    const right = left + gridSize.width;
    const top = -die.y * gridSize.height + gridOffset.y;
    const bottom = top + gridSize.height;
    return { left, right, top, bottom };
};

// Normalize defect sizes: incoming defect dims are in micrometers; convert to millimeters
export const normalizeDefect = (
    defect: DefectRect,
    sizeOffsetUm: { x: number; y: number } = { x: 0, y: 0 }
): DefectRect => {
    const clamp = (v: number) => Math.max(0, v);
    const wMm = clamp(defect.w + sizeOffsetUm.x) / 1000;
    const hMm = clamp(defect.h + sizeOffsetUm.y) / 1000;
    return { x: defect.x, y: defect.y, w: wMm, h: hMm };
};

export const rectsOverlap = (
    gridRect: { left: number; right: number; top: number; bottom: number },
    defectRect: { left: number; right: number; top: number; bottom: number },
    eps: number = 1e-6
) => {
    return !(
        gridRect.right <= defectRect.left + eps ||
        gridRect.left >= defectRect.right - eps ||
        gridRect.bottom <= defectRect.top + eps ||
        gridRect.top >= defectRect.bottom - eps
    );
};

export const generateGridWithSubstrateDefects = (
    baseDies: AsciiDie[] | undefined,
    defects: DefectRect[],
    gridSize: GridSize,
    gridOffset: GridOffset = { x: 0, y: 0 },
    defectSizeOffsetX: number = 0,
    defectSizeOffsetY: number = 0,
    baseLayout?: AsciiDie[],
): AsciiDie[] => {
    const seeds = (baseLayout && baseLayout.length > 0) ? baseLayout : baseDies;

    if (!seeds || seeds.length === 0) {
        return [];
    }
    const EPS = 1e-6; // avoid marking dies when rectangles only touch edges

    const defectiveGrids = new Set<string>();
    console.log('substrate:', gridOffset);
    seeds.forEach(baseDie => {
        const { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom } =
            computeDieRect(baseDie, gridSize, gridOffset);
        const gridRect = { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom };

        const hasOverlap = defects.some(defect => {
            const norm = normalizeDefect(defect, { x: defectSizeOffsetX, y: defectSizeOffsetY });
            const defectRect = {
                left: norm.x,
                right: norm.x + norm.w,
                top: norm.y,
                bottom: norm.y + norm.h,
            };
            return rectsOverlap(gridRect, defectRect, EPS);
        });

        if (hasOverlap) {
            defectiveGrids.add(`${baseDie.x},${baseDie.y}`);
        }
    });

    const substrateDies: AsciiDie[] = seeds.map(baseDie => {
        const gridKey = `${baseDie.x},${baseDie.y}`;
        const isDefective = defectiveGrids.has(gridKey);

        const shouldPreserveOriginalBin =
            (isSpecialBin(baseDie.bin) && ['S', '*'].includes(baseDie.bin.special)) ||
            (isNumberBin(baseDie.bin) && baseDie.bin.number === 257);

        const targetBin = isDefective && !shouldPreserveOriginalBin ? { special: 'D' } : baseDie.bin;

        return {
            ...baseDie,
            bin: targetBin
        };
    });
    return substrateDies;
};
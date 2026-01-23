import { AsciiDie, isNumberBin, isSpecialBin } from '@/types/ipc';

export type GridSize = { width: number; height: number };
export type GridOffset = { x: number; y: number };

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

export const generateGridWithSubstrateDefects = (
    baseDies: AsciiDie[] | undefined,
    defects: Array<{ x: number; y: number; w: number; h: number }>,
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
    const clampDefectSize = (val: number) => Math.max(0, val);
    const EPS = 1e-6; // avoid marking dies when rectangles only touch edges

    const defectiveGrids = new Set<string>();
    console.log('substrate:', gridOffset);
    seeds.forEach(baseDie => {
        const { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom } =
            computeDieRect(baseDie, gridSize, gridOffset);

        const hasOverlap = defects.some(defect => {
            // Assume defect dimensions are already in the same unit as gridSize (e.g., mm)
            const adjW = clampDefectSize(defect.w + defectSizeOffsetX);
            const adjH = clampDefectSize(defect.h + defectSizeOffsetY);
            // Defect coordinates are bottom-left anchored
            const defectLeft = defect.x;
            const defectRight = defect.x + adjW;
            const defectTop = defect.y;
            const defectBottom = defect.y + adjH;

            // Use half-open style with epsilon so "touching edge" is not counted as overlap
            return !(
                gridRight <= defectLeft + EPS ||
                gridLeft >= defectRight - EPS ||
                gridBottom <= defectTop + EPS ||
                gridTop >= defectBottom - EPS
            );
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

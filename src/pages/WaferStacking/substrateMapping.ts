import { AsciiDie, isNumberBin, isSpecialBin } from '@/types/ipc';

export const generateGridWithSubstrateDefects = (
    baseDies: AsciiDie[] | undefined,
    defects: Array<{ x: number; y: number; w: number; h: number }>,
    offsetX: number = 0,
    offsetY: number = 0,
    defectSizeOffsetX: number = 0,
    defectSizeOffsetY: number = 0,
    baseLayout?: AsciiDie[],
): AsciiDie[] => {
    const GRID_WIDTH = 4.134;
    const GRID_HEIGHT = 3.74;

    const seeds = (baseLayout && baseLayout.length > 0) ? baseLayout : baseDies;

    if (!seeds || seeds.length === 0) {
        return [];
    }
    const clampDefectSize = (val: number) => Math.max(0, val);

    const defectiveGrids = new Set<string>();
    console.log('substrate:', { offsetX, offsetY });
    seeds.forEach(baseDie => {
        const gridLeft = baseDie.x * GRID_WIDTH + offsetX;
        const gridRight = gridLeft + GRID_WIDTH;
        const gridTop = -baseDie.y * GRID_HEIGHT + offsetY;
        const gridBottom = gridTop + GRID_HEIGHT;

        const hasOverlap = defects.some(defect => {
            let adjW = clampDefectSize(defect.w + defectSizeOffsetX) / 300;
            adjW = adjW * 1000;
            let adjH = clampDefectSize(defect.h + defectSizeOffsetY) / 300;
            adjH = adjH * 1000;
            const defectLeft = defect.x - adjW / 2;
            const defectRight = defect.x + adjW / 2;
            const defectTop = defect.y - adjH / 2;
            const defectBottom = defect.y + adjH / 2;

            return !(
                gridRight < defectLeft ||
                gridLeft > defectRight ||
                gridBottom < defectTop ||
                gridTop > defectBottom
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
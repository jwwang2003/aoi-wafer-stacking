import { AsciiDie, isNumberBin, isSpecialBin } from '@/types/ipc';

/**
 * 传入的baseDies Y轴需取反后再与原始缺陷坐标叠加
 * @param baseDies 基础图层的芯片数据
 * @param defects 基板缺陷数据
 */
export const generateGridWithSubstrateDefects = (
    baseDies: AsciiDie[] | undefined,
    defects: Array<{ x: number; y: number; w: number; h: number }>,
    offsetX: number = 0,
    offsetY: number = 0
): AsciiDie[] => {
    const GRID_WIDTH = 4.134;
    const GRID_HEIGHT = 3.74;

    if (!baseDies || baseDies.length === 0) {
        return [];
    }

    const defectiveGrids = new Set<string>();

    defects.forEach(defect => {

        const adjustedDefectX = defect.x - offsetX;
        const adjustedDefectY = defect.y - offsetY;

        const defectLeft = adjustedDefectX - defect.w / 2;
        const defectRight = adjustedDefectX + defect.w / 2;
        const defectBottom = adjustedDefectY - defect.h / 2;
        const defectTop = adjustedDefectY + defect.h / 2;

        const startGridX = Math.floor(defectLeft / GRID_WIDTH);
        const endGridX = Math.ceil(defectRight / GRID_WIDTH);
        const startGridY = Math.floor(defectBottom / GRID_HEIGHT);
        const endGridY = Math.ceil(defectTop / GRID_HEIGHT);

        for (let gridX = startGridX; gridX <= endGridX; gridX++) {
            for (let gridY = startGridY; gridY <= endGridY; gridY++) {
                const gridLeft = gridX * GRID_WIDTH;
                const gridRight = (gridX + 1) * GRID_WIDTH;
                const gridBottom = gridY * GRID_HEIGHT;
                const gridTop = (gridY + 1) * GRID_HEIGHT;

                const isOverlap = !(
                    defectRight < gridLeft ||
                    defectLeft > gridRight ||
                    defectTop < gridBottom ||
                    defectBottom > gridTop
                );

                if (isOverlap) {
                    defectiveGrids.add(`${gridX},${gridY}`);
                }
            }
        }
    });

    const substrateDies: AsciiDie[] = baseDies.map(baseDie => {
        const gridKey = `${baseDie.x},${-baseDie.y}`;
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

import {
    MapData,
    BinMapData,
    HexMapData,
    AsciiDie,
    WaferMapDie,
    BinCountEntry,
    HexMap,
    Wafer,
    isSpecialBin,
    isNumberBin,
} from '@/types/ipc';
import { Statistics } from './types';
import { PRIORITY_RULES, LayerMeta } from './priority';


export const getLayerPriority = (meta: LayerMeta): number => {
    const matchedRule = PRIORITY_RULES.find((rule) => rule.when(meta));
    return matchedRule ? matchedRule.score : 0;
};
/**
 * 提取对齐标记
 */
export const extractAlignmentMarkers = (
    dies: AsciiDie[]
): { x: number; y: number }[] => {
    return dies
        .filter(
            (die) => isSpecialBin(die.bin) && ['S', '*'].includes(die.bin.special)
        )
        .map((die) => ({ x: die.x, y: die.y }));
};


export const calculateOffset = (
    baseMarkers: { x: number; y: number }[],
    targetMarkers: { x: number; y: number }[]
): { dx: number; dy: number } => {
    const baseReference = baseMarkers.length > 0 ? baseMarkers[0] : null;
    const targetReference = targetMarkers.length > 0 ? targetMarkers[0] : null;

    if (!baseReference || !targetReference) return { dx: 0, dy: 0 };

    const dx = baseReference.x - targetReference.x;
    const dy = baseReference.y - targetReference.y;

    if (baseMarkers.length >= 2 && targetMarkers.length >= 2) {
        const dx2 = baseMarkers[1].x - targetMarkers[1].x;
        const dy2 = baseMarkers[1].y - targetMarkers[1].y;
        return {
            dx: Math.round((dx + dx2) / 2),
            dy: Math.round((dy + dy2) / 2),
        };
    }
    return { dx, dy };
};


export const createEmptyAsciiMap = (
    allAlignedDies: AsciiDie[][]
): { map: string[][]; minX: number; minY: number } => {
    const allX = allAlignedDies.flatMap((dies) => dies.map((die) => die.x));
    const allY = allAlignedDies.flatMap((dies) => dies.map((die) => die.y));
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const map = Array.from({ length: maxY - minY + 1 }, () =>
        Array(maxX - minX + 1).fill('.')
    );
    return { map, minX, minY };
};

export const fillLayerToAsciiMap = (
    map: string[][],
    dies: AsciiDie[],
    layerPriority: number,
    minX: number,
    minY: number,
    existingPriorities: number[][]
) => {
    dies.forEach((die) => {
        if (isSpecialBin(die.bin) && ['.', 'S', '*'].includes(die.bin.special)) {
            return;
        }
        const rowIdx = die.y - minY;
        const colIdx = die.x - minX;
        if (
            rowIdx < 0 ||
            rowIdx >= map.length ||
            colIdx < 0 ||
            colIdx >= map[rowIdx].length
        ) {
            return;
        }
        const currentPriority = existingPriorities[rowIdx][colIdx];
        let shouldOverwrite = false;
        if (layerPriority > currentPriority) {
            shouldOverwrite = true;
        } else if (layerPriority < currentPriority) {
            const existingChar = map[rowIdx][colIdx];
            shouldOverwrite = existingChar === '1';
        }
        if (shouldOverwrite) {
            if (isNumberBin(die.bin)) {
                map[rowIdx][colIdx] = die.bin.number.toString();
            } else if (isSpecialBin(die.bin)) {
                map[rowIdx][colIdx] = die.bin.special;
            }
            existingPriorities[rowIdx][colIdx] = layerPriority;
        }
    });
};

/**
 * 删除ASCII Map中的空行/空列
 */
export const removeEmptyRowsAndCols = (map: string[][]): string[][] => {
    const filteredMap = map.filter((row) => !row.every((char) => char === '.'));
    if (filteredMap.length === 0) return [];
    const colCount = filteredMap[0].length;
    const transposed = Array.from({ length: colCount }, (_, col) =>
        filteredMap.map((row) => row[col])
    );
    const filteredTransposed = transposed.filter(
        (col) => !col.every((char) => char === '.')
    );
    if (filteredTransposed.length === 0) return [];
    return Array.from({ length: filteredMap.length }, (_, row) =>
        filteredTransposed.map((col) => col[row])
    );
};


/**
 * 从ASCII Map反推合并后的Die数据
 */
export const mapToMergedDies = (
    map: string[][],
    minX: number,
    minY: number
): AsciiDie[] => {
    const mergedDies: AsciiDie[] = [];
    map.forEach((row, rowIdx) => {
        row.forEach((char, colIdx) => {
            if (char === '.') return;
            const x = colIdx + minX;
            const y = rowIdx + minY;
            const bin = /^\d+$/.test(char)
                ? { number: parseInt(char, 10) }
                : { special: char };
            mergedDies.push({ x, y, bin });
        });
    });
    return mergedDies;
};


/**
 * 对ASCII Map的XY坐标整体偏移（并同步更新Die数据）
 */
export const applyOffsetToAsciiMap = (
    mergedDies: AsciiDie[],
    dx: number,
    dy: number
): {
    offsetMap: string[][];
    offsetDies: AsciiDie[];
    newMinX: number;
    newMinY: number;
} => {
    const offsetDies = mergedDies.map((die) => ({
        ...die,
        x: die.x + dx,
        y: die.y + dy,
    }));
    const xs = offsetDies.map((die) => die.x);
    const ys = offsetDies.map((die) => die.y);
    const newMinX = Math.min(...xs);
    const newMaxX = Math.max(...xs);
    const newMinY = Math.min(...ys);
    const newMaxY = Math.max(...ys);
    const offsetMap = Array.from({ length: newMaxY - newMinY + 1 }, () =>
        Array(newMaxX - newMinX + 1).fill('.')
    );
    offsetDies.forEach((die) => {
        const rowIdx = die.y - newMinY;
        const colIdx = die.x - newMinX;
        if (
            rowIdx >= 0 &&
            rowIdx < offsetMap.length &&
            colIdx >= 0 &&
            colIdx < offsetMap[rowIdx].length
        ) {
            offsetMap[rowIdx][colIdx] = isNumberBin(die.bin)
                ? die.bin.number.toString()
                : (die.bin as { special: string }).special;
        }
    });
    return { offsetMap, offsetDies, newMinX, newMinY };
};


export const calculateStats = (mapData: string[]): Statistics => {
    let totalTested = 0;
    let totalPass = 0;

    for (const row of mapData) {
        for (const char of row) {
            if (char !== '.' && char !== 'S' && char !== '*') {
                totalTested++;
                if (
                    char === '1' ||
                    char === 'G' ||
                    char === 'H' ||
                    char === 'I' ||
                    char === 'J'
                ) {
                    totalPass++;
                }
            }
        }
    }

    const totalFail = totalTested - totalPass;
    const yieldPercentage = totalTested > 0 ? (totalPass / totalTested) * 100 : 0;

    return {
        totalTested: totalTested || 0,
        totalPass: totalPass || 0,
        totalFail: totalFail || 0,
        yieldPercentage: yieldPercentage || 0,
    };
};


/**
 * 提取Wafer头部信息
 */
export const extractWaferHeader = (wafer: Wafer): Record<string, string> => ({
    Operator: wafer.operator,
    'Device Name': wafer.device,
    'Lot No.': wafer.lotId,
    'Wafer ID': wafer.waferId,
    'Measurement Time': wafer.measTime,
    'Gross Die': wafer.grossDie.toString(),
    'Pass Die': wafer.passDie.toString(),
    'Fail Die': wafer.failDie.toString(),
    Yield: wafer.totalYield.toString(),
    Notch: wafer.notch,
});

/**
 * 提取MapData头部信息
 */
export const extractMapDataHeader = (mapData: MapData): Record<string, string> => ({
    'Device Name': mapData.deviceName || 'Unknown',
    'Lot No.': mapData.lotNo || 'Unknown',
    'Wafer ID': mapData.waferId || 'Unknown',
    'Wafer Size': mapData.waferSize || 'Unknown',
    'Dice SizeX': mapData.diceSizeX ? mapData.diceSizeX.toString() : '0',
    'Dice SizeY': mapData.diceSizeY ? mapData.diceSizeY.toString() : '0',
    'Flat/Notch': mapData.flatNotch || 'Unknown',
    'Total Tested': mapData.totalTested ? mapData.totalTested.toString() : '0',
    'Total Pass': mapData.totalPass ? mapData.totalPass.toString() : '0',
    'Total Fail': mapData.totalFail ? mapData.totalFail.toString() : '0',
    Yield: mapData.yieldPercent ? mapData.yieldPercent.toString() : '0',
});

/**
 * 转换为MapData格式
 */
export const convertToMapData = (
    mapData: string[],
    stats: Statistics,
    header: Record<string, string>
): MapData => ({
    deviceName: header?.['Device Name'] || 'Unknown',
    lotNo: header?.['Lot No.'] || 'Unknown',
    waferId: header?.['Wafer ID'] || 'Unknown',
    waferSize: header?.['Wafer Size'] || '6',
    diceSizeX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
    diceSizeY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
    flatNotch: header?.['Flat/Notch'] || 'Unknown',
    mapColumns: mapData[0]?.length || 0,
    mapRows: mapData.length || 0,
    totalTested: stats.totalTested || 0,
    totalPass: stats.totalPass || 0,
    totalFail: stats.totalFail || 0,
    yieldPercent: stats.yieldPercentage || 0,
    map: {
        raw: mapData,
        dies: mapData.flatMap((row, y) =>
            row.split('').map((char, x) => ({
                x: Number.isFinite(x) ? x : 0,
                y: Number.isFinite(y) ? y : 0,
                bin:
                    char === '.'
                        ? { special: '.' }
                        : {
                            number: Number.isFinite(parseInt(char, 10))
                                ? parseInt(char, 10)
                                : 0,
                        },
            }))
        ),
    },
});

/**
 * 生成BinMap数据
 */
export const convertToBinMapData = (
    offsetDies: AsciiDie[],
    header?: Record<string, string>
): BinMapData => {
    const map: WaferMapDie[] = offsetDies
        .filter((die) => isNumberBin(die.bin))
        .map((die) => ({
            x: die.x - 1,
            y: die.y,
            bin: die.bin,
            reserved: 0,
        }));
    const binCounts: Record<number, number> = {};
    map.forEach((die) => {
        if (isNumberBin(die.bin)) {
            const binNum = die.bin.number;
            binCounts[binNum] = (binCounts[binNum] || 0) + 1;
        }
    });

    const bins: BinCountEntry[] = Object.entries(binCounts)
        .map(([bin, count]) => ({ bin: parseInt(bin, 10), count }))
        .sort((a, b) => a.bin - b.bin);

    return {
        waferType: header?.['WaferType'] ? parseInt(header['WaferType']) : 0,
        dut: header?.['DUT'] ? parseInt(header['DUT']) : 0,
        mode: header?.['Mode'] ? parseInt(header['Mode']) : 0,
        product: header?.['Device Name'] || 'Unknown',
        waferLots: header?.['Lot No.'] || 'Unknown',
        waferNo: header?.['Wafer ID'] || 'Unknown',
        waferSize: header?.['Wafer Size'] ? parseFloat(header['Wafer Size']) : 0,
        indexX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
        indexY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
        map: map,
        bins: bins,
    };
};

/**
 * 转换为HexMapData类型
 */
export const convertToHexMapData = (
    mapData: string[],
    header?: Record<string, string>
): HexMapData => {
    const validMapData =
        mapData.length === 0 || mapData.every((row) => row.length === 0)
            ? ['0']
            : mapData;

    const letterToNumber = {
        A: 10,
        B: 11,
        C: 12,
        D: 13,
        E: 14,
        F: 15,
        G: 16,
        H: 17,
        I: 18,
        J: 19,
    };
    const grid: HexMap['grid'] = validMapData.map((row) =>
        row.split('').map((char) => {
            if (char === '.') return null;
            if (char.match(/[a-zA-Z]/)) {
                const upperChar = char.toUpperCase();
                return letterToNumber[upperChar as keyof typeof letterToNumber] || 99;
            }
            if (char.match(/\d/)) return parseInt(char, 10);
            return null;
        })
    );

    const dies = validMapData
        .flatMap((row, y) =>
            row.split('').map((char, x) => ({
                x: Number.isFinite(x) ? x : 0,
                y: Number.isFinite(y) ? y : 0,
                bin:
                    char === '.'
                        ? { special: '.' }
                        : {
                            number: Number.isFinite(parseInt(char, 10))
                                ? parseInt(char, 10)
                                : 0,
                        },
            }))
        )
        .filter((die) => isNumberBin(die.bin));

    return {
        header: {
            device: header?.['Device Name'] || 'Unknown',
            lot: header?.['Lot No.'] || 'Unknown',
            wafer: header?.['Wafer ID'] || 'Unknown',
            rowCt: validMapData.length > 0 ? validMapData.length : 1,
            colCt: validMapData[0]?.length > 0 ? validMapData[0].length : 1,
            refpx: 1,
            refpy: 28,
            dutMs: 'MM',
            xDies: !isNaN(parseFloat(header?.['Dice SizeX'] || '0'))
                ? parseFloat(header?.['Dice SizeX'] || '0') / 1000
                : 0,
            yDies: !isNaN(parseFloat(header?.['Dice SizeY'] || '0'))
                ? parseFloat(header?.['Dice SizeY'] || '0') / 1000
                : 0,
        },
        map: { raw: validMapData, grid, dies },
    };
};
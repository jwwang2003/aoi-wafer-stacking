import { Statistics } from './types';
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
    isNumberBin
} from '@/types/ipc';

const LAYER_PRIORITIES = {
    CP2: 5,
    WLBI: 4,
    CP1: 3,
    CP3: 2,
    AOI: 1,
};

export const getLayerPriority = (layerName: string): number => {
    return LAYER_PRIORITIES[layerName as keyof typeof LAYER_PRIORITIES];
};

export const extractAlignmentMarkers = (dies: AsciiDie[]): { x: number; y: number }[] => {
    return dies.filter((die) => isSpecialBin(die.bin)).map((die) => ({ x: die.x, y: die.y }));
};

export const calculateOffset = (
    baseMarkers: { x: number; y: number }[],
    targetMarkers: { x: number; y: number }[]
): { dx: number; dy: number } => {
    if (baseMarkers.length === 0 || targetMarkers.length === 0) return { dx: 0, dy: 0 };

    const sortedBase = [...baseMarkers].sort((a, b) => a.x - b.x);
    const sortedTarget = [...targetMarkers].sort((a, b) => a.x - b.x);
    const hasTwoPoints = sortedBase.length >= 2 && sortedTarget.length >= 2;

    const dx1 = sortedBase[0].x - sortedTarget[0].x;
    const dy1 = sortedBase[0].y - sortedTarget[0].y;

    return hasTwoPoints
        ? {
            dx: Math.round((dx1 + (sortedBase[1].x - sortedTarget[1].x)) / 2),
            dy: Math.round((dy1 + (sortedBase[1].y - sortedTarget[1].y)) / 2),
        }
        : { dx: dx1, dy: dy1 };
};

export const applyOffsetToDies = (dies: AsciiDie[], dx: number, dy: number): AsciiDie[] => {
    return dies.map((die) => ({ ...die, x: die.x + dx, y: die.y + dy }));
};

export const convertDiesToMap = (dies: AsciiDie[]): string[] => {
    if (dies.length === 0) return [];

    const xs = dies.map((die) => die.x);
    const ys = dies.map((die) => die.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rows: string[][] = Array.from({ length: maxY - minY + 1 }, () =>
        Array(maxX - minX + 1).fill('.')
    );

    dies.forEach((die) => {
        const rowIdx = die.y - minY;
        const colIdx = die.x - minX;

        if (rowIdx < 0 || rowIdx >= rows.length || colIdx < 0 || colIdx >= rows[rowIdx].length) return;

        if (isNumberBin(die.bin)) {
            rows[rowIdx][colIdx] = die.bin.number.toString();
        } else if (isSpecialBin(die.bin) && !['.', 'S', '*'].includes(die.bin.special)) {
            rows[rowIdx][colIdx] = die.bin.special;
        }
    });

    return rows.map((row) => row.join(''));
};

export const mergeDiesWithPriority = (allDies: AsciiDie[][], layerNames: string[]): AsciiDie[] => {
    const dieMap = new Map<string, { die: AsciiDie; priority: number }>();

    allDies.forEach((dies, index) => {
        const layerName = layerNames[index];
        const currentPriority = getLayerPriority(layerName);

        dies.forEach((die) => {
            const isSkipSpecial = isSpecialBin(die.bin) && ['.', 'S', '*'].includes(die.bin.special);
            if (isSkipSpecial) return;

            const key = `${die.x},${die.y}`;
            const existing = dieMap.get(key);

            if (!existing) {
                dieMap.set(key, { die, priority: currentPriority });
                return;
            }      const existingPriority = existing.priority;


            if (currentPriority > existing.priority) {
                dieMap.set(key, { die, priority: currentPriority });
            } else if (currentPriority < existingPriority) {
                const isExistingBin1 = isNumberBin(existing.die.bin) && existing.die.bin.number === 1;
                if (isExistingBin1) dieMap.set(key, { die, priority: currentPriority });
            }
        });
    });

    return Array.from(dieMap.values()).map((item) => item.die);
};

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
                x,
                y,
                bin: char === '.' ? { special: '.' } : { number: parseInt(char, 10) },
            }))
        ),
    },
});

export const convertToBinMapData = (
    mergedDies: AsciiDie[],
    header?: Record<string, string>
): BinMapData => {
    const map: WaferMapDie[] = mergedDies
        .filter((die) => isNumberBin(die.bin))
        .map((die) => ({ x: die.x - 1, y: die.y, bin: die.bin, reserved: 0 }));

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
        mode: header?.['Mode'] ? parseInt(header['DUT']) : 0,
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
                x,
                y,
                bin: char === '.' ? { special: '.' } : { number: parseInt(char, 10) },
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
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
    BinValue,
    SilanMapData,
} from '@/types/ipc';
import { PRIORITY_RULES, LayerMeta, PASS_VALUES } from '@/pages/WaferStacking/priority';

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
export interface Statistics {
    totalTested: number;
    totalPass: number;
    totalFail: number;
    yieldPercentage: number;
}

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


export const createDieMapStructure = (
    allAlignedDies: AsciiDie[][]
): { dieMap: Map<string, { die: AsciiDie; priority: number }>; bounds: { minX: number; maxX: number; minY: number; maxY: number } } => {
    const allX = allAlignedDies.flatMap(dies => dies.map(die => die.x));
    const allY = allAlignedDies.flatMap(dies => dies.map(die => die.y));
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    return {
        dieMap: new Map(),
        bounds: { minX, maxX, minY, maxY }
    };
};

export const mergeLayerToDieMap = (
    dieMap: Map<string, { die: AsciiDie; priority: number }>,
    dies: AsciiDie[],
    layerPriority: number
) => {
    dies.forEach(die => {
        const isImportantMarker = isSpecialBin(die.bin) && ['S', '*'].includes(die.bin.special);
        const key = `${die.x},${die.y}`;
        const existing = dieMap.get(key);
        if (isImportantMarker) {
            if (!existing || layerPriority >= existing.priority) {
                dieMap.set(key, { die: { ...die }, priority: layerPriority });
            }
            return;
        }
        if (isSpecialBin(die.bin) && die.bin.special === '.') {
            return;
        }
        if (existing) {
            const existingBin = existing.die.bin;
            if (
                (isSpecialBin(existingBin) && ['S', '*'].includes(existingBin.special)) ||
                (isNumberBin(existingBin) && existingBin.number === 257)
            ) {
                return;
            }
        }

        let shouldOverwrite = false;
        if (!existing) {
            shouldOverwrite = true;
        } else if (layerPriority > existing.priority) {
            shouldOverwrite = true;
        } else if (layerPriority < existing.priority) {
            const existingValue = 'number' in existing.die.bin
                ? existing.die.bin.number.toString()
                : existing.die.bin.special;
            shouldOverwrite = existingValue === '1';
        }

        if (shouldOverwrite) {
            dieMap.set(key, { die: { ...die }, priority: layerPriority });
        }
    });
};

export const pruneEmptyRegions = (
    dieMap: Map<string, { die: AsciiDie; priority: number }>
): AsciiDie[] => {
    if (dieMap.size === 0) return [];
    const dies = Array.from(dieMap.values()).map(item => item.die);
    const xs = dies.map(die => die.x);
    const ys = dies.map(die => die.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return dies.filter(die =>
        die.x >= minX && die.x <= maxX && die.y >= minY && die.y <= maxY
    );
};

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

export const applyOffsetToDies = (
    dies: AsciiDie[],
    dx: number,
    dy: number
): AsciiDie[] => {
    return dies.map(die => ({
        ...die,
        x: die.x + dx,
        y: die.y + dy
    }));
};

export const calculateStatsFromDies = (
    dies: AsciiDie[],
    passValues: Set<string> = PASS_VALUES
): Statistics => {
    let totalTested = 0;
    let totalPass = 0;

    dies.forEach(die => {
        if (isSpecialBin(die.bin)) {
            if (['S', '*', '.'].includes(die.bin.special)) return;
        }
        totalTested++;

        const binValue = isNumberBin(die.bin)
            ? die.bin.number.toString()
            : die.bin.special;

        if (passValues.has(binValue)) {
            totalPass++;
        }
    });

    return {
        totalTested,
        totalPass,
        totalFail: totalTested - totalPass,
        yieldPercentage: totalTested > 0 ? (totalPass / totalTested) * 100 : 0
    };
};

/**
 * 提取WLBI头部信息
 */
export const extractBinMapHeader = (binData: BinMapData): Record<string, string> => ({
    'WaferType': binData.waferType.toString(),
    'DUT': binData.dut.toString(),
    'Mode': binData.mode.toString(),
    'Product': binData.product || 'Unknown',
    'Wafer Lots': binData.waferLots || 'Unknown',
    'Wafer No': binData.waferNo || 'Unknown',
    'Wafer Size': binData.waferSize.toString(),
    'Index X': binData.indexX.toString(),
    'Index Y': binData.indexY.toString(),
})

/**
 * 提取Wafer头部信息
 */
export const extractWaferHeader = (wafer: Wafer): Record<string, string> => ({
    Operator: wafer.operator,
    'Device_fab': wafer.device,
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
    dies: AsciiDie[],
    stats: Statistics,
    header: Record<string, string>
): MapData => {
    const xs = dies.map(d => d.x), ys = dies.map(d => d.y);
    const [minX, maxX] = xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
    const [minY, maxY] = ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 0];
    const [mapColumns, mapRows] = [maxX - minX + 1, maxY - minY + 1];
    const rawMap = Array.from({ length: mapRows }, () => Array(mapColumns).fill('.'));
    dies.forEach(die => {
        const [row, col] = [die.y - minY, die.x - minX];
        if (row >= 0 && row < mapRows && col >= 0 && col < mapColumns) {
            rawMap[row][col] = isNumberBin(die.bin) ? die.bin.number.toString() : die.bin.special;
        }
    });

    return {
        deviceName: header?.['Device Name'] || 'Unknown',
        lotNo: header?.['Lot No.'] || 'Unknown',
        waferId: header?.['Wafer ID'] || 'Unknown',
        waferSize: header?.['Wafer Size'] || '6',
        diceSizeX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
        diceSizeY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
        flatNotch: header?.['Flat/Notch'] || 'Unknown',
        mapColumns,
        mapRows,
        totalTested: stats.totalTested,
        totalPass: stats.totalPass,
        totalFail: stats.totalFail,
        yieldPercent: stats.yieldPercentage,
        map: { raw: rawMap.map(r => r.join('')), dies }
    };
};
/**
 * 生成BinMap数据
 */
export const convertToBinMapData = (
    offsetDies: AsciiDie[],
    header?: Record<string, string>
): BinMapData => {
    const map: WaferMapDie[] = offsetDies
        .map((die) => {
            const isStartMarker =
                (isSpecialBin(die.bin) && ['S', '*'].includes(die.bin.special)) ||
                (isNumberBin(die.bin) && die.bin.number === 257);
            const bin: BinValue = isStartMarker
                ? { number: 257 }
                : die.bin;
            return {
                x: die.x,
                y: die.y,
                bin: bin,
                reserved: 0,
            };
        });
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
        product: header?.['Product'] || header?.['Device Name'] || 'Unknown',
        waferLots: header?.['Wafer Lots'] || header?.['Lot No.'] || 'Unknown',
        waferNo: header?.['Wafer No'] || header?.['Wafer ID'] || 'Unknown',
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
    dies: AsciiDie[],
    header?: Record<string, string>
): HexMapData => {
    // Build quick lookup to avoid O(n^2) `.find` inside nested loops
    const xs = dies.map(die => die.x);
    const ys = dies.map(die => die.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const byCoord = new Map<string, AsciiDie>();
    for (const d of dies) byCoord.set(`${d.x},${d.y}`, d);

    const grid: HexMap['grid'] = Array.from({ length: maxY - minY + 1 }, (_, yIdx) =>
        Array.from({ length: maxX - minX + 1 }, (_, xIdx) => {
            const x = minX + xIdx;
            const y = minY + yIdx;
            const die = byCoord.get(`${x},${y}`);

            if (!die) return null;
            const isIgnoredStartMarker = (bin: AsciiDie['bin']): boolean => {
                if (isSpecialBin(bin)) {
                    return ['S', '*'].includes(bin.special);
                } else if (isNumberBin(bin)) {
                    return bin.number === 257;
                }
                return false;
            };
            if (isIgnoredStartMarker(die.bin)) {
                return null;
            }

            if (isSpecialBin(die.bin)) {
                const letterToNumber = {
                    A: 10, B: 11, C: 12, D: 13, E: 14, F: 15,
                    G: 16, H: 17, I: 18, J: 19
                };
                return letterToNumber[die.bin.special as keyof typeof letterToNumber] || 99;
            }
            return isNumberBin(die.bin) ? die.bin.number : null;
        })
    );

    return {
        header: {
            device: header?.['Device Name'] || 'Unknown',
            lot: header?.['Lot No.'] || 'Unknown',
            wafer: header?.['Wafer ID'] || 'Unknown',
            rowCt: maxY - minY + 1,
            colCt: maxX - minX + 1,
            refpx: 0, //未知
            refpy: 0, //未知
            dutMs: 'MM',
            xDies: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) / 1000 : 0,
            yDies: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) / 1000 : 0,
        },
        map: {
            raw: [],
            grid,
            dies: dies.filter(die => isNumberBin(die.bin))
        }
    };
};

export const convertToFabWafer = (
    dies: AsciiDie[],
    stats: Statistics,
    header: Record<string, string>
): Wafer => {
    const xs = dies.map(d => d.x);
    const ys = dies.map(d => d.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;

    const rawMap = Array.from({ length: rows }, () => Array(cols).fill('.'));
    dies.forEach(d => {
        const r = d.y - minY;
        const c = d.x - minX;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
            rawMap[r][c] = isNumberBin(d.bin) ? d.bin.number.toString() : d.bin.special;
        }
    });

    return {
        operator: header['Operator'] || '',
        device: header['Device_fab'] || '',
        lotId: header['Lot No.'] || '',
        waferId: header['Lot No.'] && header['Wafer ID']
            ? `${header['Lot No.']}-${header['Wafer ID']}`
            : header['Wafer ID'] || '',
        measTime: header['Measurement Time'] || new Date().toISOString(),
        grossDie: stats.totalTested,
        passDie: stats.totalPass,
        failDie: stats.totalFail,
        totalYield: stats.yieldPercentage,
        notch: header['Notch'] || header['Flat/Notch'] || 'UNKNOWN',
        map: { raw: rawMap.map(r => r.join('')), dies }
    };
};

export const convertToSilanMapData = (
    dies: AsciiDie[],
    stats: Statistics,
    header: Record<string, string>
): SilanMapData => {
    const xs = dies.map(d => d.x);
    const ys = dies.map(d => d.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const nn = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${yyyy}/${mm}/${dd}_${hh}:${nn}`;

    const binCount = new Map<string, number>();
    dies.forEach(d => {
        let key = '1';
        if (isNumberBin(d.bin)) {
            key = d.bin.number.toString();
        } else {
            key = '2';
        }
        binCount.set(key, (binCount.get(key) || 0) + 1);
    });

    const binSummary = Array.from(binCount.entries())
        .sort((a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0))
        .map(([binNo, count]) => ({ binNo, count }));

    const mapLines = buildSilanMapLines(dies, minX, maxX, minY, maxY);

    return {
        header: {
            waferMapData: timestamp,
            testerName: header['Tester Name'] || '',
            deviceName: header['Device Name'] || '',
            waferSize: header?.['Wafer Size'] ? parseFloat(header['Wafer Size']) : 0,
            indexX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
            indexY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
            lotId: header['Lot No.'] || '',
            waferId: header['Lot No.'] && header['Wafer ID']
                ? `${header['Lot No.']}-${header['Wafer ID']}`
                : header['Wafer ID'] || '',
            mapBinLength: 1,//什么意思
            direction: header?.['Flat/Notch'] || 'Unknown',
        },
        sum: {
            sample: stats.totalTested,
            passNum: stats.totalPass,
            failNum: stats.totalFail,
            passPercent: stats.yieldPercentage || 0,
            xMin: minX,
            yMin: minY,
            xMax: maxX,
            yMax: maxY,
        },
        binSummary: binSummary,
        map: {
            raw: mapLines,
            dies: dies,
        },
    };
};

function buildSilanMapLines(
    dies: AsciiDie[],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
): string[] {
    const lines: string[] = [];
    const dieMap = new Map<string, AsciiDie>();
    dies.forEach(d => dieMap.set(`${d.x},${d.y}`, d));

    const xLabels: string[] = [];
    for (let x = minX; x <= maxX; x++) {
        if (x % 5 === 0 || x === minX || x === maxX) {
            xLabels.push(x.toString().padStart(4));
        }
    }
    lines.push('            ' + xLabels.join(''));
    lines.push('        ----+----+----+----+----+---');

    for (let y = minY; y <= maxY; y++) {
        const yLabel = String(y).padStart(4);
        const sep = (y === minY || y === maxY || y % 5 === 0) ? '+' : '|';
        let row = '';
        for (let x = minX; x <= maxX; x++) {
            const d = dieMap.get(`${x},${y}`);
            if (!d) {
                row += ' ';
                continue;
            }
            if (isNumberBin(d.bin)) {
                row += d.bin.number === 1 ? '1' : 'X';
            } else {
                row += 'X';
            }
        }
        lines.push(`        ${yLabel}  ${sep} ${row}`);
    }
    return lines;
}

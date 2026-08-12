/**
 * Output-format converter tests (WaferMapEx / BinMap / HexMap) driven by the
 * real parsed CP1 layer plus small synthetic grids for exact expectations.
 */
import { describe, expect, it } from 'vitest';
import type { AsciiDie } from '@/types/ipc';
import { isNumberBin } from '@/types/ipc';
import {
    calculateStatsFromDies,
    convertToBinMapData,
    convertToHexMapData,
    convertToMapData,
    extractMapDataHeader,
    mapToMergedDies,
} from '@/utils/waferSubstrateRenderer';
import { loadCp1 } from './fixtures';

const die = (x: number, y: number, bin: AsciiDie['bin']): AsciiDie => ({ x, y, bin });

describe('convertToMapData', () => {
    const dies = [
        die(0, 0, { number: 1 }),
        die(2, 1, { number: 9 }),
        die(1, 1, { special: 'S' }),
    ];
    const stats = calculateStatsFromDies(dies);
    const mapData = convertToMapData(dies, stats, { 'Device Name': 'DEV' });

    it('sizes the grid from die bounds', () => {
        expect(mapData.mapColumns).toBe(3);
        expect(mapData.mapRows).toBe(2);
        expect(mapData.map.raw).toHaveLength(2);
        for (const row of mapData.map.raw) expect(row).toHaveLength(3);
    });

    it('places bins and fills gaps with dots', () => {
        expect(mapData.map.raw[0]).toBe('1..');
        expect(mapData.map.raw[1]).toBe('.S9');
    });

    it('carries header values and stats through', () => {
        expect(mapData.deviceName).toBe('DEV');
        expect(mapData.totalTested).toBe(stats.totalTested);
        expect(mapData.totalPass).toBe(stats.totalPass);
    });
});

describe('convertToBinMapData', () => {
    const dies = [
        die(0, 0, { number: 1 }),
        die(1, 0, { number: 1 }),
        die(2, 0, { number: 9 }),
        die(3, 0, { special: 'S' }),
        die(4, 0, { special: '*' }),
    ];
    const binMap = convertToBinMapData(dies, {});

    it('converts alignment markers to bin 257', () => {
        const marker = binMap.map.filter((d) => isNumberBin(d.bin) && d.bin.number === 257);
        expect(marker).toHaveLength(2);
    });

    it('counts numeric bins', () => {
        expect(binMap.bins).toEqual([
            { bin: 1, count: 2 },
            { bin: 9, count: 1 },
            { bin: 257, count: 2 },
        ]);
    });

    it('bin counts sum to the number of numeric dies', () => {
        const counted = binMap.bins.reduce((sum, b) => sum + b.count, 0);
        const numeric = binMap.map.filter((d) => isNumberBin(d.bin)).length;
        expect(counted).toBe(numeric);
    });
});

describe('convertToHexMapData', () => {
    const dies = [
        die(0, 0, { number: 1 }),
        die(1, 0, { special: 'A' }),
        die(2, 0, { special: 'S' }),
        die(0, 1, { number: 257 }),
        die(2, 1, { number: 3 }),
    ];
    const hex = convertToHexMapData(dies, { 'Dice SizeX': '1000', 'Dice SizeY': '2000' });

    it('sizes the grid and converts µm die pitch to mm', () => {
        expect(hex.header.rowCt).toBe(2);
        expect(hex.header.colCt).toBe(3);
        expect(hex.header.xDies).toBe(1);
        expect(hex.header.yDies).toBe(2);
    });

    it('maps letter bins to numbers and hides markers as null', () => {
        expect(hex.map.grid).toEqual([
            [1, 10, null], // 'A' -> 10, 'S' marker -> null
            [null, null, 3], // 257 marker -> null, gap -> null
        ]);
    });

    it('exposes only numeric dies in the dies list', () => {
        expect(hex.map.dies.every((d) => isNumberBin(d.bin))).toBe(true);
    });
});

describe('mapToMergedDies', () => {
    it('parses a char grid back to positioned dies', () => {
        const grid = [
            ['1', '.', 'S'],
            ['.', '9', 'z'],
        ];
        const dies = mapToMergedDies(grid, -1, 5);
        expect(dies).toEqual([
            { x: -1, y: 5, bin: { number: 1 } },
            { x: 1, y: 5, bin: { special: 'S' } },
            { x: 0, y: 6, bin: { number: 9 } },
            { x: 1, y: 6, bin: { special: 'z' } },
        ]);
    });
});

describe.each(['B003332', 'B003990'] as const)('converters on real CP1 layer (%s)', (lot) => {
    const mapData = loadCp1(lot);
    const dies = mapData.map.dies;
    const stats = calculateStatsFromDies(dies);
    const header = extractMapDataHeader(mapData);

    it('round-trips through convertToMapData with consistent dimensions', () => {
        const converted = convertToMapData(dies, stats, header);
        expect(converted.map.raw).toHaveLength(converted.mapRows);
        for (const row of converted.map.raw) {
            expect(row).toHaveLength(converted.mapColumns);
        }
        // Non-dot cells must equal the number of single-char-rendered dies at
        // unique positions (multi-digit bins occupy one logical cell but shift
        // the string; guard only the row/col envelope here).
        expect(converted.totalTested).toBe(stats.totalTested);
    });

    it('pins stats of the parsed layer', () => {
        expect(stats).toMatchSnapshot();
    });

    it('bin map bin counts are consistent', () => {
        const binMap = convertToBinMapData(dies, header);
        const counted = binMap.bins.reduce((sum, b) => sum + b.count, 0);
        const numeric = binMap.map.filter((d) => isNumberBin(d.bin)).length;
        expect(counted).toBe(numeric);
    });

    it('hex grid covers the die bounds', () => {
        const hex = convertToHexMapData(dies, header);
        const xs = dies.map((d) => d.x);
        const ys = dies.map((d) => d.y);
        expect(hex.header.colCt).toBe(Math.max(...xs) - Math.min(...xs) + 1);
        expect(hex.header.rowCt).toBe(Math.max(...ys) - Math.min(...ys) + 1);
        expect(hex.map.grid).toHaveLength(hex.header.rowCt);
    });
});

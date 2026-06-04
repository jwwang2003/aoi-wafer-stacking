import { describe, expect, it, vi } from 'vitest';

import { createPassValueSet } from '@/pages/Config/binConfig';
import { AsciiDie } from '@/types/ipc';
import {
    calculateStatsFromDies,
    convertToBinMapData,
    convertToFabWafer,
    convertToHexMapData,
    convertToMapData,
    convertToSilanMapData,
} from './waferSubstrateRenderer';

const dies = [
    { x: 0, y: 0, bin: { number: 1 } },
    { x: 1, y: 0, bin: { number: 2 } },
    { x: 0, y: 1, bin: { special: 'S' } },
    { x: 1, y: 1, bin: { special: 'G' } },
] satisfies AsciiDie[];

const header = {
    'Device Name': 'S1M032120B',
    'Lot No.': 'B003332',
    'Wafer ID': '01',
    'Wafer Size': '6',
    'Dice SizeX': '4986.000',
    'Dice SizeY': '3740.000',
    'Flat/Notch': 'Down',
    Operator: 'E023933',
    Device_fab: 'P0094B',
    'Measurement Time': '2025-03-31 02:27:15',
};

const stats = {
    totalTested: 3,
    totalPass: 2,
    totalFail: 1,
    yieldPercentage: (2 / 3) * 100,
};

const gapDies = [
    { x: -1, y: 2, bin: { number: 1 } },
    { x: 1, y: 2, bin: { special: 'G' } },
    { x: 1, y: 4, bin: { number: 2 } },
] satisfies AsciiDie[];

describe('waferSubstrateRenderer', () => {
    it('calculates tested, pass, fail, and yield stats from dies', () => {
        const result = calculateStatsFromDies(dies, createPassValueSet(['BIN 1', 'BIN 16']));

        expect(result.totalTested).toBe(3);
        expect(result.totalPass).toBe(2);
        expect(result.totalFail).toBe(1);
        expect(result.yieldPercentage).toBeCloseTo((2 / 3) * 100);
    });

    it('converts dies to MapData while preserving header fields, map shape, raw map, and stats', () => {
        const result = convertToMapData(dies, stats, header);

        expect(result.deviceName).toBe('S1M032120B');
        expect(result.lotNo).toBe('B003332');
        expect(result.waferId).toBe('01');
        expect(result.mapColumns).toBe(2);
        expect(result.mapRows).toBe(2);
        expect(result.map.raw).toEqual(['12', 'SG']);
        expect(result.totalTested).toBe(stats.totalTested);
        expect(result.totalPass).toBe(stats.totalPass);
        expect(result.totalFail).toBe(stats.totalFail);
        expect(result.yieldPercent).toBe(stats.yieldPercentage);
    });

    it('converts start marker S to bin 257 and counts only numeric bins in BinMapData', () => {
        const result = convertToBinMapData(dies, header);

        expect(result.product).toBe('S1M032120B');
        expect(result.waferLots).toBe('B003332');
        expect(result.waferNo).toBe('01');
        expect(result.waferSize).toBe(6);
        expect(result.indexX).toBe(4986);
        expect(result.indexY).toBe(3740);
        expect(result.map).toEqual([
            { x: 0, y: 0, bin: { number: 1 }, reserved: 0 },
            { x: 1, y: 0, bin: { number: 2 }, reserved: 0 },
            { x: 0, y: 1, bin: { number: 257 }, reserved: 0 },
            { x: 1, y: 1, bin: { special: 'G' }, reserved: 0 },
        ]);
        expect(result.bins).toEqual([
            { bin: 1, count: 1 },
            { bin: 2, count: 1 },
            { bin: 257, count: 1 },
        ]);
    });

    it('converts dies and MapEx header fields to HexMapData', () => {
        const result = convertToHexMapData(dies, header);

        expect(result.header).toMatchObject({
            rowCt: 2,
            colCt: 2,
            device: 'S1M032120B',
            lot: 'B003332',
            wafer: '01',
            xDies: 4.986,
            yDies: 3.74,
        });
        expect(result.map.grid).toEqual([
            [1, 2],
            [null, 16],
        ]);
    });

    it('converts dies, stats, and FAB header fields to a Wafer', () => {
        const result = convertToFabWafer(dies, stats, header);

        expect(result.operator).toBe('E023933');
        expect(result.device).toBe('P0094B');
        expect(result.lotId).toBe('B003332');
        expect(result.waferId).toBe('B003332-01');
        expect(result.grossDie).toBe(stats.totalTested);
        expect(result.passDie).toBe(stats.totalPass);
        expect(result.failDie).toBe(stats.totalFail);
        expect(result.totalYield).toBe(stats.yieldPercentage);
        expect(result.measTime).toBe('2025-03-31 02:27:15');
        expect(result.notch).toBe('Down');
        expect(result.map.raw).toEqual(['12', 'SG']);
    });

    it('converts dies, stats, and header fields to SilanMapData', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 2, 31, 2, 27));

        try {
            const result = convertToSilanMapData(dies, stats, header);

            expect(result.header.waferMapData).toBe('2025/03/31_02:27');
            expect(result.header.deviceName).toBe('S1M032120B');
            expect(result.header.lotId).toBe('B003332');
            expect(result.header.waferId).toBe('B003332-01');
            expect(result.header.waferSize).toBe(6);
            expect(result.header.indexX).toBe(4986);
            expect(result.header.indexY).toBe(3740);
            expect(result.header.direction).toBe('Down');
            expect(result.sum).toEqual({
                sample: stats.totalTested,
                passNum: stats.totalPass,
                failNum: stats.totalFail,
                passPercent: stats.yieldPercentage,
                xMin: 0,
                yMin: 0,
                xMax: 1,
                yMax: 1,
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('preserves negative-coordinate extents and gaps in MapData and Silan summaries', () => {
        const result = convertToMapData(gapDies, stats, header);
        const silanResult = convertToSilanMapData(gapDies, stats, header);

        expect(result.mapColumns).toBe(3);
        expect(result.mapRows).toBe(3);
        expect(result.map.raw).toEqual(['1.G', '...', '..2']);
        expect(silanResult.sum).toMatchObject({
            xMin: -1,
            yMin: 2,
            xMax: 1,
            yMax: 4,
        });
    });
});

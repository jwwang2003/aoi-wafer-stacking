import { describe, expect, it } from 'vitest';

import { createPassValueSet } from '../Config/binConfig';
import { AsciiDie } from '@/types/ipc';
import { processGdbnRule } from './gdbnRuleProcessor';

const GOOD_VALUES = createPassValueSet(['BIN 16']);

const binAt = (dies: AsciiDie[], x: number, y: number) =>
    dies.find(die => die.x === x && die.y === y)?.bin;

/** Fail run of `length` dies along a row at y=0 starting at x=0, wrapped in good dies. */
const buildHorizontalRunMap = (length: number): AsciiDie[] => {
    const dies: AsciiDie[] = [];
    for (let x = -2; x <= length + 1; x++) {
        for (let y = -2; y <= 2; y++) {
            const isFail = y === 0 && x >= 0 && x < length;
            dies.push({ x, y, bin: isFail ? { number: 2 } : { number: 16 } });
        }
    }
    return dies;
};

describe('processGdbnRule', () => {
    it('inks the ring around a horizontal run of 10 fails, corners included, without mutating input', () => {
        const dies = buildHorizontalRunMap(10);
        const originalDies = dies.map(die => ({ ...die, bin: { ...die.bin } }));

        const { processedDies } = processGdbnRule(dies, { goodValues: GOOD_VALUES });

        // Four corners of the ring
        expect(binAt(processedDies, -1, -1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 10, -1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, -1, 1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 10, 1)).toEqual({ special: 'z' });
        // Ends and rows above/below
        expect(binAt(processedDies, -1, 0)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 10, 0)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 5, -1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 5, 1)).toEqual({ special: 'z' });
        // Run dies keep their fail bin
        expect(binAt(processedDies, 0, 0)).toEqual({ number: 2 });
        expect(binAt(processedDies, 9, 0)).toEqual({ number: 2 });
        // Outside the ring stays good
        expect(binAt(processedDies, -2, 0)).toEqual({ number: 16 });
        expect(binAt(processedDies, 11, 0)).toEqual({ number: 16 });
        expect(binAt(processedDies, 5, 2)).toEqual({ number: 16 });
        expect(dies).toEqual(originalDies);
    });

    it('does not trigger on a run of 9 fails', () => {
        const dies = buildHorizontalRunMap(9);

        const { processedDies, inkedDies } = processGdbnRule(dies, { goodValues: GOOD_VALUES });

        expect(inkedDies).toHaveLength(0);
        expect(processedDies).toEqual(dies);
    });

    it('inks the ring around a vertical run of 10 fails', () => {
        const dies: AsciiDie[] = [];
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 10; y++) {
                const isFail = x === 0 && y >= 0 && y < 10;
                dies.push({ x, y, bin: isFail ? { number: 3 } : { number: 16 } });
            }
        }

        const { processedDies } = processGdbnRule(dies, { goodValues: GOOD_VALUES });

        expect(binAt(processedDies, -1, -1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 1, -1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, -1, 10)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 1, 10)).toEqual({ special: 'z' });
        expect(binAt(processedDies, -1, 5)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 0, 0)).toEqual({ number: 3 });
    });

    it('breaks a run on missing dies and on S or star alignment markers', () => {
        const gapDies = buildHorizontalRunMap(10).filter(die => !(die.x === 5 && die.y === 0));
        expect(processGdbnRule(gapDies, { goodValues: GOOD_VALUES }).inkedDies).toHaveLength(0);

        const markerDies = buildHorizontalRunMap(10).map(die =>
            die.x === 5 && die.y === 0 ? { ...die, bin: { special: 'S' } } : die
        );
        expect(processGdbnRule(markerDies, { goodValues: GOOD_VALUES }).inkedDies).toHaveLength(0);
    });

    it('only counts selected fail bins when failValues are provided', () => {
        const dies = buildHorizontalRunMap(10);

        const { inkedDies } = processGdbnRule(dies, {
            goodValues: GOOD_VALUES,
            failValues: createPassValueSet(['BIN 3']),
        });

        expect(inkedDies).toHaveLength(0);

        const { inkedDies: matchedInkedDies } = processGdbnRule(dies, {
            goodValues: GOOD_VALUES,
            failValues: createPassValueSet(['BIN 2']),
        });

        expect(matchedInkedDies.length).toBeGreaterThan(0);
    });

    it('respects a custom minRunLength', () => {
        const dies = buildHorizontalRunMap(5);

        const { processedDies } = processGdbnRule(dies, {
            goodValues: GOOD_VALUES,
            minRunLength: 5,
        });

        expect(binAt(processedDies, -1, -1)).toEqual({ special: 'z' });
        expect(binAt(processedDies, 5, 1)).toEqual({ special: 'z' });
    });
});

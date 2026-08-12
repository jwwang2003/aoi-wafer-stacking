/**
 * INK rule tests: synthetic edge cases for the neighbor-fail threshold,
 * plus characterization against a real CP1 layer from the fixture lots.
 *
 * Since the configurable-bin change, `goodValues` defaults to an empty set
 * (nothing is inked unless the caller supplies good bins), so every test
 * passes the set explicitly.
 */
import { describe, expect, it } from 'vitest';
import type { AsciiDie } from '@/types/ipc';
import { isNumberBin, isSpecialBin } from '@/types/ipc';
import { processInkRules } from '@/pages/WaferStacking/inkRuleProcessor';
import { PASS_VALUES } from '@/pages/WaferStacking/priority';
import { binValueMatchesValues } from '@/pages/Config/binConfig';
import { loadCp1 } from './fixtures';

const die = (x: number, y: number, bin: AsciiDie['bin']): AsciiDie => ({ x, y, bin });
const pass = (x: number, y: number) => die(x, y, { number: 1 });
const fail = (x: number, y: number) => die(x, y, { number: 9 });

const GOOD = { goodValues: PASS_VALUES };

const binValue = (d: AsciiDie): string =>
    isNumberBin(d.bin) ? d.bin.number.toString() : d.bin.special;

describe('processInkRules (synthetic)', () => {
    it('inks nothing when no goodValues are configured', () => {
        const dies = [pass(0, 0), fail(-1, 0), fail(1, 0)];
        const { processedDies } = processInkRules(dies, { failThreshold: 2 });
        expect(processedDies.find((d) => d.x === 0 && d.y === 0)?.bin)
            .toEqual({ number: 1 });
    });

    it('inks a good die with exactly failThreshold fail neighbors', () => {
        const dies = [pass(0, 0), fail(-1, 0), fail(1, 0)];
        const { processedDies } = processInkRules(dies, { ...GOOD, failThreshold: 2 });
        expect(processedDies.find((d) => d.x === 0 && d.y === 0)?.bin)
            .toEqual({ special: 'z' });
    });

    it('leaves a good die with failThreshold-1 fail neighbors untouched', () => {
        const dies = [pass(0, 0), fail(-1, 0)];
        const { processedDies } = processInkRules(dies, { ...GOOD, failThreshold: 2 });
        expect(processedDies.find((d) => d.x === 0 && d.y === 0)?.bin)
            .toEqual({ number: 1 });
    });

    it('counts all 8 neighbor directions', () => {
        const neighbors: Array<[number, number]> = [
            [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
        ];
        for (const [dx, dy] of neighbors) {
            const dies = [pass(0, 0), fail(dx, dy)];
            const { processedDies } = processInkRules(dies, { ...GOOD, failThreshold: 1 });
            expect(
                processedDies.find((d) => d.x === 0 && d.y === 0)?.bin,
                `neighbor at ${dx},${dy}`
            ).toEqual({ special: 'z' });
        }
    });

    it('never inks fail dies themselves', () => {
        const dies = [fail(0, 0), fail(-1, 0), fail(1, 0)];
        const { processedDies } = processInkRules(dies, { ...GOOD, failThreshold: 1 });
        expect(processedDies.find((d) => d.x === 0 && d.y === 0)?.bin)
            .toEqual({ number: 9 });
    });

    it("alignment markers ('S', '*') are neither inked nor counted as fails", () => {
        for (const marker of ['S', '*']) {
            const dies = [
                die(0, 0, { special: marker }),
                pass(1, 0),
                die(2, 0, { special: marker }),
            ];
            const { processedDies } = processInkRules(dies, { ...GOOD, failThreshold: 1 });
            expect(processedDies.find((d) => d.x === 0)?.bin).toEqual({ special: marker });
            // pass die between two markers has zero fail neighbors
            expect(processedDies.find((d) => d.x === 1)?.bin).toEqual({ number: 1 });
        }
    });

    it('an explicit failValues set restricts which bins count as fails', () => {
        // Bin 9 fails, bin 5 does not: the pass die has only one counted fail.
        const dies = [pass(0, 0), fail(-1, 0), die(1, 0, { number: 5 })];
        const { processedDies } = processInkRules(dies, {
            ...GOOD,
            failValues: new Set(['9']),
            failThreshold: 2,
        });
        expect(processedDies.find((d) => d.x === 0 && d.y === 0)?.bin)
            .toEqual({ number: 1 });
    });

    it('honors a custom ink marker and goodValues set', () => {
        const dies = [die(0, 0, { number: 7 }), fail(1, 0)];
        const { processedDies } = processInkRules(dies, {
            goodValues: new Set(['7']),
            inkMarker: 'Q',
            failThreshold: 1,
        });
        expect(processedDies.find((d) => d.x === 0)?.bin).toEqual({ special: 'Q' });
    });

    it('filteredDies contains exactly the fail dies plus the inked dies', () => {
        const dies = [pass(0, 0), fail(-1, 0), fail(1, 0), pass(5, 5)];
        const { filteredDies } = processInkRules(dies, { ...GOOD, failThreshold: 2 });
        const keys = filteredDies.map((d) => `${d.x},${d.y}:${binValue(d)}`).sort();
        expect(keys).toEqual(['-1,0:9', '0,0:z', '1,0:9']);
    });
});

describe.each(['B003332', 'B003990'] as const)('processInkRules on real CP1 layer (%s)', (lot) => {
    const dies = loadCp1(lot).map.dies;
    const { processedDies, filteredDies } = processInkRules(dies, GOOD);

    it('pins ink statistics', () => {
        const inked = processedDies.filter(
            (d) => isSpecialBin(d.bin) && d.bin.special === 'z'
        );
        expect({
            input: dies.length,
            inked: inked.length,
            filtered: filteredDies.length,
        }).toMatchSnapshot();
    });

    it('only previously-good dies with enough fail neighbors were inked', () => {
        const byKey = new Map(dies.map((d) => [`${d.x},${d.y}`, d]));
        const isFail = (d: AsciiDie | undefined) => {
            if (!d) return false;
            if (isSpecialBin(d.bin) && ['S', '*'].includes(d.bin.special)) return false;
            return !binValueMatchesValues(d.bin, PASS_VALUES);
        };

        for (const d of processedDies) {
            if (!(isSpecialBin(d.bin) && d.bin.special === 'z')) continue;
            const original = byKey.get(`${d.x},${d.y}`);
            expect(original && binValueMatchesValues(original.bin, PASS_VALUES)).toBe(true);

            let failNeighbors = 0;
            for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
                if (isFail(byKey.get(`${d.x + dx},${d.y + dy}`))) failNeighbors++;
            }
            expect(failNeighbors).toBeGreaterThanOrEqual(2);
        }
    });

    it('does not change die count or positions', () => {
        expect(processedDies).toHaveLength(dies.length);
        const positions = (list: AsciiDie[]) =>
            list.map((d) => `${d.x},${d.y}`).sort();
        expect(positions(processedDies)).toEqual(positions(dies));
    });
});

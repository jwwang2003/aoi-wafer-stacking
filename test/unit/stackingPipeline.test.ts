/**
 * Characterization tests for the wafer stacking pipeline
 * (src/pages/WaferStacking/stackingLayers.ts), run against real parsed lots
 * from `test/fixtures/parsed/`. Snapshots pin current behavior so pipeline
 * changes show up as reviewable snapshot diffs.
 */
import { describe, expect, it } from 'vitest';
import type { AsciiDie } from '@/types/ipc';
import { isSpecialBin } from '@/types/ipc';
import {
    calculateStatsFromDies,
    calculateValidatedOffset,
    computeDieBounds,
    extractAlignmentMarkers,
    getLayerPriority,
    mergeLayerToDieMap,
} from '@/utils/waferSubstrateRenderer';
import {
    alignStackingLayers,
    mergeStackingLayers,
    sortStackingLayersByPriority,
} from '@/pages/WaferStacking/stackingLayers';
import { loadLotLayers, toStackingLayers } from './fixtures';

const byPosition = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    a.y - b.y || a.x - b.x;

describe.each(['B003332', 'B003990'] as const)('lot %s', (lot) => {
    const layers = loadLotLayers(lot);
    const stackingLayers = sortStackingLayersByPriority(toStackingLayers(layers));
    const aligned = alignStackingLayers(stackingLayers);
    const merged = mergeStackingLayers(aligned);
    const stats = calculateStatsFromDies(merged);

    it('loads every stage layer with dies', () => {
        for (const layer of layers) {
            expect(layer.dies.length, `${layer.name} dies`).toBeGreaterThan(0);
        }
    });

    it('orders layers by strictly descending priority', () => {
        const priorities = layers.map((l) => getLayerPriority(l.meta));
        for (let i = 1; i < priorities.length; i++) {
            expect(priorities[i]).toBeLessThan(priorities[i - 1]);
        }
    });

    it('pins per-layer alignment offsets against the base layer', () => {
        const baseMarkers = extractAlignmentMarkers(stackingLayers[0].dies).sort(byPosition);
        const offsets = stackingLayers.slice(1).map((layer) => ({
            layer: layer.name,
            offset: calculateValidatedOffset(
                baseMarkers,
                extractAlignmentMarkers(layer.dies)
            ),
        }));
        expect(offsets).toMatchSnapshot();
    });

    it('pins merged map stats', () => {
        expect({
            mergedDieCount: merged.length,
            bounds: computeDieBounds(merged),
            stats,
        }).toMatchSnapshot();
    });

    it('contains no duplicate die positions', () => {
        const seen = new Set<string>();
        for (const die of merged) {
            const key = `${die.x},${die.y}`;
            expect(seen.has(key), `duplicate die at ${key}`).toBe(false);
            seen.add(key);
        }
    });

    it('never drops the alignment markers of the base layer', () => {
        const baseMarkers = extractAlignmentMarkers(stackingLayers[0].dies).sort(byPosition);
        const mergedMarkers = extractAlignmentMarkers(merged).sort(byPosition);
        for (const marker of baseMarkers) {
            expect(mergedMarkers).toContainEqual(marker);
        }
    });

    it('adds no alignment markers beyond those of the base layer', () => {
        // Regression guard for "prevent extra wafer alignment markers".
        const baseMarkers = extractAlignmentMarkers(stackingLayers[0].dies);
        const mergedMarkers = extractAlignmentMarkers(merged);
        expect(mergedMarkers.length).toBe(baseMarkers.length);
    });

    it('emits no empty-cell placeholder dies', () => {
        const placeholders = merged.filter(
            (die) => isSpecialBin(die.bin) && die.bin.special === '.'
        );
        expect(placeholders).toHaveLength(0);
    });

    it('stats add up', () => {
        expect(stats.totalPass + stats.totalFail).toBe(stats.totalTested);
        if (stats.totalTested > 0) {
            expect(stats.yieldPercentage).toBeCloseTo(
                (stats.totalPass / stats.totalTested) * 100,
                10
            );
        }
    });

    it('is deterministic', () => {
        const again = mergeStackingLayers(
            alignStackingLayers(sortStackingLayersByPriority(toStackingLayers(loadLotLayers(lot))))
        );
        expect(again).toEqual(merged);
    });
});

describe('merge precedence rules (synthetic)', () => {
    const die = (x: number, y: number, bin: AsciiDie['bin']): AsciiDie => ({ x, y, bin });

    const mergeTwo = (first: AsciiDie, firstPriority: number, second: AsciiDie, secondPriority: number) => {
        const map = new Map<string, { die: AsciiDie; priority: number }>();
        mergeLayerToDieMap(map, [first], firstPriority);
        mergeLayerToDieMap(map, [second], secondPriority);
        return map.get(`${first.x},${first.y}`)?.die;
    };

    it('higher priority layer overwrites lower', () => {
        const result = mergeTwo(
            die(0, 0, { number: 5 }), 1,
            die(0, 0, { number: 9 }), 6
        );
        expect(result?.bin).toEqual({ number: 9 });
    });

    it('lower priority layer does not overwrite a non-pass die', () => {
        const result = mergeTwo(
            die(0, 0, { number: 5 }), 6,
            die(0, 0, { number: 9 }), 1
        );
        expect(result?.bin).toEqual({ number: 5 });
    });

    it("lower priority layer DOES overwrite a pass ('1') die", () => {
        // Bin-value priority: bad bin > good bin, so a defect found
        // downstream still marks the die as failed.
        const result = mergeTwo(
            die(0, 0, { number: 1 }), 6,
            die(0, 0, { number: 9 }), 1
        );
        expect(result?.bin).toEqual({ number: 9 });
    });

    it('bad letter bin from a later layer overwrites a good letter bin', () => {
        const result = mergeTwo(
            die(0, 0, { special: 'G' }), 6,
            die(0, 0, { special: 'E' }), 2
        );
        expect(result?.bin).toEqual({ special: 'E' });
    });

    it('numeric bad bin outranks every bad letter bin', () => {
        const result = mergeTwo(
            die(0, 0, { special: 'E' }), 6,
            die(0, 0, { number: 9 }), 1
        );
        expect(result?.bin).toEqual({ number: 9 });
    });

    it('bad letters follow the E>D>C>B>F>A>L~T>Z>X order', () => {
        // Later E beats earlier D…
        expect(
            mergeTwo(die(0, 0, { special: 'D' }), 6, die(0, 0, { special: 'E' }), 1)?.bin
        ).toEqual({ special: 'E' });
        // …but a later X never beats an earlier A.
        expect(
            mergeTwo(die(0, 0, { special: 'A' }), 6, die(0, 0, { special: 'X' }), 1)?.bin
        ).toEqual({ special: 'A' });
        // Z beats X.
        expect(
            mergeTwo(die(0, 0, { special: 'X' }), 6, die(0, 0, { special: 'Z' }), 1)?.bin
        ).toEqual({ special: 'Z' });
    });

    it("good letter bin beats bin1 in both merge directions", () => {
        // Good letter arriving after bin1 wins…
        expect(
            mergeTwo(die(0, 0, { number: 1 }), 6, die(0, 0, { special: 'G' }), 1)?.bin
        ).toEqual({ special: 'G' });
        // …and an established good letter is NOT clobbered by a later bin1.
        expect(
            mergeTwo(die(0, 0, { special: 'G' }), 6, die(0, 0, { number: 1 }), 1)?.bin
        ).toEqual({ special: 'G' });
    });

    it('alignment markers survive any later layer regardless of priority', () => {
        for (const special of ['S', '*']) {
            const result = mergeTwo(
                die(0, 0, { special }), 6,
                die(0, 0, { number: 9 }), 1
            );
            expect(result?.bin).toEqual({ special });
        }
    });

    it('bin 257 (WLBI start marker) is never overwritten', () => {
        const result = mergeTwo(
            die(0, 0, { number: 257 }), 5,
            die(0, 0, { number: 9 }), 6
        );
        expect(result?.bin).toEqual({ number: 257 });
    });

    it("empty-cell dies ('.') are never merged in", () => {
        const map = new Map<string, { die: AsciiDie; priority: number }>();
        mergeLayerToDieMap(map, [die(0, 0, { special: '.' })], 6);
        expect(map.size).toBe(0);
    });
});

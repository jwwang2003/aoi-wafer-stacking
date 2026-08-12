import { describe, expect, it } from 'vitest';

import { createPassValueSet } from '@/pages/Config/binConfig';
import type { AsciiDie } from '@/types/ipc';
import {
    alignStackingLayers,
    computeStackingGridBounds,
    createSubstrateStackingLayer,
    mergeStackingLayers,
    sortStackingLayersByPriority,
    type ParsedStackingLayer,
} from './stackingLayers';

const createLayer = (
    name: string,
    priority: number,
    dies: AsciiDie[]
): ParsedStackingLayer => ({
    name,
    priority,
    header: {},
    dies,
});

const findDie = (dies: AsciiDie[], x: number, y: number) =>
    dies.find((die) => die.x === x && die.y === y);

describe('stackingLayers', () => {
    it('keeps the higher-priority die when layers share the same coordinate', () => {
        const lowPriorityLayer = createLayer('AOI', 1, [
            { x: 0, y: 0, bin: { number: 1 } },
        ]);
        const highPriorityLayer = createLayer('CP2', 6, [
            { x: 0, y: 0, bin: { number: 16 } },
        ]);

        const merged = mergeStackingLayers([lowPriorityLayer, highPriorityLayer]);

        expect(merged).toHaveLength(1);
        expect(findDie(merged, 0, 0)?.bin).toEqual({ number: 16 });
    });

    it('sorts target markers before aligning without mutating the target dies', () => {
        const baseDies = [
            { x: 0, y: 0, bin: { special: 'S' } },
            { x: 2, y: 0, bin: { special: 'S' } },
            { x: 0, y: 2, bin: { special: 'S' } },
            { x: 1, y: 1, bin: { number: 1 } },
        ] satisfies AsciiDie[];
        const targetDies = [
            { x: 5, y: 9, bin: { special: 'S' } },
            { x: 7, y: 7, bin: { special: 'S' } },
            { x: 6, y: 8, bin: { number: 16 } },
            { x: 5, y: 7, bin: { special: 'S' } },
        ] satisfies AsciiDie[];
        const originalTargetDies = targetDies.map((die) => ({
            ...die,
            bin: { ...die.bin },
        }));

        const aligned = alignStackingLayers([
            createLayer('Base', 1, baseDies),
            createLayer('Target', 6, targetDies),
        ]);

        expect(aligned[1].dies).toContainEqual({ x: 0, y: 0, bin: { special: 'S' } });
        expect(aligned[1].dies).toContainEqual({ x: 1, y: 1, bin: { number: 16 } });
        expect(targetDies).toEqual(originalTargetDies);
    });

    it('removes incompatible layer markers instead of adding extra S points', () => {
        const layout = createLayer('DieLayout', 100, [
            { x: -4, y: -18, bin: { special: 'S' } },
            { x: 3, y: -18, bin: { special: 'S' } },
        ]);
        const map = createLayer('CP2', 6, [
            { x: -34, y: -101, bin: { special: 'S' } },
            { x: 33, y: -101, bin: { special: 'S' } },
            { x: 0, y: 0, bin: { number: 2 } },
        ]);

        const aligned = alignStackingLayers([layout, map]);
        expect(aligned[1].dies).toContainEqual({ x: 0, y: 0, bin: { number: 2 } });
        expect(aligned[1].dies.filter((die) => 'special' in die.bin && die.bin.special === 'S'))
            .toEqual([]);

        const merged = mergeStackingLayers(aligned);
        expect(merged.filter((die) => 'special' in die.bin && die.bin.special === 'S'))
            .toHaveLength(2);
    });

    it('returns an empty array for empty layer lists', () => {
        expect(alignStackingLayers([])).toEqual([]);
        expect(mergeStackingLayers([])).toEqual([]);
        expect(computeStackingGridBounds([])).toBeUndefined();
    });

    it('shifts layer grid bounds by the alignment offset and unions them for the output grid', () => {
        const baseLayer: ParsedStackingLayer = {
            ...createLayer('CP1', 6, [
                { x: 0, y: 0, bin: { special: 'S' } },
                { x: 1, y: 1, bin: { number: 1 } },
            ]),
            gridBounds: { minX: -3, maxX: 3, minY: -3, maxY: 3 },
        };
        const targetLayer: ParsedStackingLayer = {
            ...createLayer('AOI', 1, [
                { x: 5, y: 5, bin: { special: 'S' } },
                { x: 6, y: 6, bin: { number: 2 } },
            ]),
            gridBounds: { minX: 1, maxX: 9, minY: 1, maxY: 9 },
        };

        const aligned = alignStackingLayers([baseLayer, targetLayer]);

        // target markers moved onto base markers => offset (-5, -5)
        expect(aligned[0].gridBounds).toEqual({ minX: -3, maxX: 3, minY: -3, maxY: 3 });
        expect(aligned[1].gridBounds).toEqual({ minX: -4, maxX: 4, minY: -4, maxY: 4 });

        expect(computeStackingGridBounds(aligned)).toEqual({
            minX: -4,
            maxX: 4,
            minY: -4,
            maxY: 4,
        });
    });

    it('falls back to die extents for layers without grid bounds', () => {
        const layer = createLayer('WLBI', 4, [
            { x: -2, y: 1, bin: { number: 1 } },
            { x: 5, y: -3, bin: { number: 2 } },
        ]);

        expect(computeStackingGridBounds([layer])).toEqual({
            minX: -2,
            maxX: 5,
            minY: -3,
            maxY: 1,
        });
    });

    it('creates a deferred substrate layer from the first parsed layer seed', () => {
        const baseLayer = createLayer('AOI', 1, [
            { x: 0, y: 0, bin: { special: 'S' } },
            { x: 1, y: 0, bin: { number: 1 } },
        ]);

        const substrateLayer = createSubstrateStackingLayer({
            baseLayer,
            filteredSubstrateDefects: [
                { x: 1, y: 0, w: 1000, h: 1000 },
            ],
            dieSize: { width: 1, height: 1 },
            substrateOffset: { x: 0, y: 0 },
            defectSizeOffset: { x: 0, y: 0 },
        });

        expect(substrateLayer?.name).toBe('Substrate');
        expect(substrateLayer?.dies).toContainEqual({ x: 0, y: 0, bin: { special: 'S' } });
        expect(substrateLayer?.dies).toContainEqual({ x: 1, y: 0, bin: { special: 'E' } });
    });

    it('keeps lower-priority AOI failures visible after a non-defective substrate layer is deferred', () => {
        const cpLayer = createLayer('CP2', 6, [
            { x: 0, y: 0, bin: { number: 1 } },
        ]);
        const aoiLayer = createLayer('AOI', 1, [
            { x: 0, y: 0, bin: { number: 2 } },
        ]);
        const substrateLayer = createSubstrateStackingLayer({
            baseLayer: cpLayer,
            filteredSubstrateDefects: [],
            dieSize: { width: 1, height: 1 },
            substrateOffset: { x: 0, y: 0 },
            defectSizeOffset: { x: 0, y: 0 },
        });

        expect(substrateLayer).not.toBeNull();

        const orderedLayers = sortStackingLayersByPriority([cpLayer, aoiLayer, substrateLayer!]);
        const merged = mergeStackingLayers(alignStackingLayers(orderedLayers));

        expect(findDie(merged, 0, 0)?.bin).toEqual({ number: 2 });
    });

    it('uses configured pass bins when a lower-priority failure overlays a higher-priority pass die', () => {
        const cpLayer = createLayer('CP2', 6, [
            { x: 0, y: 0, bin: { number: 16 } },
        ]);
        const aoiLayer = createLayer('AOI', 1, [
            { x: 0, y: 0, bin: { number: 2 } },
        ]);

        const merged = mergeStackingLayers(
            [cpLayer, aoiLayer],
            createPassValueSet(['BIN 16'])
        );

        expect(findDie(merged, 0, 0)?.bin).toEqual({ number: 2 });
    });
});

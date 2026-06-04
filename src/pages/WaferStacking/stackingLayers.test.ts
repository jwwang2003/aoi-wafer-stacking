import { describe, expect, it } from 'vitest';

import type { AsciiDie } from '@/types/ipc';
import {
    alignStackingLayers,
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

    it('returns an empty array for empty layer lists', () => {
        expect(alignStackingLayers([])).toEqual([]);
        expect(mergeStackingLayers([])).toEqual([]);
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
});

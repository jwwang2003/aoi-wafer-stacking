import { describe, expect, it } from 'vitest';

import { AsciiDie } from '@/types/ipc';
import {
    generateGridWithSubstrateDefects,
    normalizeDefect,
    rectsOverlap,
} from './substrateMapping';

describe('substrateMapping', () => {
    it('normalizes defect dimensions from micrometers to millimeters with centered size offsets', () => {
        expect(normalizeDefect({ x: 10, y: 20, w: 100, h: 200 }, { x: 50, y: 100 })).toEqual({
            x: 9.95,
            y: 19.9,
            w: 0.2,
            h: 0.4,
        });
    });

    it('does not overlap rectangles that only touch edges', () => {
        expect(
            rectsOverlap(
                { left: 0, right: 1, top: 0, bottom: 1 },
                { left: 1, right: 2, top: 0, bottom: 1 },
            ),
        ).toBe(false);
    });

    it('marks a non-marker die as E when a defect overlaps it', () => {
        const baseDies: AsciiDie[] = [
            { x: 0, y: 0, bin: { number: 16 } },
        ];

        const result = generateGridWithSubstrateDefects(
            baseDies,
            [{ x: 0.25, y: 0.25, w: 500, h: 500 }],
            { width: 1, height: 1 },
        );

        expect(result).toEqual([
            { x: 0, y: 0, bin: { special: 'E' } },
        ]);
    });

    it('preserves S and marker/start bins when defects overlap them', () => {
        const baseDies: AsciiDie[] = [
            { x: 0, y: 0, bin: { special: 'S' } },
            { x: 1, y: 0, bin: { number: 257 } },
        ];

        const result = generateGridWithSubstrateDefects(
            baseDies,
            [
                { x: 0.25, y: 0.25, w: 500, h: 500 },
                { x: 1.25, y: 0.25, w: 500, h: 500 },
            ],
            { width: 1, height: 1 },
        );

        expect(result).toEqual(baseDies);
    });
});

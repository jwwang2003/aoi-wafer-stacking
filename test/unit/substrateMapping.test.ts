/**
 * Substrate defect projection: geometry unit tests plus characterization
 * against the real B003990 substrate defect list.
 */
import { describe, expect, it } from 'vitest';
import { isSpecialBin } from '@/types/ipc';
import {
    computeDieRect,
    generateGridWithSubstrateDefects,
    normalizeDefect,
    rectsOverlap,
} from '@/utils/substrateMapping';
import { flattenDefects, loadCp1, loadSubstrateDefects } from './fixtures';

describe('computeDieRect', () => {
    it('maps die grid coordinates to mm with inverted y', () => {
        const rect = computeDieRect({ x: 2, y: 3 }, { width: 1, height: 2 }, { x: 0.5, y: -0.5 });
        expect(rect).toEqual({ left: 2.5, right: 3.5, top: -6.5, bottom: -4.5 });
    });
});

describe('normalizeDefect', () => {
    it('converts µm dimensions to mm and keeps position', () => {
        const norm = normalizeDefect({ x: 1.5, y: -2, w: 500, h: 250 });
        expect(norm).toEqual({ x: 1.5, y: -2, w: 0.5, h: 0.25 });
    });

    it('grows the rectangle symmetrically around its center', () => {
        const norm = normalizeDefect({ x: 1, y: 1, w: 100, h: 100 }, { x: 50, y: 50 });
        // center stays at (1 + 0.05, 1 + 0.05)
        expect(norm.x + norm.w / 2).toBeCloseTo(1.05, 10);
        expect(norm.y + norm.h / 2).toBeCloseTo(1.05, 10);
        expect(norm.w).toBeCloseTo(0.2, 10);
        expect(norm.h).toBeCloseTo(0.2, 10);
    });

    it('clamps negative sizes to zero when shrunk too far', () => {
        const norm = normalizeDefect({ x: 0, y: 0, w: 10, h: 10 }, { x: -50, y: -50 });
        expect(norm.w).toBe(0);
        expect(norm.h).toBe(0);
    });
});

describe('rectsOverlap', () => {
    const unit = { left: 0, right: 1, top: 0, bottom: 1 };

    it('detects genuine overlap', () => {
        expect(rectsOverlap(unit, { left: 0.5, right: 1.5, top: 0.5, bottom: 1.5 })).toBe(true);
    });

    it('ignores edge-touching rectangles', () => {
        expect(rectsOverlap(unit, { left: 1, right: 2, top: 0, bottom: 1 })).toBe(false);
    });

    it('ignores disjoint rectangles', () => {
        expect(rectsOverlap(unit, { left: 5, right: 6, top: 5, bottom: 6 })).toBe(false);
    });
});

describe('generateGridWithSubstrateDefects (synthetic)', () => {
    const seeds = [
        { x: 0, y: 0, bin: { number: 1 } },
        { x: 1, y: 0, bin: { number: 1 } },
        { x: 0, y: 0, bin: { special: 'S' } },
    ];

    it('marks only dies overlapped by a defect', () => {
        // defect square inside die (0,0): die rect x [0,1), y [0,1) with 1x1mm grid
        const defects = [{ x: 0.4, y: 0.4, w: 100, h: 100 }]; // 0.1mm defect
        const result = generateGridWithSubstrateDefects(
            [seeds[0], seeds[1]],
            defects,
            { width: 1, height: 1 }
        );
        expect(result.find((d) => d.x === 0)?.bin).toEqual({ special: 'E' });
        expect(result.find((d) => d.x === 1)?.bin).toEqual({ number: 1 });
    });

    it('preserves alignment markers even when overlapped', () => {
        const defects = [{ x: 0.1, y: 0.1, w: 500, h: 500 }];
        const result = generateGridWithSubstrateDefects(
            [{ x: 0, y: 0, bin: { special: 'S' } }],
            defects,
            { width: 1, height: 1 }
        );
        expect(result[0].bin).toEqual({ special: 'S' });
    });

    it('prefers the explicit layout as seed grid when provided', () => {
        const layout = [{ x: 5, y: 5, bin: { number: 1 } }];
        const result = generateGridWithSubstrateDefects(
            [seeds[0]],
            [],
            { width: 1, height: 1 },
            { x: 0, y: 0 },
            0,
            0,
            layout
        );
        expect(result).toHaveLength(1);
        expect(result[0].x).toBe(5);
    });

    it('returns empty for missing seeds', () => {
        expect(generateGridWithSubstrateDefects(undefined, [], { width: 1, height: 1 }))
            .toEqual([]);
        expect(generateGridWithSubstrateDefects([], [], { width: 1, height: 1 }))
            .toEqual([]);
    });
});

describe('generateGridWithSubstrateDefects on real B003990 data', () => {
    const seeds = loadCp1('B003990').map.dies;
    const defects = flattenDefects(loadSubstrateDefects('B003990'));

    it('loads a non-trivial defect list', () => {
        expect(defects.length).toBeGreaterThan(0);
    });

    it('pins the projected defect count with default 1x1mm dies', () => {
        const result = generateGridWithSubstrateDefects(
            seeds,
            defects,
            { width: 1, height: 1 }
        );
        const defective = result.filter(
            (d) => isSpecialBin(d.bin) && d.bin.special === 'E'
        );
        expect({
            seeds: seeds.length,
            defects: defects.length,
            defectiveDies: defective.length,
        }).toMatchSnapshot();
    });

    it('grid offset shifts which dies are marked', () => {
        const at = (offset: { x: number; y: number }) =>
            generateGridWithSubstrateDefects(seeds, defects, { width: 1, height: 1 }, offset)
                .filter((d) => isSpecialBin(d.bin) && d.bin.special === 'E')
                .map((d) => `${d.x},${d.y}`)
                .sort();
        // A large offset moves the die grid off the defect cloud entirely.
        expect(at({ x: 0, y: 0 })).not.toEqual(at({ x: 500, y: 500 }));
    });
});

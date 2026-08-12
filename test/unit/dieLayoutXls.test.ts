/**
 * 基板布局 (die layout) Excel fixture tests.
 *
 * `test/fixtures/parser/die-layout.xlsx` is generated from the parsed CP1
 * layers (see test/fixtures/tools/generate_die_layout.py), so its alignment
 * markers match the fixture wafer maps exactly. These tests cover the layout
 * selection + adoption path of the job processor end to end with real data.
 */
import { describe, expect, it } from 'vitest';
import { isSpecialBin } from '@/types/ipc';
import {
    calculateStatsFromDies,
    calculateValidatedOffset,
    extractAlignmentMarkers,
    findDieLayoutSheet,
} from '@/utils/waferSubstrateRenderer';
import {
    alignStackingLayers,
    mergeStackingLayers,
    sortStackingLayersByPriority,
} from '@/pages/WaferStacking/stackingLayers';
import { loadDieLayouts, loadLotLayers, toStackingLayers } from './fixtures';

const layouts = loadDieLayouts();
const PRODUCT_OF = { B003332: 'S1M032120B', B003990: 'S1M040120B' } as const;

describe('die layout workbook', () => {
    it('contains one sheet per fixture product', () => {
        expect(Object.keys(layouts).sort()).toEqual(['S1M032120B', 'S1M040120B']);
    });

    it('every sheet has exactly two alignment markers', () => {
        for (const [product, sheet] of Object.entries(layouts)) {
            const markers = extractAlignmentMarkers(sheet.dies);
            expect(markers, product).toHaveLength(2);
        }
    });

    it('findDieLayoutSheet resolves exact and separator-insensitive product ids', () => {
        expect(findDieLayoutSheet(layouts, ['S1M040120B'])?.key).toBe('S1M040120B');
        expect(findDieLayoutSheet(layouts, ['s1m032120b'])?.key).toBe('S1M032120B');
        expect(findDieLayoutSheet(layouts, ['S1M 040120B'])?.key).toBe('S1M040120B');
        expect(findDieLayoutSheet(layouts, ['UNKNOWN', 'S1M032120B'])?.key).toBe('S1M032120B');
        expect(findDieLayoutSheet(layouts, ['UNKNOWN'])).toBeUndefined();
    });
});

describe.each(['B003332', 'B003990'] as const)('layout adoption for lot %s', (lot) => {
    const layoutDies = layouts[PRODUCT_OF[lot]].dies;
    const layoutMarkers = extractAlignmentMarkers(layoutDies);
    const mapLayers = loadLotLayers(lot);

    it('layout markers validate against every map layer of the lot', () => {
        for (const layer of mapLayers) {
            const offset = calculateValidatedOffset(
                layoutMarkers,
                extractAlignmentMarkers(layer.dies)
            );
            expect(offset, `${layer.name} markers should match layout geometry`).not.toBeNull();
        }
    });

    it('is compatible with the highest-priority layer, as the job processor checks', () => {
        const reference = sortStackingLayersByPriority(toStackingLayers(mapLayers))[0];
        expect(
            calculateValidatedOffset(
                extractAlignmentMarkers(layoutDies),
                extractAlignmentMarkers(reference.dies)
            )
        ).not.toBeNull();
    });

    it('pins the merged result when stacking with the layout at priority 100', () => {
        // Mirrors jobProcessor: layout joins as 'DieLayout' with priority 100.
        const layers = sortStackingLayersByPriority([
            ...toStackingLayers(mapLayers),
            { name: 'DieLayout', priority: 100, header: {}, dies: layoutDies },
        ]);
        const merged = mergeStackingLayers(alignStackingLayers(layers));

        // The layout adds no positions beyond its own grid and no extra markers.
        const mergedMarkers = extractAlignmentMarkers(merged);
        expect(mergedMarkers).toHaveLength(layoutMarkers.length);

        // Layout '1' placeholders must not mask real map results: fail dies
        // from the wafer maps survive the merge even though the layout has
        // priority 100 (pass dies are overwritable by design).
        const stats = calculateStatsFromDies(merged);
        expect(stats.totalFail).toBeGreaterThan(0);

        expect({
            mergedDieCount: merged.length,
            stats,
        }).toMatchSnapshot();
    });

    it('layout cells are only pass placeholders and markers', () => {
        for (const die of layoutDies) {
            if (isSpecialBin(die.bin)) {
                expect(['S']).toContain(die.bin.special);
            } else {
                expect(die.bin).toEqual({ number: 1 });
            }
        }
    });
});

import { describe, expect, it } from 'vitest';

import { DataSourceType } from '@/types/dataSource';

import { buildSelectedLayerKeySet, waferMapLayerKey, type SelectableWaferMap } from './layerSelection';

const mapRow = (stage: DataSourceType, subStage: string | null = null): SelectableWaferMap => ({
    stage,
    sub_stage: subStage,
});

describe('layerSelection', () => {
    it('defaults undefined selected layer keys to all candidate layers', () => {
        const maps = [
            mapRow(DataSourceType.Aoi),
            mapRow(DataSourceType.CpProber, '1'),
        ];

        expect(buildSelectedLayerKeySet(maps, undefined)).toEqual(new Set([
            waferMapLayerKey(maps[0]),
            waferMapLayerKey(maps[1]),
        ]));
    });

    it('respects an explicit empty selected layer key array as no selected layers', () => {
        const maps = [
            mapRow(DataSourceType.Aoi),
            mapRow(DataSourceType.CpProber, '1'),
        ];

        expect(buildSelectedLayerKeySet(maps, [])).toEqual(new Set());
    });

    it('filters provided selected layer keys against candidate layers', () => {
        const maps = [
            mapRow(DataSourceType.Aoi),
            mapRow(DataSourceType.CpProber, '1'),
        ];

        expect(buildSelectedLayerKeySet(maps, [
            waferMapLayerKey(maps[0]),
            'missing|layer',
        ])).toEqual(new Set([waferMapLayerKey(maps[0])]));
    });
});

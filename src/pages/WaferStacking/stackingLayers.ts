import type { AsciiDie } from '@/types/ipc';
import { DataSourceType } from '@/types/dataSource';
import { PASS_VALUES } from './priority';
import {
    generateGridWithSubstrateDefects,
    type DefectRect,
    type GridOffset,
    type GridSize,
} from '@/utils/substrateMapping';
import {
    applyOffsetToDies,
    calculateOffset,
    createDieMapStructure,
    extractAlignmentMarkers,
    getLayerPriority,
    mergeLayerToDieMap,
    pruneEmptyRegions,
} from '@/utils/waferSubstrateRenderer';

export interface ParsedStackingLayer {
    name: string;
    priority: number;
    header: Record<string, string>;
    dies: AsciiDie[];
}

export interface DeferredSubstrateLayerInput {
    baseLayer: ParsedStackingLayer | undefined;
    filteredSubstrateDefects: DefectRect[];
    dieSize: GridSize;
    substrateOffset: GridOffset;
    defectSizeOffset: GridOffset;
    layoutDies?: AsciiDie[];
}

const sortMarkersByCoordinate = (markers: { x: number; y: number }[]) =>
    markers.sort((a, b) => a.y - b.y || a.x - b.x);

export function alignStackingLayers(layers: ParsedStackingLayer[]): ParsedStackingLayer[] {
    if (layers.length === 0) return [];
    const baseDies = layers[0].dies;
    const baseMarkers = sortMarkersByCoordinate(extractAlignmentMarkers(baseDies));
    return layers.map((layer, index) => {
        if (index === 0) return { ...layer, dies: [...layer.dies] };
        const currentMarkers = sortMarkersByCoordinate(extractAlignmentMarkers(layer.dies));
        const { dx, dy } = calculateOffset(baseMarkers, currentMarkers);
        return { ...layer, dies: applyOffsetToDies(layer.dies, dx, dy) };
    });
}

export function mergeStackingLayers(
    layers: ParsedStackingLayer[],
    passValues: Set<string> = PASS_VALUES
): AsciiDie[] {
    if (layers.length === 0) return [];
    const { dieMap } = createDieMapStructure(layers.map((layer) => layer.dies));
    layers.forEach((layer) => mergeLayerToDieMap(dieMap, layer.dies, layer.priority, passValues));
    return pruneEmptyRegions(dieMap);
}

export function sortStackingLayersByPriority(layers: ParsedStackingLayer[]): ParsedStackingLayer[] {
    return [...layers].sort((a, b) => b.priority - a.priority);
}

export function createSubstrateStackingLayer({
    baseLayer,
    filteredSubstrateDefects,
    dieSize,
    substrateOffset,
    defectSizeOffset,
    layoutDies,
}: DeferredSubstrateLayerInput): ParsedStackingLayer | null {
    const dies = generateGridWithSubstrateDefects(
        baseLayer?.dies,
        filteredSubstrateDefects,
        dieSize,
        substrateOffset,
        defectSizeOffset.x,
        defectSizeOffset.y,
        layoutDies
    );

    if (dies.length === 0) return null;

    return {
        name: 'Substrate',
        priority: getLayerPriority({ stage: DataSourceType.Substrate }),
        header: {},
        dies,
    };
}

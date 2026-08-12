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
    calculateValidatedOffset,
    computeDieBounds,
    createDieMapStructure,
    extractAlignmentMarkers,
    getLayerPriority,
    mergeLayerToDieMap,
    pruneEmptyRegions,
    unionGridBounds,
    withoutAlignmentMarkers,
    type GridBounds,
} from '@/utils/waferSubstrateRenderer';

export interface ParsedStackingLayer {
    name: string;
    priority: number;
    header: Record<string, string>;
    dies: AsciiDie[];
    /** 输入图完整网格范围（含只有 '.' 的行列），用于保持输出尺寸与输入一致 */
    gridBounds?: GridBounds;
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
        const offset = calculateValidatedOffset(baseMarkers, currentMarkers);
        if (!offset) {
            return {
                ...layer,
                // Retain the layer's die results, but never let an incompatible
                // marker set add extra S/* points to the merged wafer.
                dies: withoutAlignmentMarkers(layer.dies),
            };
        }
        const { dx, dy } = offset;
        return {
            ...layer,
            dies: applyOffsetToDies(layer.dies, dx, dy),
            gridBounds: layer.gridBounds
                ? {
                    minX: layer.gridBounds.minX + dx,
                    maxX: layer.gridBounds.maxX + dx,
                    minY: layer.gridBounds.minY + dy,
                    maxY: layer.gridBounds.maxY + dy,
                }
                : undefined,
        };
    });
}

/**
 * 计算叠图输出的网格范围：所有图层完整网格（含 '.' 行列）与晶粒范围的并集，
 * 使输出不会裁掉输入中只含 '.' 的行列。
 */
export function computeStackingGridBounds(
    layers: ParsedStackingLayer[]
): GridBounds | undefined {
    return layers.reduce<GridBounds | undefined>(
        (bounds, layer) => unionGridBounds(
            unionGridBounds(bounds, layer.gridBounds),
            computeDieBounds(layer.dies)
        ),
        undefined
    );
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

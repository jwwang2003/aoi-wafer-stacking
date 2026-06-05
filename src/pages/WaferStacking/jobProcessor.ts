import { join as tauriJoin } from '@tauri-apps/api/path';
import { mkdir as tauriMkdir } from '@tauri-apps/plugin-fs';

import {
    invokeParseDieLayoutXls,
    invokeParseSubstrateDefectXls,
    invokeParseWafer,
    parseWaferMap,
    parseWaferMapEx,
} from '@/api/tauri/wafer';
import { getOemOffset } from '@/db/offsets';
import { getProductSize } from '@/db/productSize';
import type { OemProductOffset, ProductSize } from '@/db/types';
import {
    upsertWaferStackStats,
    type WaferStackStats,
} from '@/db/waferStackStats';
import type { JobItem } from '@/slices/job';
import { DataSourceType } from '@/types/dataSource';
import type {
    AsciiDie,
    BinMapData,
    DieLayoutMap,
    MapData,
    SubstrateDefectXlsResult,
    Wafer,
} from '@/types/ipc';
import { isNumberBin } from '@/types/ipc';
import {
    calculateStatsFromDies,
    extractBinMapHeader,
    extractMapDataHeader,
    extractWaferHeader,
    getLayerPriority,
} from '@/utils/waferSubstrateRenderer';
import { createPassValueSet } from '@/pages/Config/binConfig';

import { buildSelectedLayerKeySet, waferMapLayerKey } from './layerSelection';
import { exportWaferFiles, type WaferOutputConfig } from './outputHandler';
import { LayerMeta } from './priority';
import { countBinValues, formatDateTime } from './renderUtils';
import {
    alignStackingLayers,
    createSubstrateStackingLayer,
    mergeStackingLayers,
    sortStackingLayersByPriority,
    type ParsedStackingLayer,
} from './stackingLayers';

export type WaferStackingOutputId = 'mapEx' | 'bin' | 'HEX' | 'image' | 'fab' | 'SILAN';

export interface SubstrateDefect {
    x: number;
    y: number;
    w: number;
    h: number;
    class: string;
    area?: number;
    contrast?: number;
}

export interface WaferStackingJobOptions {
    outputDir: string;
    finalOutputDir: string;
    dieLayoutPath: string;
    selectedOutputs: WaferStackingOutputId[];
    selectedDefectClasses: string[];
    imageRenderer: 'bin' | 'substrate';
    edgeRemovalEnabled: boolean;
    goodBins: string[];
    edgeRemovalFailBins: string[];
    onFinalOutputDir?: (outputRootDir: string) => void;
}

export interface WaferStackingJobResult {
    jobId: string;
    outputRootDir: string;
    mergedDieCount: number;
}

interface WaferStackingJobLogger {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}

export interface WaferStackingJobDependencies {
    getOemOffset: (oemProductId: string) => Promise<OemProductOffset | null | undefined>;
    getProductSize: (oemProductId: string) => Promise<ProductSize | null | undefined>;
    parseWaferMapEx: (path: string) => Promise<MapData>;
    parseWaferMap: (path: string) => Promise<BinMapData>;
    invokeParseWafer: (path: string) => Promise<Wafer>;
    invokeParseSubstrateDefectXls: (path: string) => Promise<SubstrateDefectXlsResult>;
    invokeParseDieLayoutXls: (path: string) => Promise<DieLayoutMap>;
    upsertWaferStackStats: (stats: WaferStackStats) => Promise<unknown>;
    join: (...paths: string[]) => Promise<string>;
    mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
    exportWaferFiles: (config: WaferOutputConfig) => Promise<void>;
    now: () => Date;
    logger: WaferStackingJobLogger;
}

export const defaultWaferStackingJobDependencies: WaferStackingJobDependencies = {
    getOemOffset,
    getProductSize,
    parseWaferMapEx,
    parseWaferMap,
    invokeParseWafer,
    invokeParseSubstrateDefectXls,
    invokeParseDieLayoutXls,
    upsertWaferStackStats,
    join: tauriJoin,
    mkdir: tauriMkdir,
    exportWaferFiles,
    now: () => new Date(),
    logger: console,
};

type SelectedLayerInfo =
    | {
        layerType: 'substrate';
        filePath: string;
        stage: DataSourceType.Substrate;
    }
    | {
        layerType: 'map';
        filePath: string;
        stage: DataSourceType;
        subStage: string;
    };

function stageLabel(stage: string | DataSourceType, subStage: string = ''): string {
    switch (stage as DataSourceType) {
        case DataSourceType.Wlbi:
            return 'WLBI';
        case DataSourceType.CpProber:
            return 'CP' + subStage;
        case DataSourceType.Aoi:
            return 'AOI';
        case DataSourceType.FabCp:
            return 'FAB CP';
        default:
            return String(stage ?? 'Unknown');
    }
}

const getLayerInfoPriority = (layer: SelectedLayerInfo): number => {
    const layerMeta: LayerMeta = {
        stage: layer.stage,
        subStage: layer.layerType === 'map' ? layer.subStage : undefined,
    };
    return getLayerPriority(layerMeta);
};

const normalizeSubstrateDefects = (content: SubstrateDefectXlsResult): SubstrateDefect[] => {
    const plDefects = content['PL defect list'] || [];
    const surfaceDefects = content['Surface defect list'] || [];

    // Keep dimensions in micrometers; normalization to mm happens in generateGridWithSubstrateDefects.
    return [...plDefects, ...surfaceDefects].map((defect) => ({
        x: defect.x,
        y: defect.y,
        w: defect.w,
        h: defect.h,
        class: defect.class,
        area: defect.area,
        contrast: defect.contrast,
    }));
};

async function getStackingGeometry(
    oemProductId: string,
    deps: WaferStackingJobDependencies
): Promise<{
    currentSubstrateOffset: { x: number; y: number };
    currentDefectSizeOffset: { x: number; y: number };
    currentDieSize: { x: number; y: number };
}> {
    let currentSubstrateOffset = { x: 0, y: 0 };
    let currentDefectSizeOffset = { x: 0, y: 0 };
    let currentDieSize = { x: 1, y: 1 };

    if (!oemProductId) {
        return { currentSubstrateOffset, currentDefectSizeOffset, currentDieSize };
    }

    try {
        const offset = await deps.getOemOffset(oemProductId);
        const sizeData = await deps.getProductSize(oemProductId);
        if (offset) {
            currentSubstrateOffset = { x: offset.x_offset, y: offset.y_offset };
            currentDefectSizeOffset = { x: offset.defect_offset_x, y: offset.defect_offset_y };
        }
        if (sizeData) {
            currentDieSize = { x: sizeData.die_x, y: sizeData.die_y };
        }
    } catch (error) {
        throw new Error(`加载偏移量/尺寸失败: ${String(error)}`);
    }

    return { currentSubstrateOffset, currentDefectSizeOffset, currentDieSize };
}

function getSelectedLayerInfo(jobItem: JobItem): SelectedLayerInfo[] {
    const {
        waferSubstrate,
        waferMaps,
    } = jobItem;
    const selectedKeys = buildSelectedLayerKeySet(waferMaps, jobItem.selectedLayerKeys);

    return [
        ...((waferSubstrate && (jobItem.includeSubstrateSelected ?? !!waferSubstrate)) ? [{
            layerType: 'substrate' as const,
            filePath: waferSubstrate.file_path,
            stage: DataSourceType.Substrate as DataSourceType.Substrate,
        }] : []),
        ...waferMaps.filter((wm) => selectedKeys.has(waferMapLayerKey(wm))).map((wm) => ({
            layerType: 'map' as const,
            filePath: wm.file_path,
            stage: wm.stage as DataSourceType,
            subStage: wm.sub_stage || '',
        })),
    ];
}

async function loadLayoutDies(
    jobItem: JobItem,
    dieLayoutPath: string,
    deps: WaferStackingJobDependencies
): Promise<AsciiDie[] | undefined> {
    if (!dieLayoutPath) return undefined;

    try {
        const dieLayoutMap = await deps.invokeParseDieLayoutXls(dieLayoutPath);
        const keys = Object.keys(dieLayoutMap || {});
        return dieLayoutMap[jobItem.productId || '']?.dies ||
            dieLayoutMap[jobItem.oemProductId || '']?.dies ||
            (keys.length > 0 ? dieLayoutMap[keys[0]]?.dies : undefined);
    } catch (error) {
        deps.logger.warn('[wafer stacking] Failed to load die layout map; falling back to map files', error);
        return undefined;
    }
}

async function parseMapLayer(
    layer: Extract<SelectedLayerInfo, { layerType: 'map' }>,
    deps: WaferStackingJobDependencies
): Promise<{ name: string; header: Record<string, string>; dies: AsciiDie[] } | null> {
    const { filePath, stage } = layer;
    let header: Record<string, string> = {};
    let dies: AsciiDie[] = [];
    let layerName = 'Unknown';

    layerName =
        stage === DataSourceType.CpProber
            ? `CP${layer.subStage || ''}`
            : stageLabel(stage);

    if (stage === DataSourceType.CpProber) {
        const cpType = layer.subStage || '1';
        if (['1', '2'].includes(cpType)) {
            const content = await deps.parseWaferMapEx(filePath);
            if (content && content.map.dies) {
                header = extractMapDataHeader(content);
                dies = content.map.dies;
            }
        }
    } else if (stage === DataSourceType.Wlbi) {
        const content = await deps.parseWaferMap(filePath);
        if (content && content.map) {
            header = extractBinMapHeader(content);
            dies = content.map.map((die) => {
                if (isNumberBin(die.bin) && die.bin.number === 257) {
                    return { ...die, bin: { special: '*' } };
                }
                return die;
            });
        }
    } else if (stage === DataSourceType.Aoi) {
        const content = await deps.parseWaferMapEx(filePath);
        if (content && content.map.dies) {
            header = extractMapDataHeader(content);
            dies = content.map.dies;
        }
    } else if (stage === DataSourceType.FabCp) {
        const content = await deps.invokeParseWafer(filePath);
        if (content && content.map.dies) {
            header = extractWaferHeader(content);
            dies = content.map.dies;
        }
    }

    if (dies.length === 0) return null;

    return { name: layerName, header, dies };
}

function createStatsRecord(
    jobItem: JobItem,
    mergedDies: AsciiDie[],
    stats: ReturnType<typeof calculateStatsFromDies>,
    now: () => Date
): WaferStackStats {
    const binCounts = countBinValues(mergedDies);
    const binCountsObj = Object.fromEntries(binCounts);
    const binCountsStr = JSON.stringify(binCountsObj);
    const startTime = formatDateTime(now());
    const stopTime = formatDateTime(now());

    return {
        oem_product_id: jobItem.oemProductId!,
        batch_id: jobItem.batchId,
        wafer_id: jobItem.waferId!.toString(),
        total_tested: stats.totalTested,
        total_pass: stats.totalPass,
        total_fail: stats.totalFail,
        yield_percentage: stats.yieldPercentage,
        bin_counts: binCountsStr,
        start_time: startTime,
        stop_time: stopTime,
    };
}

export async function processWaferStackingJob(
    jobItem: JobItem,
    options: WaferStackingJobOptions,
    deps: WaferStackingJobDependencies = defaultWaferStackingJobDependencies
): Promise<WaferStackingJobResult> {
    const {
        currentSubstrateOffset,
        currentDefectSizeOffset,
        currentDieSize,
    } = await getStackingGeometry(jobItem.oemProductId, deps);

    const selectedLayerInfo = getSelectedLayerInfo(jobItem);
    if (selectedLayerInfo.length === 0) {
        throw new Error('未选择有效图层或图层无文件路径');
    }

    const sortedLayers = [...selectedLayerInfo].sort((a, b) =>
        getLayerInfoPriority(b) - getLayerInfoPriority(a)
    );
    const headers: Record<string, string>[] = [];
    const parsedLayers: ParsedStackingLayer[] = [];
    let cp1Header: Record<string, string> = {};
    const tempCombinedHeaders: Record<string, string> = {};
    let allSubstrateDefects: SubstrateDefect[] = [];
    let deferredSubstrateDefects: SubstrateDefect[] | null = null;
    const layoutDies = await loadLayoutDies(jobItem, options.dieLayoutPath, deps);

    if (layoutDies && layoutDies.length > 0) {
        parsedLayers.push({
            name: 'DieLayout',
            priority: 100,
            header: {},
            dies: layoutDies,
        });
        headers.push({ LayerType: 'DieLayout', Priority: 'Highest' });
    }

    for (const layer of sortedLayers) {
        if (!layer.filePath) continue;

        if (layer.layerType === 'substrate') {
            const content = await deps.invokeParseSubstrateDefectXls(layer.filePath);
            allSubstrateDefects = normalizeSubstrateDefects(content);
            const filteredSubstrateDefects = options.selectedDefectClasses.length > 0
                ? allSubstrateDefects.filter((defect) => options.selectedDefectClasses.includes(defect.class))
                : allSubstrateDefects;

            deps.logger.log('筛选后参与叠图的缺陷数:', filteredSubstrateDefects.length);
            deferredSubstrateDefects = filteredSubstrateDefects;
            continue;
        }

        const parsedLayer = await parseMapLayer(layer, deps);
        if (!parsedLayer) continue;

        Object.entries(parsedLayer.header).forEach(([key, value]) => {
            if (!(key in tempCombinedHeaders)) tempCombinedHeaders[key] = value;
        });

        if (layer.stage === DataSourceType.CpProber && (layer.subStage || '1') === '1') {
            cp1Header = { ...parsedLayer.header };
        }

        const layerMeta: LayerMeta = {
            stage: layer.stage,
            subStage: layer.subStage,
        };
        parsedLayers.push({
            name: parsedLayer.name,
            priority: getLayerPriority(layerMeta),
            header: parsedLayer.header,
            dies: parsedLayer.dies,
        });
        headers.push(parsedLayer.header);
    }

    if (deferredSubstrateDefects) {
        const substrateLayer = createSubstrateStackingLayer({
            baseLayer: parsedLayers[0],
            filteredSubstrateDefects: deferredSubstrateDefects,
            dieSize: { width: currentDieSize.x, height: currentDieSize.y },
            substrateOffset: currentSubstrateOffset,
            defectSizeOffset: currentDefectSizeOffset,
            layoutDies,
        });

        if (substrateLayer) {
            parsedLayers.push(substrateLayer);
            headers.push(substrateLayer.header);
        }
    }

    if (parsedLayers.length === 0) {
        throw new Error('没有有效的地图数据可供处理');
    }

    const passValues = createPassValueSet(options.goodBins);
    const orderedLayers = sortStackingLayersByPriority(parsedLayers);
    const alignedLayers = alignStackingLayers(orderedLayers);
    const mergedDies = mergeStackingLayers(alignedLayers, passValues);
    if (mergedDies.length === 0) {
        throw new Error('处理后地图为空');
    }

    const stats = calculateStatsFromDies(mergedDies, passValues);
    const statsToSave = createStatsRecord(jobItem, mergedDies, stats, deps.now);

    try {
        await deps.upsertWaferStackStats(statsToSave);
        deps.logger.log(`晶圆 ${jobItem.waferId} 统计数据已入库`);
    } catch (dbError) {
        deps.logger.warn(`晶圆 ${jobItem.waferId} 统计数据入库失败:`, dbError);
    }

    const baseFileName = `${jobItem.oemProductId}_${jobItem.productId}_${jobItem.batchId}_${jobItem.waferId}_${jobItem.subId}`;
    const useHeader = {
        ...tempCombinedHeaders,
        ...(cp1Header || headers[0] || {}),
    };
    const baseTargetDir = options.outputDir || options.finalOutputDir;
    const outputRootDir = await deps.join(baseTargetDir, baseFileName);
    try {
        await deps.mkdir(outputRootDir, { recursive: true });
        if (options.outputDir) {
            options.onFinalOutputDir?.(outputRootDir);
        }
    } catch (error) {
        throw new Error(`无法创建输出目录: ${error instanceof Error ? error.message : String(error)}`);
    }

    await deps.exportWaferFiles({
        baseFileName,
        outputRootDir,
        mergedDies,
        stats,
        useHeader,
        selectedOutputs: options.selectedOutputs,
        imageRenderer: options.imageRenderer,
        allSubstrateDefects,
        currentDieSize,
        currentSubstrateOffset,
        selectedPassBins: options.goodBins,
        edgeRemovalEnabled: options.edgeRemovalEnabled,
        edgeRemovalFailBins: options.edgeRemovalFailBins,
    });

    return {
        jobId: jobItem.id,
        outputRootDir,
        mergedDieCount: mergedDies.length,
    };
}

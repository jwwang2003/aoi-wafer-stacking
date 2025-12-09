import { join, desktopDir } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { IconDownload, IconRefresh, IconRepeat } from '@tabler/icons-react';
import { Title, Group, Container, Stack, Button, Text, SimpleGrid, Divider, Input, Checkbox, Radio, Progress, Badge, Card, Alert } from '@mantine/core';
import { PathPicker } from '@/components';
import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/Card/MetadataCard';
import JobManager from '@/components/JobManager';
import LayersSelector, { LayerChoice } from '@/components/Form/LayersSelector';
import { infoToast, errorToast } from '@/components/UI/Toaster';
import {
    getProductBinSelection,
    saveProductBinSelection,
    parseSelectedBins,
    stringifySelectedBins
} from '@/db/binSelection';
// DB
import { getOemOffset } from '@/db/offsets';
import { getProductSize } from '@/db/productSize';
import { upsertWaferStackStats } from '@/db/waferStackStats';
import { exportWaferStatsReport } from '@/utils/exportWaferReport';

// TYPES
import { ExcelType } from '@/types/wafer';
import { DataSourceType } from '@/types/dataSource';
import { toWaferFileMetadata } from '@/types/helpers';

import { JobItem, JobStatus, queueUpdateJob, queueSetActive, queueResetAllStatus, queueClearCompleted, queueClearAll } from '@/slices/job';

// WAFER
import {
    invokeParseWafer,
    parseWaferMapEx,
    parseWaferMap,
    invokeParseSubstrateDefectXls,
} from '@/api/tauri/wafer';
// IPC types for Tauri API calls
import { MapData, BinMapData, AsciiDie, Wafer, isNumberBin, SubstrateDefectXlsResult } from '@/types/ipc';

import { LayerMeta } from './priority';
import { exportWaferFiles } from './outputHandler';
import { generateGridWithSubstrateDefects } from './substrateMapping'

import {
    getLayerPriority,
    extractAlignmentMarkers,
    calculateOffset,
    createDieMapStructure,
    mergeLayerToDieMap,
    pruneEmptyRegions,
    calculateStatsFromDies,
    applyOffsetToDies,
    extractWaferHeader,
    extractMapDataHeader,
    extractBinMapHeader,
} from './waferAlgorithm';
import { countBinValues, formatDateTime } from './renderUtils';

export type OutputId = 'mapEx' | 'bin' | 'HEX' | 'image';
export type BinId = 'Unclassified' | 'Particle' | 'Pit' | 'Bump' | 'MicroPipe' | 'Line' | 'Carrot' | 'Triangle' | 'Downfall' | 'Scratch' | 'PL_Black' | 'PL_White' | 'PL_BPD' | 'PL_SF' | 'PL_BSF';

const ALL_BINS = [
    'Unclassified',
    'Particle',
    'Pit',
    'Bump',
    'MicroPipe',
    'Line',
    'Carrot',
    'Triangle',
    'Downfall',
    'Scratch',
    'PL_Black',
    'PL_White',
    'PL_BPD',
    'PL_SF',
    'PL_BSF'
];
export type OutputOption = {
    id: OutputId;
    label: string;
    disabled?: boolean;
};

export type OutputOption2 = {
    id: BinId;
    label: string;
    disabled?: boolean;
};

const OUTPUT_OPTIONS = [
    { id: 'mapEx', label: 'WaferMapEx' },
    { id: 'bin', label: 'BinMap' },
    { id: 'HEX', label: 'HexMap' },
    { id: 'image', label: 'Image' },
] as const satisfies readonly OutputOption[];

const OUTPUT_OPTIONS2 = [
    { id: 'Unclassified', label: 'Unclassified' },
    { id: 'Particle', label: 'Particle' },
    { id: 'Pit', label: 'Pit' },
    { id: 'Bump', label: 'Bump' },
    { id: 'MicroPipe', label: 'MicroPipe' },
    { id: 'Line', label: 'Line' },
    { id: 'Carrot', label: 'Carrot' },
    { id: 'Triangle', label: 'Triangle' },
    { id: 'Downfall', label: 'Downfall' },
    { id: 'Scratch', label: 'Scratch' },
    { id: 'PL_Black', label: 'PL_Black' },
    { id: 'PL_White', label: 'PL_White' },
    { id: 'PL_BPD', label: 'PL_BPD' },
    { id: 'PL_SF', label: 'PL_SF' },
    { id: 'PL_BSF', label: 'PL_BSF' },
] as const satisfies readonly OutputOption2[];

function stageLabel(
    stage: string | DataSourceType,
    subStage: string = ''
): string {
    switch (stage as DataSourceType) {
        case DataSourceType.Wlbi:
            return 'WLBI';
        case DataSourceType.CpProber:
            return 'CP' + subStage;
        case DataSourceType.Aoi:
            return 'AOI';
        default:
            return String(stage ?? 'Unknown');
    }
}

const asDefectClass = (binId: BinId): string => binId as string;

const statusStyles: Record<JobStatus, { color: string; label: string }> = {
    queued: { color: 'blue', label: '等待中' },
    active: { color: 'orange', label: '处理中' },
    done: { color: 'green', label: '已完成' },
    error: { color: 'red', label: '出错' }
};

export default function WaferStacking() {
    const [layerChoice, setLayerChoice] = useState<LayerChoice>({ includeSubstrate: false, maps: [] });
    const [processing, setProcessing] = useState(false);
    const [finalOutputDir, setFinalOutputDir] = useState<string>('');
    const [substrateOffset, setSubstrateOffset] = useState({ x: 0, y: 0 });
    const [imageRenderer, setImageRenderer] = useState<'bin' | 'substrate'>('bin');
    const [batchProcessing, setBatchProcessing] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [batchErrors, setBatchErrors] = useState<Array<{ id: string; message: string }>>([]);
    const [exportAsciiDieData, setExportAsciiDieData] = useState(false);

    const [selectedOutputs, setSelectedOutputs] = useState<OutputId[]>([
        'mapEx',
        'HEX',
        'bin',
        'image',
    ]);

    const [selectedOutputs2, setSelectedOutputs2] = useState<BinId[]>([
        'Unclassified',
        'Particle',
        'Pit',
        'Bump',
        'MicroPipe',
        'Line',
        'Carrot',
        'Triangle',
        'Downfall',
        'Scratch',
        'PL_Black',
        'PL_White',
        'PL_BPD',
        'PL_SF',
        'PL_BSF'
    ]);

    const [outputDir, setOutputDir] = useState<string>('');

    const dispatch = useAppDispatch();
    const jobState = useAppSelector((s) => s.stackingJob);
    const { queue } = jobState;
    const currentJob = jobState;

    const {
        oemProductId: jobOemId,
        productId: jobProductId,
        batchId: jobBatchId,
        waferId: jobWaferId,
        subId: jobSubId,
        waferSubstrate: jobSubstrate
    } = currentJob;

    useEffect(() => {
        if (!jobOemId) return;

        const loadBinSelection = async () => {
            const selection = await getProductBinSelection(jobOemId);
            const parsed = parseSelectedBins(selection.selected_bin_ids, ALL_BINS);
            setSelectedOutputs2(parsed as BinId[]);
        };

        loadBinSelection();
    }, [jobOemId]);

    useEffect(() => {
        if (!jobOemId) return;

        const saveSelection = async () => {
            const stringified = stringifySelectedBins(selectedOutputs2, ALL_BINS);
            await saveProductBinSelection({
                oem_product_id: jobOemId,
                selected_bin_ids: stringified
            });
        };

        const timer = setTimeout(saveSelection, 500);
        return () => clearTimeout(timer);
    }, [jobOemId, selectedOutputs2]);


    useEffect(() => {
        if (!jobOemId) return;
        let cancelled = false;
        (async () => {
            try {
                const offset = await getOemOffset(jobOemId);
                if (cancelled) return;
                if (offset) {
                    setSubstrateOffset({ x: offset.x_offset, y: offset.y_offset });
                }
            } catch (e) {
                errorToast({ title: '读取失败', message: `加载偏移量/尺寸失败: ${String(e)}` });
            }
        })();
        return () => { cancelled = true; };
    }, [jobOemId]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (outputDir) return;
                const desktop = await desktopDir();
                if (alive && desktop) setOutputDir(desktop);
            } catch {/* 忽略错误 */ }
        })();
        return () => {
            alive = false;
        };
    }, [outputDir]);

    const processSingleJob = async (jobItem: JobItem, exportAsciiData: boolean = false) => {
        dispatch(queueUpdateJob({
            id: jobItem.id,
            changes: { status: 'active' }
        }));

        try {
            const {
                oemProductId,
                productId,
                batchId,
                waferId,
                subId,
                waferSubstrate,
                waferMaps,
            } = jobItem;

            let currentSubstrateOffset = { x: 0, y: 0 };
            let currentDefectSizeOffset = { x: 0, y: 0 };
            // Default to 1mm x 1mm when no DB record exists
            let currentDieSize = { x: 1, y: 1 };
            if (oemProductId) {
                try {
                    const offset = await getOemOffset(oemProductId);
                    const sizeData = await getProductSize(oemProductId);
                    if (offset) {
                        currentSubstrateOffset = { x: offset.x_offset, y: offset.y_offset };
                        currentDefectSizeOffset = { x: offset.defect_offset_x, y: offset.defect_offset_y };
                    }
                    if (sizeData) {
                        currentDieSize = { x: sizeData.die_x, y: sizeData.die_y };
                    }

                } catch (e) {
                    throw new Error(`加载偏移量/尺寸失败: ${String(e)}`);
                }
            }

            // Build selection using stage|substage keys to match job.selectedLayerKeys
            const keyOf = (wm: typeof waferMaps[number]) => `${String(wm.stage ?? '').toLowerCase()}|${wm.sub_stage == null ? '' : String(wm.sub_stage)}`;
            const candidateKeys = new Set(waferMaps.map(keyOf));
            const selectedKeys = (jobItem.selectedLayerKeys && jobItem.selectedLayerKeys.length > 0)
                ? new Set(jobItem.selectedLayerKeys.filter((k) => candidateKeys.has(String(k))))
                : candidateKeys; // fallback: all candidates

            const selectedLayerInfo = [
                ...((waferSubstrate && (jobItem.includeSubstrateSelected ?? !!waferSubstrate)) ? [{
                    layerType: 'substrate' as const,
                    filePath: waferSubstrate.file_path,
                    stage: DataSourceType.Substrate,
                }] : []),
                ...waferMaps.filter((wm) => selectedKeys.has(keyOf(wm))).map((wm) => ({
                    layerType: 'map' as const,
                    filePath: wm.file_path,
                    stage: wm.stage as DataSourceType,
                    subStage: wm.sub_stage || '',
                })),
            ];

            if (selectedLayerInfo.length === 0) {
                throw new Error('未选择有效图层或图层无文件路径');
            }

            const sortedLayers = selectedLayerInfo.sort((a, b) => {
                const getPriority = (layer: typeof a) => {
                    const layerMeta: LayerMeta = ({
                        stage: layer.stage as DataSourceType,
                        subStage: layer.layerType === 'map' ? layer.subStage : undefined,
                    });
                    return getLayerPriority(layerMeta);
                };
                const aPriority = getPriority(a);
                const bPriority = getPriority(b);
                return bPriority - aPriority;
            });

            const baseTargetDir = outputDir || finalOutputDir;
            const headers: Record<string, string>[] = [];
            const originalDiesList: AsciiDie[][] = [];
            const formatNamesList: string[] = [];
            let cp1Header: Record<string, string> = {};
            const tempCombinedHeaders: Record<string, string> = {};
            let allSubstrateDefects: Array<{ x: number, y: number, w: number, h: number, class: string }> = [];

            for (const layer of sortedLayers) {
                const { filePath, layerType, stage } = layer;
                if (!filePath) continue;

                let content: SubstrateDefectXlsResult | BinMapData | MapData | Wafer | null = null;
                let header: Record<string, string> = {};
                let dies: AsciiDie[] = [];
                let layerName = 'Unknown';

                if (layerType === 'map' && stage) {
                    layerName =
                        stage === DataSourceType.CpProber
                            ? `CP${layer.subStage || ''}`
                            : stageLabel(stage);
                    if (stage === DataSourceType.CpProber) {
                        const cpType = layer.subStage || '1';
                        if (['1', '2'].includes(cpType)) {
                            content = await parseWaferMapEx(filePath);
                            if (content && content.map.dies) {
                                header = extractMapDataHeader(content);
                                dies = content.map.dies;
                                if (cpType === '1') cp1Header = { ...header };
                            }
                        } else if (cpType === '3') {
                            content = await invokeParseWafer(filePath);
                            if (content && content.map.dies) {
                                header = extractWaferHeader(content);
                                dies = content.map.dies;
                            }
                        }
                    } else if (stage === DataSourceType.Wlbi) {
                        content = await parseWaferMap(filePath);
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
                        content = await parseWaferMapEx(filePath);
                        if (content && content.map.dies) {
                            header = extractMapDataHeader(content);
                            dies = content.map.dies;
                        }
                    }
                }

                if (layerType === 'substrate') {
                    layerName = 'Substrate';
                    content = await invokeParseSubstrateDefectXls(filePath);
                    if (content) {
                        allSubstrateDefects = [];
                        const plDefects = content['PL defect list'] || [];
                        const surfaceDefects = content['Surface defect list'] || [];
                        allSubstrateDefects = [
                            ...plDefects.map(defect => ({
                                x: defect.x,
                                y: defect.y,
                                w: defect.w / 1000,
                                h: defect.h / 1000,
                                class: defect.class,
                                area: defect.area,
                                contrast: defect.contrast
                            })),
                            ...surfaceDefects.map(defect => ({
                                x: defect.x,
                                y: defect.y,
                                w: defect.w / 1000,
                                h: defect.h / 1000,
                                class: defect.class,
                                area: defect.area,
                                contrast: defect.contrast
                            }))
                        ];


                        const selectedClasses = selectedOutputs2.map(asDefectClass);
                        const filteredSubstrateDefects = selectedClasses.length > 0
                            ? allSubstrateDefects.filter(defect => selectedClasses.includes(defect.class))
                            : allSubstrateDefects;

                        console.log('筛选后参与叠图的缺陷数:', filteredSubstrateDefects.length);

                        dies = generateGridWithSubstrateDefects(
                            originalDiesList[0] || [],
                            filteredSubstrateDefects,
                            selectedOutputs2,
                            currentSubstrateOffset.x,
                            currentSubstrateOffset.y,
                            currentDefectSizeOffset.x,
                            currentDefectSizeOffset.y
                        );
                    }
                }

                if (!content || dies.length === 0) continue;

                Object.entries(header).forEach(([key, value]) => {
                    if (!(key in tempCombinedHeaders)) tempCombinedHeaders[key] = value;
                });
                originalDiesList.push(dies);
                formatNamesList.push(layerName);
                headers.push(header);
            }

            if (originalDiesList.length === 0) {
                throw new Error('没有有效的地图数据可供处理');
            }

            const alignedDiesList: AsciiDie[][] = [];
            const baseDies = originalDiesList[0];
            const baseMarkers = extractAlignmentMarkers(baseDies).sort(
                (a, b) => a.y - b.y || a.x - b.x
            );
            alignedDiesList.push(baseDies);

            for (let i = 1; i < originalDiesList.length; i++) {
                const currentDies = originalDiesList[i];
                const currentMarkers = extractAlignmentMarkers(currentDies);
                const { dx, dy } = calculateOffset(baseMarkers, currentMarkers);
                alignedDiesList.push(applyOffsetToDies(currentDies, dx, dy));
            }

            const { dieMap } = createDieMapStructure(alignedDiesList);
            alignedDiesList.forEach((dies, index) => {
                const layer = sortedLayers[index];
                if (!layer.stage) return;
                const layerMeta: LayerMeta = {
                    stage: layer.stage,
                    subStage: layer.layerType === 'map' ? layer.subStage : undefined,
                };
                const priority = getLayerPriority(layerMeta);
                mergeLayerToDieMap(dieMap, dies, priority);
            });

            const mergedDies = pruneEmptyRegions(dieMap);
            if (mergedDies.length === 0) {
                throw new Error('处理后地图为空');
            }

            const stats = calculateStatsFromDies(mergedDies);

            const binCounts = countBinValues(mergedDies);
            const binCountsObj = Object.fromEntries(binCounts);
            const binCountsStr = JSON.stringify(binCountsObj);
            const startTime = formatDateTime(new Date());
            const stopTime = formatDateTime(new Date());
            formatDateTime(new Date());
            const statsToSave = {
                oem_product_id: oemProductId!,
                batch_id: batchId,
                wafer_id: waferId.toString(),
                total_tested: stats.totalTested,
                total_pass: stats.totalPass,
                total_fail: stats.totalFail,
                yield_percentage: stats.yieldPercentage,
                bin_counts: binCountsStr,
                start_time: startTime,
                stop_time: stopTime
            };

            try {
                await upsertWaferStackStats(statsToSave);
                console.log(`晶圆 ${waferId} 统计数据已入库`);
            } catch (dbError) {
                console.warn(`晶圆 ${waferId} 统计数据入库失败:`, dbError);
            }

            const baseFileName = `${oemProductId}_${productId}_${batchId}_${waferId}_${subId}`;
            const useHeader = {
                ...tempCombinedHeaders,
                ...(cp1Header || headers[0] || {}),
            };
            const outputRootDir = await join(baseTargetDir, baseFileName);
            try {
                await mkdir(outputRootDir, { recursive: true });
                if (outputDir) {
                    setFinalOutputDir(outputRootDir);
                }
            } catch (error) {
                throw new Error(`无法创建输出目录: ${error instanceof Error ? error.message : String(error)}`);
            }

            await exportWaferFiles({
                baseFileName,
                outputRootDir,
                mergedDies,
                stats,
                useHeader,
                selectedOutputs,
                imageRenderer,
                allSubstrateDefects,
                currentDieSize,
                currentSubstrateOffset,
                exportAsciiData,
            });

            dispatch(queueUpdateJob({
                id: jobItem.id,
                changes: { status: 'done' }
            }));
            return { success: true, jobId: jobItem.id };
        } catch (error) {
            dispatch(queueUpdateJob({
                id: jobItem.id,
                changes: { status: 'error' }
            }));
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                jobId: jobItem.id,
                message: errorMsg
            };
        }
    };

    const processMapping = async () => {
        if (!jobOemId || !jobProductId) {
            errorToast({ title: '无任务', message: '请先选择一个有效的数据集' });
            return;
        }
        setProcessing(true);
        try {
            const tempJob: JobItem = {
                id: 'current',
                createdAt: Date.now(),
                status: 'active',
                oemProductId: jobOemId,
                productId: jobProductId,
                batchId: jobBatchId,
                waferId: jobWaferId,
                subId: jobSubId,
                waferSubstrate: layerChoice.includeSubstrate ? jobSubstrate : null,
                waferMaps: layerChoice.maps,
            };

            const result = await processSingleJob(tempJob, exportAsciiDieData);
            if (result.success) {
                infoToast({ title: '成功', message: '当前任务处理完成' });
            } else {
                errorToast({ title: '处理失败', message: result.message });
            }
        } catch (error) {
            errorToast({ title: '处理失败', message: error instanceof Error ? error.message : String(error) });
        } finally {
            setProcessing(false);
        }
    };

    const handleBatchProcess = async () => {
        const jobsToProcess = [...queue];
        if (jobsToProcess.length === 0) {
            errorToast({
                title: '无任务可处理',
                message: '任务队列为空'
            });
            return;
        }
        setBatchProcessing(true);
        setBatchProgress({ current: 0, total: jobsToProcess.length });
        setBatchErrors([]);

        for (let i = 0; i < jobsToProcess.length; i++) {
            const jobItem = jobsToProcess[i];
            try {
                const result = await processSingleJob(jobItem, exportAsciiDieData);
                if (!result.success) {
                    setBatchErrors(prev => [...prev, {
                        id: result.jobId,
                        message: result.message || ''
                    }]);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                setBatchErrors(prev => [...prev, {
                    id: jobItem.id,
                    message: errorMsg
                }]);
            } finally {
                setBatchProgress(prev => ({ ...prev, current: i + 1 }));
            }
        }

        setBatchProcessing(false);
        if (batchErrors.length > 0) {
            errorToast({
                title: '批量处理完成',
                message: `共 ${jobsToProcess.length} 个任务，成功 ${jobsToProcess.length - batchErrors.length} 个，失败 ${batchErrors.length} 个`
            });
        } else {
            infoToast({
                title: '批量处理完成',
                message: `全部 ${jobsToProcess.length} 个任务处理成功`
            });
        }
        await exportWaferStatsReport(jobOemId, outputDir);
    };

    return (
        <Container fluid p='md'>
            <Stack gap='md'>
                <Title order={1}>晶圆叠图</Title>

                <Title order={2}>输出设置</Title>
                <Stack>
                    <Checkbox.Group
                        label='选择导出格式'
                        value={selectedOutputs}
                        onChange={(vals) => setSelectedOutputs(vals as OutputId[])}
                    >
                        <Group gap='md' mt='xs'>
                            {OUTPUT_OPTIONS.map((opt) => (
                                <Checkbox
                                    key={opt.id}
                                    value={opt.id}
                                    label={opt.label}
                                />
                            ))}
                        </Group>
                    </Checkbox.Group>

                    <Checkbox.Group
                        label='选择参与叠图的BIN/缺陷类别'
                        value={selectedOutputs2}
                        onChange={(vals) => setSelectedOutputs2(vals as BinId[])}
                        mt='md'
                    >
                        <SimpleGrid cols={3} spacing='sm' mt='xs'>
                            {OUTPUT_OPTIONS2.map((opt) => (
                                <Checkbox
                                    key={opt.id}
                                    value={opt.id}
                                    label={opt.label}
                                />
                            ))}
                        </SimpleGrid>
                    </Checkbox.Group>

                    {selectedOutputs.includes('image') && (
                        <Radio.Group
                            label='图像渲染器'
                            value={imageRenderer}
                            onChange={(v) => {
                                const next = (v as 'bin' | 'substrate') || 'bin';
                                // 禁用“真实衬底样式”，强制为 bin
                                setImageRenderer(next === 'substrate' ? 'bin' : next);
                            }}
                        >
                            <Group gap='md' mt='xs'>
                                <Radio value='bin' label='方块 (Bin颜色)' />
                                <Radio value='substrate' label='真实衬底样式' disabled />
                            </Group>
                        </Radio.Group>
                    )}

                    {/* Top-level output directory selector with Desktop default */}
                    <Group align='end' grow>
                        <PathPicker
                            label='输出目录'
                            placeholder='默认：桌面(Desktop)'
                            value={outputDir}
                            onChange={(e) => setOutputDir(e)}
                            readOnly
                        />
                    </Group>
                </Stack>

                <Divider />

                <Group align='flex-start'>
                    {/* 右侧：任务列表区 → 嵌入 JobManager */}
                    <Stack w='25%' gap='sm'>
                        <Title order={3}>待处理任务</Title>
                        <JobManager disableAddFromCurrent />
                        {batchProcessing && (
                            <Stack gap='sm'>
                                <Progress
                                    value={(batchProgress.current / batchProgress.total) * 100}
                                />
                                <Text size='sm'>
                                    正在处理第 {batchProgress.current} 个任务
                                </Text>
                            </Stack>
                        )}
                        {!batchProcessing && batchErrors.length > 0 && (
                            <Text size='sm'>
                                有 {batchErrors.length} 个任务处理失败
                            </Text>
                        )}
                        {!batchProcessing && queue.length > 0 && (
                            <Group gap="sm" wrap="wrap">
                                {Object.entries(statusStyles).map(([status, { color, label }]) => {
                                    const count = queue.filter(j => j.status === status).length;
                                    return count > 0 && (
                                        <Badge key={status} color={color}>
                                            {label}: {count}
                                        </Badge>
                                    );
                                })}
                            </Group>
                        )}
                        {/* Queue operations */}
                        <Group gap="xs" wrap="wrap">
                            <Button
                                size="xs"
                                variant="light"
                                onClick={() => dispatch(queueSetActive(null))}
                                disabled={!jobState.activeId}
                            >
                                取消激活
                            </Button>
                            <Button
                                size="xs"
                                variant="light"
                                color="blue"
                                onClick={() => dispatch(queueResetAllStatus())}
                                disabled={queue.length === 0}
                            >
                                重置状态
                            </Button>
                            <Button
                                size="xs"
                                variant="light"
                                color="orange"
                                onClick={() => dispatch(queueClearCompleted())}
                                disabled={!queue.some(j => j.status === 'done')}
                            >
                                清除已完成
                            </Button>
                            <Button
                                size="xs"
                                variant="light"
                                color="red"
                                onClick={() => dispatch(queueClearAll())}
                                disabled={queue.length === 0}
                            >
                                清空全部
                            </Button>
                        </Group>
                    </Stack>

                    <Stack style={{ flex: 1, minWidth: 0 }}>
                        {(jobOemId && jobProductId && jobWaferId != null) ? (
                            <Card
                                withBorder
                                radius="lg"
                                p="sm"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderColor: 'var(--mantine-color-blue-5)',
                                    boxShadow: '0 0 0 1px var(--mantine-color-blue-1) inset',
                                }}
                            >
                                <Title order={4}>当前Wafer数据</Title>
                                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing='md'>
                                    {layerChoice.includeSubstrate && jobSubstrate && (
                                        <ExcelMetadataCard
                                            data={{
                                                ...jobSubstrate,
                                                type: ExcelType.DefectList,
                                                stage: DataSourceType.Substrate,
                                                filePath: jobSubstrate.file_path,
                                                lastModified: 0,
                                            }}
                                        />
                                    )}
                                    {layerChoice.maps.map((r, i) => (
                                        <WaferFileMetadataCard
                                            key={`${r.idx}-${i}`}
                                            data={toWaferFileMetadata(r)}
                                        />
                                    ))}
                                </SimpleGrid>
                            </Card>
                        ) : (
                            <Text>先前往数据库选择一个有效的数据集</Text>
                        )}

                        <Divider />

                        <Stack gap='sm'>
                            <LayersSelector onChange={setLayerChoice} />
                            {layerChoice.includeSubstrate && (
                                <Stack style={{ flex: 1, minWidth: 0 }} gap="sm">
                                    <Group align="center" gap="sm">
                                        <Text size="sm">偏移补偿(X, Y):</Text>
                                        <Input
                                            type="number"
                                            placeholder="X偏移"
                                            value={substrateOffset.x}
                                            onChange={(e) => setSubstrateOffset({ ...substrateOffset, x: parseFloat(e.target.value) || 0 })}
                                            style={{ width: '80px' }}
                                            step="0.001"
                                            disabled={true}
                                        />
                                        <Input
                                            type="number"
                                            placeholder="Y偏移"
                                            value={substrateOffset.y}
                                            onChange={(e) => setSubstrateOffset({ ...substrateOffset, y: parseFloat(e.target.value) || 0 })}
                                            style={{ width: '80px' }}
                                            step="0.001"
                                            disabled={true}
                                        />
                                    </Group>
                                </Stack>
                            )}
                        </Stack>
                        <Group align='end' grow>
                            <Checkbox
                                checked={exportAsciiDieData}
                                onChange={(e) => setExportAsciiDieData(e.target.checked)}
                                label="失效DIE边缘去除"
                                disabled={processing || batchProcessing}
                                size="sm"
                            />
                            <Button
                                color='blue'
                                leftSection={processing ? <IconRefresh size={16} /> : <IconDownload size={16} />}
                                loading={processing}
                                onClick={processMapping}
                                disabled={selectedOutputs.length === 0 || !jobOemId || jobWaferId == null}
                            >
                                处理当前
                            </Button>
                            <Button
                                color='green'
                                onClick={handleBatchProcess}
                                disabled={batchProcessing || queue.length === 0}
                                leftSection={batchProcessing ? <IconRefresh size={16} /> : <IconRepeat size={16} />}
                            >
                                批量队列
                            </Button>
                        </Group>
                    </Stack>
                </Group>
            </Stack>
        </Container>
    );
}
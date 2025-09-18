import { join, desktopDir } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { IconDownload, IconRefresh, IconRepeat } from '@tabler/icons-react';
import { Title, Group, Container, Stack, Button, Text, SimpleGrid, Divider, Input, Checkbox, Radio, Progress, Badge } from '@mantine/core';
import { PathPicker } from '@/components';
import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/MetadataCard';
import JobManager from '@/components/JobManager';
import LayersSelector, { LayerChoice } from '@/components/LayersSelector';
import { infoToast, errorToast } from '@/components/Toaster';

// DB
import { getOemOffset } from '@/db/offsets';
import { getProductSize } from '@/db/productSize';

// TYPES
import { ExcelType } from '@/types/wafer';
import { DataSourceType } from '@/types/dataSource';
import { toWaferFileMetadata } from '@/types/helpers';

import { JobItem, JobStatus, queueUpdateJob } from '@/slices/job';

// WAFER
import {
    exportWaferHex,
    exportWaferMapData,
    exportWaferBin,
    invokeParseWafer,
    parseWaferMapEx,
    parseWaferMap,
    invokeParseSubstrateDefectXls,
    exportWaferJpg,
} from '@/api/tauri/wafer';
// IPC types for Tauri API calls
import { MapData, BinMapData, AsciiDie, Wafer, isNumberBin, SubstrateDefectXlsResult } from '@/types/ipc';

import { generateGridWithSubstrateDefects } from './substrateMapping'
import { renderAsJpg, renderSubstrateAsJpg } from './renderUtils';

import { LayerMeta } from './priority';

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
    convertToMapData,
    convertToBinMapData,
    convertToHexMapData,
} from './waferAlgorithm';


type OutputId = 'mapEx' | 'bin' | 'HEX' | 'image';

type OutputOption = {
    id: OutputId;
    label: string;
    disabled?: boolean;
};

const OUTPUT_OPTIONS = [
    { id: 'mapEx', label: 'WaferMapEx' },
    { id: 'bin', label: 'BinMap' },
    { id: 'HEX', label: 'HexMap' },
    { id: 'image', label: 'Image' },
] as const satisfies readonly OutputOption[];

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
        waferSubstrate: jobSubstrate,
        waferMaps: jobWaferMaps,
    } = currentJob;

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

    const processSingleJob = async (jobItem: JobItem) => {
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
            let currentDieSize = { x: 0, y: 0 };
            if (oemProductId) {
                try {
                    const offset = await getOemOffset(oemProductId);
                    const sizeData = await getProductSize(oemProductId);
                    if (offset) {
                        currentSubstrateOffset = { x: offset.x_offset, y: offset.y_offset };
                    }
                    if (sizeData) {
                        currentDieSize = { x: sizeData.die_x, y: sizeData.die_y };
                    }
                } catch (e) {
                    throw new Error(`加载偏移量/尺寸失败: ${String(e)}`);
                }
            }

            const selectedLayerInfo = [
                ...(waferSubstrate ? [{
                    layerType: 'substrate' as const,
                    filePath: waferSubstrate.file_path,
                    stage: DataSourceType.Substrate
                }] : []),
                ...waferMaps.map((wm) => ({
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
                        const plDefects = content['PL defect list'] || [];
                        const surfaceDefects = content['Surface defect list'] || [];
                        allSubstrateDefects = [
                            ...plDefects.map(defect => ({
                                x: defect.x,
                                y: defect.y,
                                w: defect.w / 1000,
                                h: defect.h / 1000,
                                class: defect.class
                            })),
                            ...surfaceDefects.map(defect => ({
                                x: defect.x,
                                y: defect.y,
                                w: defect.w / 1000,
                                h: defect.h / 1000,
                                class: defect.class
                            }))
                        ];
                        dies = generateGridWithSubstrateDefects(originalDiesList[0], allSubstrateDefects, currentSubstrateOffset.x, currentSubstrateOffset.y);
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
                alignedDiesList.push(
                    applyOffsetToDies(currentDies, dx, dy)
                );
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
            const baseFileName = `${oemProductId}_${productId}_${batchId}_${waferId}_${subId}`;
            const useHeader = {
                ...tempCombinedHeaders,
                ...(cp1Header || headers[0] || {}),
            };
            const outputRootDir = await join(baseTargetDir, '输出文件', baseFileName);
            try {
                await mkdir(outputRootDir, { recursive: true });
                if (outputDir) {
                    setFinalOutputDir(outputRootDir);
                }
            } catch (error) {
                throw new Error(`无法创建输出目录: ${error instanceof Error ? error.message : String(error)}`);
            }

            if (selectedOutputs.includes('mapEx')) {
                const mapExData = convertToMapData(mergedDies, stats, useHeader);
                const mapExPath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.txt`
                );
                await exportWaferMapData(mapExData, mapExPath);
            }

            if (selectedOutputs.includes('HEX')) {
                const hexData = convertToHexMapData(mergedDies, useHeader);
                const hexPath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.sinf`
                );
                await exportWaferHex(hexData, hexPath);
            }

            if (selectedOutputs.includes('bin')) {
                const binData = convertToBinMapData(mergedDies, useHeader);
                const binPath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.WaferMap`
                );
                await exportWaferBin(binData, binPath);
            }

            if (selectedOutputs.includes('image')) {
                const imagePath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.jpg`
                );
                const imageData = imageRenderer === 'substrate'
                    ? await renderSubstrateAsJpg(mergedDies, allSubstrateDefects, currentDieSize.x, currentDieSize.y, currentSubstrateOffset, useHeader)
                    : await renderAsJpg(mergedDies, allSubstrateDefects, currentDieSize.x, currentDieSize.y, currentSubstrateOffset, useHeader);
                await exportWaferJpg(imageData, imagePath);
            }

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

            const result = await processSingleJob(tempJob);
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
                const result = await processSingleJob(jobItem);
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
    };

    const [selectedOutputs, setSelectedOutputs] = useState<OutputId[]>([
        'mapEx',
        'HEX',
        'bin',
        'image',
    ]);
    const [outputDir, setOutputDir] = useState<string>('');

    // Default output directory to user's Desktop if not chosen
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (outputDir) return; // respect already selected value
                const desktop = await desktopDir();
                if (alive && desktop) setOutputDir(desktop);
            } catch {/* noop */ }
        })();
        return () => {
            alive = false;
        };
    }, [outputDir]);

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

                    {selectedOutputs.includes('image') && (
                        <Radio.Group
                            label='图像渲染器'
                            value={imageRenderer}
                            onChange={(v) => setImageRenderer((v as 'bin' | 'substrate') || 'substrate')}
                        >
                            <Group gap='md' mt='xs'>
                                <Radio value='substrate' label='Substrate 样式' />
                                <Radio value='bin' label='Bin 颜色' />
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
                    </Stack>
                    <Stack style={{ flex: 1, minWidth: 0 }}>
                        {jobOemId && jobProductId ? (
                            <>
                                <Title order={4}>当前Wafer数据</Title>
                                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing='md'>
                                    {jobWaferMaps.map((r, i) => (
                                        <WaferFileMetadataCard
                                            key={`${r.idx}-${i}`}
                                            data={toWaferFileMetadata(r)}
                                        />
                                    ))}
                                    {jobSubstrate && (
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
                                </SimpleGrid>
                            </>
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
                            <Button
                                color='blue'
                                leftSection={
                                    processing ? (
                                        <IconRefresh size={16} />
                                    ) : (
                                        <IconDownload size={16} />
                                    )
                                }
                                loading={processing}
                                onClick={processMapping}
                                disabled={selectedOutputs.length === 0 || !jobOemId}
                            >
                                处理当前
                            </Button>
                            <Button
                                color='green'
                                onClick={handleBatchProcess}
                                disabled={batchProcessing}
                                leftSection={batchProcessing ? <IconRefresh size={16} /> : <IconRepeat size={16} />}
                            >
                                批量处理
                            </Button>
                        </Group>
                    </Stack>
                </Group>
            </Stack>
        </Container>
    );
}
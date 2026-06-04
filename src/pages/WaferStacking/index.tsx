import { desktopDir } from '@tauri-apps/api/path';
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { IconDownload, IconRefresh, IconRepeat } from '@tabler/icons-react';
import { Title, Group, Container, Stack, Button, Text, SimpleGrid, Divider, Input, Checkbox, Radio, Progress, Badge, Card, Box } from '@mantine/core';
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
import { exportWaferStatsReport } from '@/utils/exportWaferReport';
import { colorMap } from '@/components/Substrate/constants';

// TYPES
import { ExcelType } from '@/types/wafer';
import { DataSourceType } from '@/types/dataSource';
import { toWaferFileMetadata } from '@/types/helpers';

import { JobItem, JobStatus, queueUpdateJob, queueSetActive, queueResetAllStatus, queueClearCompleted, queueClearAll } from '@/slices/job';

import { DEFAULT_BIN_VALUES_CONFIG } from '@/pages/Config/binConfig';
import { buildBatchCompletionSummary, type BatchProcessingError } from './batchResults';
import {
    processWaferStackingJob,
    type WaferStackingOutputId,
} from './jobProcessor';

interface BinValue {
    id: string;
    label: string;
    isGoodBin: boolean;
    order?: number;
}

interface BinConfigFile {
    binMappingRule: {
        startNumber: number;
        startLetter: string;
    };
    binValues: BinValue[];
}

export type OutputId = WaferStackingOutputId;
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
    // 'SF',
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

const toHexColor = (num: number) =>
    `#${Math.max(0, Math.min(0xffffff, num)).toString(16).padStart(6, '0')}`;

const OUTPUT_OPTIONS = [
    { id: 'mapEx', label: 'WaferMapEx' },
    { id: 'bin', label: 'BinMap' },
    { id: 'HEX', label: 'HexMap' },
    { id: 'image', label: 'Image' },
    { id: 'fab', label: 'fab' },
    { id: 'SILAN', label: 'SILAN' },
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

const EDGE_REMOVAL_STORAGE_KEY = 'wafer_edge_removal_enabled';

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
    const [batchErrors, setBatchErrors] = useState<BatchProcessingError[]>([]);
    const [exportAsciiDieData, setExportAsciiDieData] = useState(() => {
        return localStorage.getItem(EDGE_REMOVAL_STORAGE_KEY) === 'true';
    });
    const [goodBins, setGoodBins] = useState<string[]>([]);

    const renderBinLabel = (opt: OutputOption2) => {
        const color = colorMap.get(opt.id) ?? 0x999999;
        return (
            <Group gap={6} align="center">
                <Box
                    w={12}
                    h={12}
                    style={{
                        backgroundColor: toHexColor(color),
                        borderRadius: 3,
                        border: '1px solid #e2e8f0',
                    }}
                />
                <Text size="sm">{opt.label}</Text>
            </Group>
        );
    };

    const [selectedOutputs, setSelectedOutputs] = useState<OutputId[]>([
        'mapEx',
        'HEX',
        'bin',
        'image',
        'fab',
        'SILAN'
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
    const dieLayoutPath = useAppSelector((s) => s.preferences.dieLayoutXlsPath);
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

    const getAllOemIdsFromQueue = (): string[] => {
        const oemIds = new Set<string>();
        if (jobOemId) oemIds.add(jobOemId);
        queue.forEach(job => {
            if (job.oemProductId) oemIds.add(job.oemProductId);
        });
        return Array.from(oemIds);
    };
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
        const saved = localStorage.getItem('wafer_output_dir');
        if (saved) {
            setOutputDir(saved);
        } else {
            (async () => {
                const desktop = await desktopDir();
                setOutputDir(desktop);
            })();
        }
    }, []);

    useEffect(() => {
        if (outputDir) {
            localStorage.setItem('wafer_output_dir', outputDir);
        }
    }, [outputDir]);

    useEffect(() => {
        localStorage.setItem(EDGE_REMOVAL_STORAGE_KEY, String(exportAsciiDieData));
    }, [exportAsciiDieData]);

    useEffect(() => {
        const goodBinIdsFromConfig = (config: BinConfigFile) => config.binValues
            .filter((bin: BinValue) => bin.isGoodBin)
            .map((bin: BinValue) => bin.id);

        const loadGoodBins = () => {
            const saved = localStorage.getItem('bin_config');
            if (saved) {
                try {
                    const config = JSON.parse(saved) as BinConfigFile;
                    setGoodBins(goodBinIdsFromConfig(config));
                } catch (e) {
                    console.error('加载 good bins 失败', e);
                    setGoodBins(goodBinIdsFromConfig({
                        binMappingRule: { startNumber: 10, startLetter: 'A' },
                        binValues: DEFAULT_BIN_VALUES_CONFIG
                    }));
                }
            } else {
                setGoodBins(goodBinIdsFromConfig({
                    binMappingRule: { startNumber: 10, startLetter: 'A' },
                    binValues: DEFAULT_BIN_VALUES_CONFIG
                }));
            }
        };
        loadGoodBins();
        const handleConfigChange = (event: CustomEvent) => {
            const config = event.detail as BinConfigFile;
            setGoodBins(goodBinIdsFromConfig(config));
        };
        window.addEventListener('binConfigChanged', handleConfigChange as EventListener);
        return () => window.removeEventListener('binConfigChanged', handleConfigChange as EventListener);
    }, []);

    const processSingleJob = async (jobItem: JobItem, exportAsciiData: boolean = false) => {
        dispatch(queueUpdateJob({
            id: jobItem.id,
            changes: { status: 'active' }
        }));

        try {
            await processWaferStackingJob(jobItem, {
                outputDir,
                finalOutputDir,
                dieLayoutPath,
                selectedOutputs,
                selectedDefectClasses: selectedOutputs2.map(asDefectClass),
                imageRenderer,
                exportAsciiData,
                goodBins,
                onFinalOutputDir: setFinalOutputDir,
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
        try {
            const oemIds = getAllOemIdsFromQueue();
            await exportWaferStatsReport(oemIds, outputDir);
        } catch (e) {
            console.warn('导出统计报告失败:', e);
            errorToast({ title: '导出失败', message: '统计报告生成失败：' + String(e) });
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
        const nextBatchErrors: BatchProcessingError[] = [];

        for (let i = 0; i < jobsToProcess.length; i++) {
            const jobItem = jobsToProcess[i];
            try {
                const result = await processSingleJob(jobItem, exportAsciiDieData);
                if (!result.success) {
                    const error = {
                        id: result.jobId,
                        message: result.message || ''
                    };
                    nextBatchErrors.push(error);
                    setBatchErrors(prev => [...prev, error]);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const batchError = {
                    id: jobItem.id,
                    message: errorMsg
                };
                nextBatchErrors.push(batchError);
                setBatchErrors(prev => [...prev, batchError]);
            } finally {
                setBatchProgress(prev => ({ ...prev, current: i + 1 }));
            }
        }

        setBatchErrors(nextBatchErrors);
        setBatchProcessing(false);
        const summary = buildBatchCompletionSummary(jobsToProcess.length, nextBatchErrors);
        const toast = summary.ok ? infoToast : errorToast;
        toast({
            title: summary.title,
            message: summary.message
        });
        try {
            const oemIds = getAllOemIdsFromQueue();
            await exportWaferStatsReport(oemIds, outputDir);
        } catch (e) {
            console.warn('导出统计报告失败:', e);
            errorToast({ title: '导出失败', message: '统计报告生成失败：' + String(e) });
        }
    };
    return (
        <Container fluid p="md">
            <Stack gap="md">
                <Title order={1}>晶圆叠图</Title>

                <Title order={2}>输出设置</Title>
                <Stack>
                    <Group align="flex-start" grow>
                        <Checkbox.Group
                            label="选择导出格式"
                            value={selectedOutputs}
                            onChange={(vals) => setSelectedOutputs(vals as OutputId[])}
                            style={{ flex: 1 }}
                        >
                            <Group gap="md" mt="xs">
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
                                label="图像渲染器"
                                value={imageRenderer}
                                onChange={(v) => {
                                    const next = (v as 'bin' | 'substrate') || 'bin';
                                    // 禁用“真实衬底样式”，强制为 bin
                                    setImageRenderer(next === 'substrate' ? 'bin' : next);
                                }}
                            >
                                <Group gap="md" mt="xs">
                                    <Radio value="bin" label="方块 (Bin颜色)" />
                                    <Radio value="substrate" label="真实衬底样式" disabled />
                                </Group>
                            </Radio.Group>
                        )}

                        <Checkbox.Group
                            label="选择参与叠图的BIN/缺陷类别"
                            value={selectedOutputs2}
                            onChange={(vals) => setSelectedOutputs2(vals as BinId[])}
                            style={{ flex: 1 }}
                        >
                            <SimpleGrid cols={3} spacing="sm" mt="xs">
                                {OUTPUT_OPTIONS2.map((opt) => (
                                    <Checkbox
                                        key={opt.id}
                                        value={opt.id}
                                        label={renderBinLabel(opt)}
                                    />
                                ))}
                            </SimpleGrid>
                        </Checkbox.Group>
                    </Group>

                    {/* Top-level output directory selector with Desktop default */}
                    <Group align="end" grow>
                        <PathPicker
                            label="输出目录"
                            placeholder="默认：桌面(Desktop)"
                            value={outputDir}
                            onChange={(e) => setOutputDir(e)}
                            readOnly
                        />
                    </Group>
                </Stack>

                <Divider />

                <Group align="flex-start">
                    {/* 右侧：任务列表区 → 嵌入 JobManager */}
                    <Stack w="25%" gap="sm">
                        <Title order={3}>待处理任务</Title>
                        <JobManager disableAddFromCurrent />
                        {batchProcessing && (
                            <Stack gap="sm">
                                <Progress
                                    value={(batchProgress.current / batchProgress.total) * 100}
                                />
                                <Text size="sm">
                                    正在处理第 {batchProgress.current} 个任务
                                </Text>
                            </Stack>
                        )}
                        {!batchProcessing && batchErrors.length > 0 && (
                            <Text size="sm">
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
                                <Title order={3} pb="sm">当前Wafer数据</Title>
                                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
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

                        <Stack gap="sm">
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
                        <Group align="end" grow>
                            <Checkbox
                                checked={exportAsciiDieData}
                                onChange={(e) => setExportAsciiDieData(e.target.checked)}
                                label="失效DIE边缘去除"
                                disabled={processing || batchProcessing}
                                size="sm"
                            />
                            <Button
                                color="blue"
                                leftSection={processing ? <IconRefresh size={16} /> : <IconDownload size={16} />}
                                loading={processing}
                                onClick={processMapping}
                                disabled={selectedOutputs.length === 0 || !jobOemId || jobWaferId == null}
                            >
                                处理当前
                            </Button>
                            <Button
                                color="green"
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

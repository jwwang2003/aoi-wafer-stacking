import { useState, useMemo } from 'react';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { infoToast, errorToast } from '@/components/Toaster';
import { LayerMeta } from './priority';
import {
    Title,
    Group,
    Container,
    Stack,
    Checkbox,
    Button,
    ScrollArea,
    Text,
    Paper,
    Tooltip,
    SimpleGrid,
    Divider,
} from '@mantine/core';
import { join } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';
import {
    exportWaferHex,
    exportWaferMapData,
    exportWaferBin,
    invokeParseWafer,
    parseWaferMapEx,
    parseWaferMap,
    invokeParseSubstrateDefectXls,
} from '@/api/tauri/wafer';
import { MapData, BinMapData, AsciiDie, Wafer, isNumberBin, SubstrateDefectXlsResult } from '@/types/ipc';
import { useAppSelector } from '@/hooks';
import { ExcelType } from '@/types/wafer';
import { DataSourceType } from '@/types/dataSource';
import {
    ExcelMetadataCard,
    WaferFileMetadataCard,
} from '@/components/MetadataCard';
import { toWaferFileMetadata } from '@/types/helpers';
import { PathPicker } from '@/components';
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
    disabled?: boolean; // <- optional on all
};

const OUTPUT_OPTIONS = [
    { id: 'mapEx', label: 'WaferMapEx' },
    { id: 'bin', label: 'BinMap' },
    { id: 'HEX', label: 'HexMap' },
    { id: 'image', label: 'Image (TODO)', disabled: true },
] as const satisfies readonly OutputOption[];

// Map your DataSourceType to a short stage label shown in the UI
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
        // If you have more, extend here:
        default:
            return String(stage ?? 'Unknown');
    }
}

export default function WaferStacking() {
    const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
    const [tasks, setTasks] = useState<string[][]>([]);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [combinedHeaders, setCombinedHeaders] = useState<
        Record<string, string>
    >({});
    const [finalOutputDir, setFinalOutputDir] = useState<string>('');

    const job = useAppSelector((s) => s.stackingJob);
    const {
        oemProductId: jobOemId,
        productId: jobProductId,
        batchId: jobBatchId,
        waferId: jobWaferId,
        subId: jobSubId,
        waferSubstrate: jobSubstrate,
        waferMaps: jobWaferMaps,
    } = job;

    const selectableLayers = useMemo(() => {
        type Item = {
            value: string; // unique key for Checkbox value
            label: string; // main label
            disabled?: boolean; // WLBI disabled
            tooltip?: string; // optional tooltip
        };
        const items: Item[] = [];

        // Substrate (if present)
        if (jobSubstrate) {
            const subId = jobSubstrate.sub_id || jobSubId || '—';
            items.push({
                value: `substrate:${subId}`,
                label: `Substrate / ${subId}`,
            });
        }

        // Wafer maps
        for (const wm of jobWaferMaps) {
            // const stage = stageLabel(wm.stage, wm.sub_stage);
            const stage = stageLabel(wm.stage);
            const subStage = wm.sub_stage ? ` / ${wm.sub_stage}` : '';
            const retest = ` / Retest ${wm.retest_count ?? 0}`;
            const id =
                wm.idx != null
                    ? `map:${wm.idx}`
                    : `map:${wm.product_id}|${wm.batch_id}|${wm.wafer_id}|${wm.stage}`; // fallback key

            items.push({
                value: id,
                label: `${stage}${subStage}${retest}`,
            });
        }

        return items;
    }, [jobSubstrate, jobSubId, jobWaferMaps]);

    const mergeHeader = (newHeader: Record<string, string>) => {
        setCombinedHeaders((prev) => {
            const merged = { ...prev };
            Object.entries(newHeader).forEach(([key, value]) => {
                if (!(key in merged)) {
                    merged[key] = value;
                }
            });
            return merged;
        });
    };

    const processMapping = async () => {
        setProcessing(true);
        setResult(null);
        try {
            const selectedLayerInfo = selectedLayers
                .map((layerValue) => {
                    const [layerType, id] = layerValue.split(':', 2);
                    if (layerType === 'substrate') {
                        return {
                            layerType: 'substrate' as const,
                            filePath: jobSubstrate?.file_path || '',
                        };
                    } else if (layerType === 'map' && id) {
                        const wm = jobWaferMaps.find(
                            (item) => item.idx === parseInt(id, 10)
                        );
                        return {
                            layerType: 'map' as const,
                            filePath: wm?.file_path || '',
                            stage: wm?.stage as DataSourceType,
                            subStage: wm?.sub_stage || '',
                        };
                    }
                    return null;
                })
                .filter(Boolean) as Array<{
                    layerType: 'map' | 'substrate';
                    filePath: string;
                    stage?: DataSourceType;
                    subStage?: string;
                }>;

            if (selectedLayerInfo.length === 0) {
                throw new Error('未选择有效图层或图层无文件路径');
            }

            const sortedLayers = selectedLayerInfo.sort((a, b) => {
                if (a.layerType !== 'map') return 1;
                if (b.layerType !== 'map') return -1;

                const getLayerMeta = (item: typeof a): LayerMeta => ({
                    stage: item.stage as DataSourceType,
                    subStage: item.subStage,
                });
                const aPriority = getLayerPriority(getLayerMeta(a));
                const bPriority = getLayerPriority(getLayerMeta(b));

                return bPriority - aPriority;
            });

            const baseTargetDir = outputDir || finalOutputDir;
            if (!outputDir && !finalOutputDir) {
                // 提示用户选择路径
                errorToast({
                    title: '路径未选择',
                    message: '请先选择导出文件的保存路径'
                });
                return; // 终止后续处理
            }
            const outputRootDir = await join(baseTargetDir, '输出文件');
            try {
                await mkdir(outputRootDir, { recursive: true });
                if (outputDir) {
                    setFinalOutputDir(outputRootDir);
                }
            } catch (error) {
                console.error('创建输出目录失败:', error);
                throw new Error(
                    `无法创建输出目录: ${error instanceof Error ? error.message : String(error)
                    }`
                );
            }

            const headers: Record<string, string>[] = [];
            const originalDiesList: AsciiDie[][] = [];
            const formatNamesList: string[] = [];
            let cp1Header: Record<string, string> = {};
            const tempCombinedHeaders: Record<string, string> = {
                ...combinedHeaders,
            };

            for (const layer of sortedLayers) {
                const { filePath, layerType, stage, subStage } = layer;
                if (!filePath) continue;

                let content: SubstrateDefectXlsResult | BinMapData | MapData | Wafer | null = null;
                let header: Record<string, string> = {};
                let dies: AsciiDie[] = [];
                let layerName = 'Unknown';

                if (layerType === 'map' && stage) {
                    layerName =
                        stage === DataSourceType.CpProber
                            ? `CP${subStage || ''}`
                            : stageLabel(stage);

                    if (stage === DataSourceType.CpProber) {
                        const cpType = subStage || '1';
                        if (['1', '2'].includes(cpType)) {
                            content = await parseWaferMapEx(filePath);
                            if (content && content.map.dies) {
                                console.log('Wafer content12:', content);
                                header = extractMapDataHeader(content);
                                dies = content.map.dies;
                                if (cpType === '1') cp1Header = { ...header };
                            }
                        } else if (cpType === '3') {
                            content = await invokeParseWafer(filePath);
                            console.log('Wafer content3:', content);
                            if (content && content.map.dies) {
                                header = extractWaferHeader(content);
                                dies = content.map.dies;
                            }

                        }
                    } else if (stage === DataSourceType.Wlbi) {
                        content = await parseWaferMap(filePath);
                        if (content && content.map) {
                            console.log('Wafer wlbi content:', content);
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
                        console.log('Wafer aoi content:', content);
                        if (content && content.map.dies) {
                            header = extractMapDataHeader(content);
                            dies = content.map.dies;
                        }
                    }
                }

                if (layerType === 'substrate') {
                    layerName = 'Substrate';
                    content = await invokeParseSubstrateDefectXls(filePath);
                    console.log('Substrate content:', content);
                    // if (content) { /* 提取基板数据 */ }
                }

                if (!content || dies.length === 0) continue;

                Object.entries(header).forEach(([key, value]) => {
                    if (!(key in tempCombinedHeaders)) tempCombinedHeaders[key] = value;
                });
                mergeHeader(header);
                originalDiesList.push(dies);
                formatNamesList.push(layerName);
                headers.push(header);
            }

            if (originalDiesList.length === 0) {
                throw new Error('没有有效的地图数据可供处理');
            }

            const alignedDiesList: AsciiDie[][] = [];
            const highestPriorityLayerIndex = 0;
            const baseDies = originalDiesList[highestPriorityLayerIndex];
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
                console.log('Wafer aligned content:', alignedDiesList);
            }

            const { dieMap } = createDieMapStructure(alignedDiesList);

            alignedDiesList.forEach((dies, index) => {
                const layer = sortedLayers[index];
                if (layer.layerType !== 'map' || !layer.stage) return;

                const layerMeta: LayerMeta = {
                    stage: layer.stage,
                    subStage: layer.subStage,
                };
                const priority = getLayerPriority(layerMeta);

                mergeLayerToDieMap(dieMap, dies, priority);
            });

            const mergedDies = pruneEmptyRegions(dieMap);
            if (mergedDies.length === 0) {
                throw new Error('处理后地图为空');
            }

            const stats = calculateStatsFromDies(mergedDies);
            const baseFileName =
                jobOemId +
                '_' +
                jobProductId +
                '_' +
                jobBatchId +
                '_' +
                jobWaferId +
                '_' +
                jobSubId;
            const useHeader = {
                ...tempCombinedHeaders,
                ...(cp1Header || headers[0] || {}),
            };

            if (selectedOutputs.includes('mapEx')) {
                const mapExData = convertToMapData(mergedDies, stats, useHeader);
                console.log('MapEx Data:', mapExData);
                const mapExPath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.mapEx`
                );
                console.log('MapEx Data??:', mapExData);
                await exportWaferMapData(mapExData, mapExPath);
            }

            if (selectedOutputs.includes('HEX')) {
                const hexData = convertToHexMapData(mergedDies, useHeader);
                console.log('HEX Data:', hexData);

                const hexPath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.hex`
                );
                await exportWaferHex(hexData, hexPath);
            }

            if (selectedOutputs.includes('bin')) {
                const binData = convertToBinMapData(mergedDies, useHeader);
                console.log('Bin Data:', binData);
                const binPath = await join(
                    outputRootDir,
                    `${baseFileName}_overlayed.bin`
                );
                await exportWaferBin(binData, binPath);
            }

            setResult('叠图完成！');
            infoToast({
                title: '成功',
                message: '叠图处理已完成'
            });
        } catch (error) {
            console.error('处理失败:', error);
            setResult(
                `处理失败: ${error instanceof Error ? error.message : String(error)}`
            );
        } finally {
            setProcessing(false);
        }
    };

    /**
     * 批量处理任务
     */
    const handleBatchProcess = () => {
        alert(`Processing ${tasks.length} tasks`);
        setTasks([]);
    };

    const [selectedOutputs, setSelectedOutputs] = useState<OutputId[]>([
        'mapEx',
        'HEX',
        'bin',
    ]);
    const [outputDir, setOutputDir] = useState<string>('');

    return (
        <Container fluid p='md'>
            <Stack gap='md'>
                <Title order={1}>晶圆叠图</Title>

                <Divider />

                {job && jobSubstrate ? (
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

                <Group align='flex-start' grow>
                    <Stack w='50%' gap='sm'>
                        <Checkbox.Group
                            label='选择叠图层 (阶段/工序/复测)'
                            value={selectedLayers}
                            onChange={setSelectedLayers}
                        >
                            <Stack gap='xs' mt='sm'>
                                {selectableLayers.length === 0 ? (
                                    <Text c='dimmed'>暂无可选图层，请先在数据库选择数据</Text>
                                ) : (
                                    selectableLayers.map((item) => (
                                        <Tooltip
                                            key={item.value}
                                            label={item.tooltip}
                                            position='right'
                                            disabled={!item.tooltip}
                                        >
                                            <Checkbox
                                                value={item.value}
                                                label={item.label}
                                                disabled={item.disabled}
                                            />
                                        </Tooltip>
                                    ))
                                )}
                            </Stack>
                        </Checkbox.Group>
                    </Stack>

                    {/* 右侧：任务列表区 */}
                    <Stack w='50%' gap='sm'>
                        <Title order={3}>待处理任务</Title>
                        <ScrollArea h={200}>
                            <Stack gap='xs'>
                                {tasks.length === 0 ? (
                                    <Text c='dimmed'>暂无任务</Text>
                                ) : (
                                    tasks.map((task, idx) => (
                                        <Paper key={idx} shadow='xs' p='xs' radius='sm'>
                                            <Text size='sm'>
                                                任务 {idx + 1}: {task.join(', ')}
                                            </Text>
                                        </Paper>
                                    ))
                                )}
                            </Stack>
                        </ScrollArea>
                        <Button onClick={handleBatchProcess} disabled={tasks.length === 0}>
                            批量处理
                        </Button>
                    </Stack>
                </Group>

                <Divider />

                <Title order={2}>输出设置</Title>
                <Stack>
                    {/* Output format checkboxes */}
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
                                    disabled={'disabled' in opt ? (opt as any).disabled : false}
                                />
                            ))}
                        </Group>
                    </Checkbox.Group>

                    {/* Path selector */}
                    <Group align='end' grow>
                        <PathPicker
                            label='输出目录'
                            placeholder='使用默认输出目录（由配置控制）'
                            value={outputDir}
                            onChange={(e) => setOutputDir(e)}
                            readOnly
                        />
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
                            disabled={selectedOutputs.length === 0}
                        >
                            导出
                        </Button>
                    </Group>
                </Stack>
            </Stack>
        </Container>
    );
}

import { useEffect, useState } from 'react';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import ProcessRouteStepper from '@/components/ProcessRouteStepper';
import { infoToast } from '@/components/Toaster';
import {
    Title,
    Group,
    Container,
    Stack,
    Switch,
    Checkbox,
    Button,
    Divider,
    Box,
    ScrollArea,
    Text,
    Paper,
    Alert,
    Tooltip,
} from '@mantine/core';
import { join } from '@tauri-apps/api/path';

import { inputFormats, allLayers, outputFormats, baseFileName } from './config';
import { Statistics } from './types';
import { createOutputDirectories } from './fileHandlers';
import { calculateStats } from './overlayLogic';
import { saveDebugFile } from './formatHandlers';
import {
    exportWaferHex,
    exportWaferMapData,
    exportWaferBin,
    invokeParseWafer,
    parseWaferMapEx,
    parseWaferMap,
} from '@/api/tauri/wafer';
import {
    MapData,
    BinMapData,
    HexMapData,
    AsciiDie,
    WaferMapDie,
    BinCountEntry,
    HexMap,
    Wafer,
    isSpecialBin,
    isNumberBin,
} from '@/types/ipc';

//数字越大优先级越高
const LAYER_PRIORITIES = {
    CP2: 5,
    WLBI: 4,
    CP1: 3,
    CP3: 2,
    AOI: 1,
};

const getLayerPriority = (layerName: string): number => {
    return LAYER_PRIORITIES[layerName as keyof typeof LAYER_PRIORITIES];
};

const extractAlignmentMarkers = (
    dies: AsciiDie[]
): { x: number; y: number }[] => {
    return dies
        .filter((die) => isSpecialBin(die.bin))
        .map((die) => ({ x: die.x, y: die.y }));
};

const calculateOffset = (
    baseMarkers: { x: number; y: number }[],
    targetMarkers: { x: number; y: number }[]
): { dx: number; dy: number } => {
    if (baseMarkers.length === 0 || targetMarkers.length === 0) {
        return { dx: 0, dy: 0 };
    }

    const sortedBase = [...baseMarkers].sort((a, b) => a.x - b.x);
    const sortedTarget = [...targetMarkers].sort((a, b) => a.x - b.x);
    const hasTwoPoints = sortedBase.length >= 2 && sortedTarget.length >= 2;

    const dx1 = sortedBase[0].x - sortedTarget[0].x;
    const dy1 = sortedBase[0].y - sortedTarget[0].y;
    if (hasTwoPoints) {
        const dx2 = sortedBase[1].x - sortedTarget[1].x;
        const dy2 = sortedBase[1].y - sortedTarget[1].y;
        return {
            dx: Math.round((dx1 + dx2) / 2),
            dy: Math.round((dy1 + dy2) / 2),
        };
    } else {
        return { dx: dx1, dy: dy1 };
    }
};

const applyOffsetToDies = (
    dies: AsciiDie[],
    dx: number,
    dy: number
): AsciiDie[] => {
    return dies.map((die) => ({
        ...die,
        x: die.x + dx,
        y: die.y + dy,
    }));
};

const convertDiesToMap = (dies: AsciiDie[]): string[] => {
    if (dies.length === 0) return [];
    const xs = dies.map((die) => die.x);
    const ys = dies.map((die) => die.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rows: string[][] = Array.from({ length: maxY - minY + 1 }, () =>
        Array(maxX - minX + 1).fill('.')
    );

    dies.forEach((die) => {
        const rowIdx = die.y - minY;
        const colIdx = die.x - minX;

        if (
            rowIdx < 0 ||
            rowIdx >= rows.length ||
            colIdx < 0 ||
            colIdx >= rows[rowIdx].length
        ) {
            return;
        }

        if (isNumberBin(die.bin)) {
            rows[rowIdx][colIdx] = die.bin.number.toString();
        } else if (isSpecialBin(die.bin)) {
            if (!['.', 'S', '*'].includes(die.bin.special)) {
                rows[rowIdx][colIdx] = die.bin.special;
            }
        }
    });

    return rows.map((row) => row.join(''));
};

const mergeDiesWithPriority = (
    allDies: AsciiDie[][],
    layerNames: string[]
): AsciiDie[] => {
    const dieMap = new Map<string, { die: AsciiDie; priority: number }>();

    allDies.forEach((dies, index) => {
        const layerName = layerNames[index];
        const currentPriority = getLayerPriority(layerName);

        dies.forEach((die) => {
            let isSkipSpecial = false;
            if (isSpecialBin(die.bin)) {
                isSkipSpecial = ['.', 'S', '*'].includes(die.bin.special);
            }
            if (isSkipSpecial) return;

            const key = `${die.x},${die.y}`;
            const existing = dieMap.get(key);
            if (!existing) {
                dieMap.set(key, { die, priority: currentPriority });
                return;
            }
            const existingPriority = existing.priority;
            if (currentPriority > existingPriority) {
                dieMap.set(key, { die, priority: currentPriority });
            } else if (currentPriority < existingPriority) {
                let isExistingBin1 = false;
                if (isNumberBin(existing.die.bin)) {
                    isExistingBin1 = existing.die.bin.number === 1;
                }
                if (isExistingBin1) {
                    dieMap.set(key, { die, priority: currentPriority });
                }
            }
        });
    });
    return Array.from(dieMap.values()).map((item) => item.die);
};

export default function WaferStacking() {
    const [showRoute, setShowRoute] = useState(false);
    const [showDiagram, setShowDiagram] = useState(false);
    const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
    const [tasks, setTasks] = useState<string[][]>([]);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string | null>(null);
    const [combinedHeaders, setCombinedHeaders] = useState<
        Record<string, string>
    >({});

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

    const extractWaferHeader = (wafer: Wafer): Record<string, string> => ({
        Operator: wafer.operator,
        'Device Name': wafer.device,
        'Lot No.': wafer.lotId,
        'Wafer ID': wafer.waferId,
        'Measurement Time': wafer.measTime,
        'Gross Die': wafer.grossDie.toString(),
        'Pass Die': wafer.passDie.toString(),
        'Fail Die': wafer.failDie.toString(),
        Yield: wafer.totalYield.toString(),
        Notch: wafer.notch,
    });

    const extractMapDataHeader = (mapData: MapData): Record<string, string> => ({
        'Device Name': mapData.deviceName || 'Unknown',
        'Lot No.': mapData.lotNo || 'Unknown',
        'Wafer ID': mapData.waferId || 'Unknown',
        'Wafer Size': mapData.waferSize || 'Unknown',
        'Dice SizeX': mapData.diceSizeX ? mapData.diceSizeX.toString() : '0',
        'Dice SizeY': mapData.diceSizeY ? mapData.diceSizeY.toString() : '0',
        'Flat/Notch': mapData.flatNotch || 'Unknown',
        'Total Tested': mapData.totalTested ? mapData.totalTested.toString() : '0',
        'Total Pass': mapData.totalPass ? mapData.totalPass.toString() : '0',
        'Total Fail': mapData.totalFail ? mapData.totalFail.toString() : '0',
        Yield: mapData.yieldPercent ? mapData.yieldPercent.toString() : '0',
    });

    /**
     * 转换叠图结果为MapData类型（用于mapEx格式输出）
     */
    const convertToMapData = (
        mapData: string[],
        stats: Statistics,
        header: Record<string, string>
    ): MapData => ({
        deviceName: header?.['Device Name'] || 'Unknown',
        lotNo: header?.['Lot No.'] || 'Unknown',
        waferId: header?.['Wafer ID'] || 'Unknown',
        waferSize: header?.['Wafer Size'] || '6',
        diceSizeX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
        diceSizeY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
        flatNotch: header?.['Flat/Notch'] || 'Unknown',
        mapColumns: mapData[0]?.length || 0,
        mapRows: mapData.length || 0,
        totalTested: stats.totalTested || 0,
        totalPass: stats.totalPass || 0,
        totalFail: stats.totalFail || 0,
        yieldPercent: stats.yieldPercentage || 0,
        map: {
            raw: mapData,
            dies: mapData.flatMap((row, y) =>
                row.split('').map((char, x) => ({
                    x,
                    y,
                    bin: char === '.' ? { special: '.' } : { number: parseInt(char, 10) },
                }))
            ),
        },
    });

    /**
     * 转换叠图结果为BinMapData类型（用于bin格式输出）
     */
    const convertToBinMapData = (
        mergedDies: AsciiDie[],
        header?: Record<string, string>
    ): BinMapData => {
        const map: WaferMapDie[] = mergedDies
            .filter((die) => isNumberBin(die.bin))
            .map((die) => ({
                x: die.x - 1,
                y: die.y,
                bin: die.bin,
                reserved: 0,
            }));
        const binCounts: Record<number, number> = {};
        map.forEach((die) => {
            if (isNumberBin(die.bin)) {
                const binNum = die.bin.number;
                binCounts[binNum] = (binCounts[binNum] || 0) + 1;
            }
        });

        const bins: BinCountEntry[] = Object.entries(binCounts)
            .map(([bin, count]) => ({ bin: parseInt(bin, 10), count }))
            .sort((a, b) => a.bin - b.bin);

        return {
            waferType: header?.['WaferType'] ? parseInt(header['WaferType']) : 0,
            dut: header?.['DUT'] ? parseInt(header['DUT']) : 0,
            mode: header?.['Mode'] ? parseInt(header['DUT']) : 0,
            product: header?.['Device Name'] || 'Unknown',
            waferLots: header?.['Lot No.'] || 'Unknown',
            waferNo: header?.['Wafer ID'] || 'Unknown',
            waferSize: header?.['Wafer Size'] ? parseFloat(header['Wafer Size']) : 0,
            indexX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
            indexY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
            map: map,
            bins: bins,
        };
    };

    /**
     * 转换叠图结果为HexMapData类型（用于HEX格式输出）
     */
    const convertToHexMapData = (
        mapData: string[],
        header?: Record<string, string>
    ): HexMapData => {
        const validMapData =
            mapData.length === 0 || mapData.every((row) => row.length === 0)
                ? ['0']
                : mapData;

        const letterToNumber = {
            A: 10,
            B: 11,
            C: 12,
            D: 13,
            E: 14,
            F: 15,
            G: 16,
            H: 17,
            I: 18,
            J: 19,
        };
        const grid: HexMap['grid'] = validMapData.map((row) =>
            row.split('').map((char) => {
                if (char === '.') return null;
                if (char.match(/[a-zA-Z]/)) {
                    const upperChar = char.toUpperCase();
                    return letterToNumber[upperChar as keyof typeof letterToNumber] || 99;
                }
                if (char.match(/\d/)) return parseInt(char, 10);
                return null;
            })
        );

        const dies = validMapData
            .flatMap((row, y) =>
                row.split('').map((char, x) => ({
                    x,
                    y,
                    bin: char === '.' ? { special: '.' } : { number: parseInt(char, 10) },
                }))
            )
            .filter((die) => isNumberBin(die.bin));

        return {
            header: {
                device: header?.['Device Name'] || 'Unknown',
                lot: header?.['Lot No.'] || 'Unknown',
                wafer: header?.['Wafer ID'] || 'Unknown',
                rowCt: validMapData.length > 0 ? validMapData.length : 1,
                colCt: validMapData[0]?.length > 0 ? validMapData[0].length : 1,
                refpx: 1,
                refpy: 28,
                dutMs: 'MM',
                xDies: !isNaN(parseFloat(header?.['Dice SizeX'] || '0'))
                    ? parseFloat(header?.['Dice SizeX'] || '0') / 1000
                    : 0,
                yDies: !isNaN(parseFloat(header?.['Dice SizeY'] || '0'))
                    ? parseFloat(header?.['Dice SizeY'] || '0') / 1000
                    : 0,
            },
            map: { raw: validMapData, grid, dies },
        };
    };
    const processMapping = async () => {
        setProcessing(true);
        setResult(null);
        setDebugInfo(null);

        try {
            const sortedLayers = selectedLayers.sort(
                (a, b) => getLayerPriority(b) - getLayerPriority(a)
            );

            await createOutputDirectories(Object.values(outputFormats));
            const headers: Record<string, string>[] = [];
            const originalDiesList: AsciiDie[][] = [];
            const formatNamesList: string[] = [];
            let cp1Header: Record<string, string> = {};
            const tempCombinedHeaders: Record<string, string> = {
                ...combinedHeaders,
            };
            for (const formatName of sortedLayers) {
                const filePath = inputFormats[formatName as keyof typeof inputFormats];
                if (!filePath) continue;

                let content: BinMapData | MapData | Wafer | null = null;
                let header: Record<string, string> = {};
                let dies: AsciiDie[] = [];

                if (['CP1', 'CP2', 'AOI'].includes(formatName)) {
                    content = await parseWaferMapEx(filePath);
                    console.log(`读取文件内容 (${formatName}):`, content.map);
                    if (content && content.map.dies) {
                        header = extractMapDataHeader(content);
                        dies = content.map.dies;
                        if (formatName === 'CP1') {
                            cp1Header = { ...header };
                        }
                    }
                } else if (formatName === 'CP3') {
                    content = await invokeParseWafer(filePath);
                    console.log(`读取文件内容 (${formatName}):`, content.map.dies);
                    if (content && content.map.dies) {
                        header = extractWaferHeader(content);
                        dies = content.map.dies;
                    }
                } else if (formatName === 'WLBI') {
                    content = await parseWaferMap(filePath);
                    console.log(`读取文件内容 (${formatName}):`, content.map);
                    if (content && content.map) {
                        dies = content.map.map((die) => {
                            if (isNumberBin(die.bin) && die.bin.number === 257) {
                                return {
                                    ...die,
                                    bin: { special: '*' },
                                };
                            }
                            return die;
                        });
                    }
                }
                if (!content || dies.length === 0) continue;

                Object.entries(header).forEach(([key, value]) => {
                    if (!(key in tempCombinedHeaders)) {
                        tempCombinedHeaders[key] = value;
                    }
                });
                mergeHeader(header);
                originalDiesList.push(dies);
                formatNamesList.push(formatName);
                headers.push(header);
            }

            if (originalDiesList.length === 0) {
                throw new Error('没有有效的地图数据可供处理');
            }

            const alignedDiesList: AsciiDie[][] = [];

            const baseDies = originalDiesList[0];
            const baseMarkers = extractAlignmentMarkers(baseDies);
            alignedDiesList.push(baseDies);

            for (let i = 1; i < originalDiesList.length; i++) {
                const currentDies = originalDiesList[i];
                const currentMarkers = extractAlignmentMarkers(currentDies);
                const { dx, dy } = calculateOffset(baseMarkers, currentMarkers);
                console.log(
                    `地图 ${formatNamesList[i]} 相对于基准地图的偏移: dx=${dx}, dy=${dy}`
                );
                const alignedDies = applyOffsetToDies(currentDies, dx, dy);
                alignedDiesList.push(alignedDies);
            }

            const mergedDies = mergeDiesWithPriority(
                alignedDiesList,
                formatNamesList
            );
            const overlayedMap = convertDiesToMap(mergedDies);
            console.log('叠合后的地图数据:', overlayedMap);
            const stats: Statistics = calculateStats(overlayedMap);
            const debug = [
                `叠合完成，总数字bin数量: ${mergedDies.length}`,
                `图层优先级顺序: ${sortedLayers
                    .map((l) => `${l}(${getLayerPriority(l)})`)
                    .join(' > ')}`,
            ];
            setDebugInfo(debug.join('\n'));

            await saveDebugFile(debug, formatNamesList, stats);
            const useHeader = {
                ...tempCombinedHeaders,
                ...(cp1Header || headers[0] || {}),
            };

            console.log(overlayedMap);

            // 导出mapEx格式
            const mapExData = convertToMapData(overlayedMap, stats, useHeader);
            console.log('mapExData:', mapExData);
            const mapExPath = await join(
                outputFormats['mapEx'],
                `${baseFileName}_overlayed.mapEx`
            );
            console.log('mapExPath:', mapExPath);

            await exportWaferMapData(mapExData, mapExPath);

            // 导出HEX格式
            const hexData = convertToHexMapData(overlayedMap, useHeader);
            const hexPath = await join(
                outputFormats['HEX'],
                `${baseFileName}_overlayed.hex`
            );
            await exportWaferHex(hexData, hexPath);

            // 导出bin格式
            const binData = convertToBinMapData(mergedDies, useHeader);
            const binPath = await join(
                outputFormats['bin'],
                `${baseFileName}_overlayed.bin`
            );
            await exportWaferBin(binData, binPath);

            setResult('叠图完成！');
            infoToast({ title: '成功', message: '叠图处理已完成' });
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
     * 添加任务到批量处理列表
     */
    const handleAddTask = () => {
        setTasks((prev) => [...prev]);
    };

    /**
     * 批量处理任务
     */
    const handleBatchProcess = () => {
        alert(`Processing ${tasks.length} tasks`);
        setTasks([]);
    };

    useEffect(() => {
        // console.debug(debugInfo);
    }, [debugInfo]);

    return (
        <Group grow>
            <Container fluid p='md'>
                <Stack gap='md'>
                    <Title order={1}>晶圆叠图</Title>

                    <Group justify='space-between' align='center'>
                        <Title order={2}>工艺路线</Title>
                        <Switch
                            label='显示工艺路线'
                            checked={showRoute}
                            onChange={(event) => setShowRoute(event.currentTarget.checked)}
                        />
                    </Group>

                    {showRoute && <ProcessRouteStepper demoMode />}

                    <Divider
                        my='md'
                        label='叠图处理区 (已忽略WLBI格式)'
                        labelPosition='center'
                    />

                    <Group align='flex-start' grow>
                        {/* 左侧：参数设置区 */}
                        <Stack w='50%' gap='sm'>
                            <Switch
                                label='显示叠图示意图'
                                checked={showDiagram}
                                onChange={(event) =>
                                    setShowDiagram(event.currentTarget.checked)
                                }
                            />
                            {showDiagram && (
                                <Paper shadow='xs' p='sm' h={200}>
                                    <Box
                                        bg='gray.1'
                                        h='100%'
                                        style={{ border: '1px dashed #ccc' }}
                                    >
                                        <Text ta='center' pt='xl'>
                                            [ThreeJS 叠图 + 缺陷示意图]
                                        </Text>
                                    </Box>
                                </Paper>
                            )}

                            <Checkbox.Group
                                label='选择叠图层 (WLBI将被自动忽略)'
                                value={selectedLayers}
                                onChange={setSelectedLayers}
                            >
                                <Stack gap='xs' mt='sm'>
                                    {allLayers.map((layer) => (
                                        <Tooltip
                                            key={layer}
                                            label={`优先级: ${getLayerPriority(layer)}级`}
                                            position='right'
                                        >
                                            <Checkbox value={layer} label={layer} />
                                        </Tooltip>
                                    ))}
                                </Stack>
                            </Checkbox.Group>

                            <Group mt='md'>
                                <Button
                                    onClick={processMapping}
                                    loading={processing}
                                    leftSection={processing ? <IconRefresh size={16} /> : null}
                                >
                                    立刻处理
                                </Button>
                                <Button onClick={handleAddTask}>添加任务</Button>
                            </Group>
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
                            <Button
                                onClick={handleBatchProcess}
                                disabled={tasks.length === 0}
                            >
                                批量处理
                            </Button>
                        </Stack>
                    </Group>

                    {result !== null && (
                        <Alert
                            title='处理结果'
                            withCloseButton
                            onClose={() => setResult(null)}
                        >
                            <Button
                                mt='md'
                                leftSection={<IconDownload size={16} />}
                                onClick={() =>
                                    infoToast({ title: '提示', message: '文件已保存到输出目录' })
                                }
                            >
                                下载结果
                            </Button>
                        </Alert>
                    )}
                </Stack>
            </Container>
        </Group>
    );
}

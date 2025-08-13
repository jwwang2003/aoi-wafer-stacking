import { useState } from 'react';
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
} from '@mantine/core';
import { join } from '@tauri-apps/api/path';

import { inputFormats, allLayers, outputFormats, baseFileName } from './config';
import { Statistics } from './types';
import {
  readFileContent,
  readFile,
  createOutputDirectories,
} from './fileHandlers';
import { overlayMaps, calculateStats } from './overlayLogic';
import { saveDebugFile } from './formatHandlers';
import {
  parseWlbiHeader,
  parseWlbiToMatrix,
  printInformWafermap,
} from './wlbiHandlers';
import {
  exportWaferHex,
  exportWaferMapData,
  exportWaferBin,
  exportWafer,
} from '@/api/tauri/wafer';
import {
  Wafer,
  MapData,
  BinMapData,
  HexMapData,
  AsciiDie,
  WaferMapDie,
  BinCountEntry,
  HexMap,
  BinValue,
} from '@/types/Wafer';

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

  /**
   * 合并新的header到全局header字典中
   */
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

  const parseDies = (mapData: string[]): AsciiDie[] => {
    return mapData.flatMap((row, y) =>
      row.split('').map((char, x) => {
        let bin: BinValue;
        if (char === '.' || char === 'S' || char === '*') {
          bin = { special: char };
        } else if (char.match(/\d/)) {
          bin = { number: parseInt(char, 10) };
        } else {
          bin = { special: '?' };
        }
        return { x, y, bin };
      })
    );
  };

  // /**
  //  * 转换叠图结果为Wafer类型（用于wafermap格式输出）
  //  */
  // const convertToWafer = (
  //   mapData: string[],
  //   stats: Statistics,
  //   header: Record<string, string>
  // ): Wafer => ({
  //   operator: header?.['Operator'] || 'Unknown',
  //   device: header?.['Device Name'] || 'Unknown',
  //   lotId: header?.['Lot No.'] || 'Unknown',
  //   waferId: header?.['Wafer ID'] || 'Unknown',
  //   measTime: new Date().toISOString(),
  //   grossDie: stats.totalTested,
  //   passDie: stats.totalPass,
  //   failDie: stats.totalFail,
  //   totalYield: stats.yieldPercentage,
  //   notch: header?.['Notch'] || 'Down',
  //   map: {
  //     raw: mapData,
  //     dies: parseDies(mapData),
  //   },
  // });

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
    mapRows: mapData.length,
    totalTested: stats.totalTested,
    totalPass: stats.totalPass,
    totalFail: stats.totalFail,
    yieldPercent: stats.yieldPercentage,
    map: {
      raw: mapData,
      dies: parseDies(mapData),
    },
  });

  /**
   * 转换叠图结果为BinMapData类型（用于bin格式输出）
   */
  const convertToBinMapData = (
    mapData: string[],
    header?: Record<string, string>
  ): BinMapData => {
    const map: WaferMapDie[] = parseDies(mapData).map((die) => ({
      ...die,
      reserved: 0,
    }));

    const binCounts: Record<number, number> = {};
    map.forEach((die) => {
      if ('number' in die.bin) {
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
      waferSize: header?.['Wafer Size'] ? parseFloat(header['Wafer Size']) : 6,
      indexX: header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']) : 0,
      indexY: header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']) : 0,
      map,
      bins,
    };
  };

  /**
   * 转换叠图结果为HexMapData类型（用于HEX格式输出）
   */
  const convertToHexMapData = (
    mapData: string[],
    header?: Record<string, string>
  ): HexMapData => {
    const grid: HexMap['grid'] = mapData.map((row) =>
      row.split('').map((char) => {
        if (char === '.' || char === 'S' || char === '*') {
          return null;
        } else if (char.match(/\d/)) {
          return parseInt(char, 10);
        }
        return null;
      })
    );

    const dies = parseDies(mapData).filter(
      (die) => 'number' in die.bin || die.bin.special !== '.'
    );
    return {
      header: {
        device: header?.['Device Name'] || 'Unknown',
        lot: header?.['Lot No.'] || 'Unknown',
        wafer: header?.['Wafer ID'] || 'Unknown',
        rowCt: mapData.length,
        colCt: mapData[0]?.length || 0,
        refpx: 1, //未知
        refpy: 28, //未知
        dutMs: 'MM', //未知？
        xDies: header?.['Dice SizeX']
          ? parseFloat(header['Dice SizeX']) / 1000
          : 0,
        yDies: header?.['Dice SizeY']
          ? parseFloat(header['Dice SizeY']) / 1000
          : 0,
      },
      map: {
        raw: mapData,
        grid,
        dies,
      },
    };
  };

  const processMapping = async () => {
    setProcessing(true);
    setResult(null);
    setDebugInfo(null);

    try {
      await createOutputDirectories(Object.values(outputFormats));
      const headers: Record<string, string>[] = [];
      const maps: string[][] = [];
      const formatNamesList: string[] = [];
      let cp1Header: Record<string, string> = {};
      let wlbiFilepath = '';
      const tempCombinedHeaders: Record<string, string> = {
        ...combinedHeaders,
      };
      for (const formatName of selectedLayers) {
        const filePath = inputFormats[formatName as keyof typeof inputFormats];
        if (!filePath) continue;
        const content = await readFileContent(filePath);
        if (!content) continue;

        let header: Record<string, string> = {};
        let mapData: string[] = [];

        if (formatName === 'WLBI') {
          wlbiFilepath = filePath;
          header = parseWlbiHeader(content);
          mapData = parseWlbiToMatrix(content);
        } else {
          const parsed = readFile(content);
          header = parsed.header;
          mapData = parsed.mapData;
          if (formatName === 'CP1') {
            cp1Header = { ...header };
          }
        }
        Object.entries(header).forEach(([key, value]) => {
          if (!(key in tempCombinedHeaders)) tempCombinedHeaders[key] = value;
        });
        mergeHeader(header);
        if (mapData.length > 0) {
          headers.push(header);
          maps.push(mapData);
          formatNamesList.push(formatName);
        }
      }

      // 执行叠图
      const { result: overlayedMap, debug } = overlayMaps(
        maps,
        formatNamesList
      );
      setDebugInfo(debug.join('\n'));

      const stats: Statistics = calculateStats(overlayedMap);
      await saveDebugFile(debug, formatNamesList, stats);
      const useHeader = {
        ...tempCombinedHeaders,
        ...(cp1Header || headers[0] || {}),
      };

      // 导出mapEx格式
      const mapExData = convertToMapData(overlayedMap, stats, useHeader);
      const mapExPath = await join(
        outputFormats['mapEx'],
        `${baseFileName}_overlayed.mapEx`
      );
      await exportWaferMapData(mapExData, mapExPath);

      // 导出HEX格式
      const hexData = convertToHexMapData(overlayedMap, useHeader);
      const hexPath = await join(
        outputFormats['HEX'],
        `${baseFileName}_overlayed.hex`
      );
      await exportWaferHex(hexData, hexPath);

      // 导出wafermap格式
      // const waferData = convertToWafer(overlayedMap, stats, useHeader);
      // const wafermapPath = await join(
      //   outputFormats['wafermap'],
      //   `${baseFileName}_overlayed.wafermap`
      // );
      // await exportWafer(waferData, wafermapPath);
      // console.log('wafermap数据（预期header）:', waferData); // 检查控制台输出的字段

      // 导出bin格式
      const binData = convertToBinMapData(overlayedMap, useHeader);
      const binPath = await join(
        outputFormats['bin'],
        `${baseFileName}_overlayed.bin`
      );
      await exportWaferBin(binData, binPath);

      if (selectedLayers.includes('WLBI') && wlbiFilepath) {
        await printInformWafermap(overlayedMap, wlbiFilepath, useHeader);
      }

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
    if (selectedLayers.length > 0) {
      setTasks((prev) => [...prev, selectedLayers]);
    }
  };

  /**
   * 批量处理任务
   */
  const handleBatchProcess = () => {
    alert(`Processing ${tasks.length} tasks`);
    setTasks([]);
  };

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

          <Divider my='md' label='叠图处理区' labelPosition='center' />

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
                label='选择叠图层'
                value={selectedLayers}
                onChange={setSelectedLayers}
              >
                <Stack gap='xs' mt='sm'>
                  {allLayers.map((layer) => (
                    <Checkbox key={layer} value={layer} label={layer} />
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
              <Text>{result}</Text>
              {/* 穿插debuginfo */}

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

// {debugInfo && (
//   <div style={{ marginTop: '1rem' }}>
//     <Title order={4}>调试信息</Title>
//     <div
//       style={{
//         height: '200px',
//         overflow: 'auto',
//         backgroundColor: '#f5f5f5',
//         padding: '0.5rem',
//         borderRadius: '4px',
//       }}
//     >
//       <textarea
//         value={debugInfo}
//         readOnly
//         style={{
//           width: '100%',
//           height: '100%',
//           whiteSpace: 'pre-wrap',
//           fontFamily: 'monospace',
//           border: 'none',
//           background: 'transparent',
//           resize: 'none',
//           outline: 'none',
//         }}
//       />
//     </div>
//   </div>
// )}

// {Object.keys(combinedHeaders).length > 0 && (
//   <div style={{ marginTop: '1rem' }}>
//     <Title order={4}>合并的Header信息</Title>
//     <div
//       style={{
//         height: '200px',
//         overflow: 'auto',
//         backgroundColor: '#f5f5f5',
//         padding: '0.5rem',
//         borderRadius: '4px',
//       }}
//     >
//       <textarea
//         value={Object.entries(combinedHeaders)
//           .map(([key, value]) => `${key}: ${value}`)
//           .join('\n')}
//         readOnly
//         style={{
//           width: '100%',
//           height: '100%',
//           whiteSpace: 'pre-wrap',
//           fontFamily: 'monospace',
//           border: 'none',
//           background: 'transparent',
//           resize: 'none',
//           outline: 'none',
//         }}
//       />
//     </div>
//   </div>
// )}

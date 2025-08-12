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
  Textarea,
} from '@mantine/core';

import { inputFormats, allLayers, outputFormats } from './config';
import { Statistics } from './types';
import {
  readFileContent,
  readFile,
  createOutputDirectories,
} from './fileHandlers';
import { overlayMaps, calculateStats } from './overlayLogic';
import {
  saveHexFile,
  saveMapExFile,
  saveWafermapFile,
  saveDebugFile,
} from './formatHandlers';
import { parseWlbiToMatrix, printInformWafermap } from './wlbiHandlers';

export default function WaferStacking() {
  const [showRoute, setShowRoute] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[][]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const processMapping = async () => {
    setProcessing(true);
    setResult(null);
    setDebugInfo(null);

    try {
      // 创建输出目录
      await createOutputDirectories(Object.values(outputFormats));

      const headers: Record<string, string>[] = [];
      const maps: string[][] = [];
      const formatNamesList: string[] = [];
      let cp1Header: Record<string, string> = {};
      let wlbiFilepath = '';

      for (const formatName of selectedLayers) {
        const filePath = inputFormats[formatName as keyof typeof inputFormats];
        if (!filePath) continue;

        // 读取文件内容
        const content = await readFileContent(filePath);
        if (!content) continue;

        // 解析文件
        let header: Record<string, string> = {};
        let mapData: string[] = [];

        if (formatName === 'WLBI') {
          wlbiFilepath = filePath;
          mapData = parseWlbiToMatrix(content);
          console.log(mapData);
        } else {
          const parsed = readFile(content);
          header = parsed.header;
          mapData = parsed.mapData;
          if (formatName === 'CP1') {
            cp1Header = { ...header };
          }
        }

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

      const debugFile = await saveDebugFile(debug, formatNamesList, stats);

      // 生成mapEx格式
      const useHeader = cp1Header || headers[0] || {};
      const mapExPath = await saveMapExFile(overlayedMap, stats, useHeader);

      // 生成HEX格式
      const hexPath = await saveHexFile(overlayedMap, cp1Header);

      // 生成wafermap格式
      const wafermapPath = await saveWafermapFile(
        overlayedMap,
        stats,
        useHeader
      );

      if (selectedLayers.includes('WLBI') && wlbiFilepath) {
        await printInformWafermap(overlayedMap, wlbiFilepath);
      }

      setResult(`叠图完成！已生成以下文件：
- 调试信息: ${debugFile}
- mapEx格式: ${mapExPath}
- HEX格式: ${hexPath}
- wafermap格式: ${wafermapPath}

统计信息:
总测试数: ${stats.totalTested}
通过数: ${stats.totalPass}
失败数: ${stats.totalFail}
良率: ${stats.yieldPercentage.toFixed(2)}%`);

      infoToast({ title: '成功', message: '叠图处理已完成' });
    } catch (error) {
      console.error('处理失败:', error);
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

          {/* 处理结果展示区 */}
          {result && (
            <Alert
              title='处理结果'
              color='blue'
              withCloseButton
              onClose={() => setResult(null)}
            >
              <Text>{result}</Text>

              {debugInfo && (
                <Stack mt='md'>
                  <Title order={4}>调试信息</Title>
                  <ScrollArea h={200} bg='gray.50' p='sm'>
                    <Textarea
                      value={debugInfo}
                      readOnly
                      minRows={10}
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                      }}
                    />
                  </ScrollArea>
                </Stack>
              )}

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
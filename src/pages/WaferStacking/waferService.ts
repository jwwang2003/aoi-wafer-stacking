import { join } from '@tauri-apps/api/path';
import { infoToast } from '@/components/Toaster';
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
  BinMapData,
  MapData,
  Wafer,
  AsciiDie,
  isNumberBin,
} from '@/types/ipc';
import { Statistics } from './types';
import {
  getLayerPriority,
  extractAlignmentMarkers,
  calculateOffset,
  applyOffsetToDies,
  mergeDiesWithPriority,
  convertDiesToMap,
  extractWaferHeader,
  extractMapDataHeader,
  convertToMapData,
  convertToBinMapData,
  convertToHexMapData,
} from './waferAlgorithm';

export const mergeHeaderService = (
  prevHeaders: Record<string, string>,
  newHeader: Record<string, string>
): Record<string, string> => {
  const merged = { ...prevHeaders };
  Object.entries(newHeader).forEach(([key, value]) => {
    if (!(key in merged)) merged[key] = value;
  });
  return merged;
};

export const handleAddTaskService = (
  prevTasks: string[][],
  selectedLayers: string[]
): string[][] => {
  if (selectedLayers.length === 0) return prevTasks;
  return [...prevTasks, selectedLayers];
};

export const handleBatchProcessService = (
  tasks: string[][]
): { newTasks: string[][]; message: string } => {
  const message = `Processing ${tasks.length} tasks`;
  return { newTasks: [], message };
};

interface ProcessMappingParams {
  selectedLayers: string[];
  processing: boolean;
  combinedHeaders: Record<string, string>;
  inputFormats: Record<string, string>;
  outputFormats: Record<string, string>;
  baseFileName: string;
  setProcessing: (status: boolean) => void;
}

export const processMappingService = async (
  params: ProcessMappingParams
): Promise<{
  result: string;
  debugInfo: string | null;
  newCombinedHeaders: Record<string, string>;
}> => {
  const {
    selectedLayers,
    combinedHeaders,
    inputFormats,
    outputFormats,
    baseFileName,
    setProcessing,
  } = params;

  setProcessing(true);
  let result = '';
  let debugInfo: string | null = null;
  let newCombinedHeaders = { ...combinedHeaders };

  try {
    const sortedLayers = selectedLayers.sort(
      (a, b) => getLayerPriority(b) - getLayerPriority(a)
    );

    await createOutputDirectories(Object.values(outputFormats));

    const originalDiesList: AsciiDie[][] = [];
    const formatNamesList: string[] = [];
    const headers: Record<string, string>[] = [];
    let cp1Header: Record<string, string> = {};
    const tempCombinedHeaders: Record<string, string> = { ...combinedHeaders };

    for (const formatName of sortedLayers) {
      const filePath = inputFormats[formatName as keyof typeof inputFormats];
      if (!filePath) continue;

      let content: BinMapData | MapData | Wafer | null = null;
      let header: Record<string, string> = {};
      let dies: AsciiDie[] = [];

      if (['CP1', 'CP2', 'AOI'].includes(formatName)) {
        content = await parseWaferMapEx(filePath);
        if (content && content.map.dies) {
          header = extractMapDataHeader(content);
          dies = content.map.dies;
          if (formatName === 'CP1') cp1Header = { ...header };
        }
      } else if (formatName === 'CP3') {
        content = await invokeParseWafer(filePath);
        if (content && content.map.dies) {
          header = extractWaferHeader(content);
          dies = content.map.dies;
        }
      } else if (formatName === 'WLBI') {
        content = await parseWaferMap(filePath);
        if (content && content.map) {
          dies = content.map.map((die) =>
            isNumberBin(die.bin) && die.bin.number === 257
              ? { ...die, bin: { special: '*' } }
              : die
          );
        }
      }

      if (!content || dies.length === 0) continue;

      Object.entries(header).forEach(([key, value]) => {
        if (!(key in tempCombinedHeaders)) tempCombinedHeaders[key] = value;
      });
      newCombinedHeaders = mergeHeaderService(newCombinedHeaders, header);
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
      console.log(`地图 ${formatNamesList[i]} 偏移: dx=${dx}, dy=${dy}`);
      alignedDiesList.push(applyOffsetToDies(currentDies, dx, dy));
    }

    const mergedDies = mergeDiesWithPriority(alignedDiesList, formatNamesList);
    const overlayedMap = convertDiesToMap(mergedDies);
    const stats: Statistics = calculateStats(overlayedMap);

    debugInfo = [
      `叠合完成，总数字bin数量: ${mergedDies.length}`,
      `图层优先级顺序: ${sortedLayers
        .map((l) => `${l}(${getLayerPriority(l)})`)
        .join(' > ')}`,
    ].join('\n');

    await saveDebugFile(debugInfo.split('\n'), formatNamesList, stats);

    const useHeader = {
      ...tempCombinedHeaders,
      ...(cp1Header || headers[0] || {}),
    };

    const mapExData = convertToMapData(overlayedMap, stats, useHeader);
    const mapExPath = await join(
      outputFormats['mapEx'],
      `${baseFileName}_overlayed.mapEx`
    );
    await exportWaferMapData(mapExData, mapExPath);

    const hexData = convertToHexMapData(overlayedMap, useHeader);
    const hexPath = await join(
      outputFormats['HEX'],
      `${baseFileName}_overlayed.hex`
    );
    await exportWaferHex(hexData, hexPath);

    const binData = convertToBinMapData(mergedDies, useHeader);
    const binPath = await join(
      outputFormats['bin'],
      `${baseFileName}_overlayed.bin`
    );
    await exportWaferBin(binData, binPath);

    result = '叠图完成！';
    infoToast({ title: '成功', message: '叠图处理已完成' });
  } catch (error) {
    console.error('处理失败:', error);
    result = `处理失败: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    setProcessing(false);
  }

  return { result, debugInfo, newCombinedHeaders };
};
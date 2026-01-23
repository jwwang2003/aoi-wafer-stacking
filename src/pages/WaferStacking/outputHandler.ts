import { join } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';
import {
    exportWaferHex,
    exportWaferMapData,
    exportWaferBin,
    exportWaferJpg,
} from '@/api/tauri/wafer';
import { AsciiDie } from '@/types/ipc';
import { renderAsJpg, renderSubstrateAsJpg } from './renderUtils';
import { processInkRules } from './inkRuleProcessor';
import {
    convertToMapData,
    convertToBinMapData,
    convertToHexMapData,
    calculateStatsFromDies,
} from '@/utils/waferSubstrateRenderer';

export interface WaferOutputConfig {
    baseFileName: string;
    outputRootDir: string;
    mergedDies: AsciiDie[];
    stats: ReturnType<typeof calculateStatsFromDies>;
    useHeader: Record<string, string>;
    selectedOutputs: ('mapEx' | 'bin' | 'HEX' | 'image')[];
    imageRenderer: 'bin' | 'substrate';
    allSubstrateDefects: Array<{ x: number; y: number; w: number; h: number; class: string }>;
    currentDieSize: { x: number; y: number };
    currentSubstrateOffset: { x: number; y: number };
    exportAsciiData: boolean;
}

export const exportNormalWaferFiles = async (config: WaferOutputConfig) => {
    const {
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
    } = config;

    if (selectedOutputs.includes('mapEx')) {
        const mapExData = convertToMapData(mergedDies, stats, useHeader);
        const mapExPath = await join(outputRootDir, `${baseFileName}_overlayed.txt`);
        await exportWaferMapData(mapExData, mapExPath);
    }

    if (selectedOutputs.includes('HEX')) {
        const hexData = convertToHexMapData(mergedDies, useHeader);
        const hexPath = await join(outputRootDir, `${baseFileName}_overlayed.sinf`);
        await exportWaferHex(hexData, hexPath);
    }

    if (selectedOutputs.includes('bin')) {
        const binData = convertToBinMapData(mergedDies, useHeader);
        const binPath = await join(outputRootDir, `${baseFileName}_overlayed.WaferMap`);
        await exportWaferBin(binData, binPath);
    }

    if (selectedOutputs.includes('image')) {
        const imagePath = await join(outputRootDir, `${baseFileName}_overlayed.jpg`);
        const imageData = imageRenderer === 'substrate'
            ? await renderSubstrateAsJpg(mergedDies, allSubstrateDefects, currentDieSize.x, currentDieSize.y, currentSubstrateOffset, useHeader)
            : await renderAsJpg(mergedDies, allSubstrateDefects, currentDieSize.x, currentDieSize.y, currentSubstrateOffset, useHeader);
        await exportWaferJpg(imageData, imagePath);
    }
};


export const exportInkWaferFiles = async (config: WaferOutputConfig) => {
    const {
        baseFileName,
        outputRootDir,
        mergedDies,
        useHeader,
        selectedOutputs,
        imageRenderer,
        allSubstrateDefects,
        currentDieSize,
        currentSubstrateOffset,
    } = config;

    const mapExSubDir = await join(outputRootDir, 'Ink');
    await mkdir(mapExSubDir, { recursive: true });

    const { processedDies } = processInkRules(mergedDies);
    const inkStats = calculateStatsFromDies(processedDies);
    console.log('Ink Stats:', inkStats);
    if (selectedOutputs.includes('mapEx')) {
        const mapExData = convertToMapData(processedDies, inkStats, useHeader);
        const mapExPath = await join(mapExSubDir, `${baseFileName}_overlayed.txt`);
        await exportWaferMapData(mapExData, mapExPath);
    }

    if (selectedOutputs.includes('HEX')) {
        const hexData = convertToHexMapData(processedDies, useHeader);
        const hexPath = await join(mapExSubDir, `${baseFileName}_overlayed.sinf`);
        await exportWaferHex(hexData, hexPath);
    }

    if (selectedOutputs.includes('bin')) {
        const binData = convertToBinMapData(processedDies, useHeader);
        const binPath = await join(mapExSubDir, `${baseFileName}_overlayed.WaferMap`);
        await exportWaferBin(binData, binPath);
    }

    if (selectedOutputs.includes('image')) {
        const imagePath = await join(mapExSubDir, `${baseFileName}_overlayed.jpg`);
        const imageData = imageRenderer === 'substrate'
            ? await renderSubstrateAsJpg(processedDies, allSubstrateDefects, currentDieSize.x, currentDieSize.y, currentSubstrateOffset, useHeader)
            : await renderAsJpg(processedDies, allSubstrateDefects, currentDieSize.x, currentDieSize.y, currentSubstrateOffset, useHeader);
        await exportWaferJpg(imageData, imagePath);
    }
};


export const exportWaferFiles = async (config: WaferOutputConfig) => {
    // 输出普通文件
    await exportNormalWaferFiles(config);

    // 输出INK文件
    if (config.exportAsciiData) {
        await exportInkWaferFiles(config);
    }
};

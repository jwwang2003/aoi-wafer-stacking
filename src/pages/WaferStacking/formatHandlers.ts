import { join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { outputFormats, baseFileName } from './config';
import { Statistics } from './types';

/**
 * 生成HEX格式内容
 * @param mapData 地图数据
 * @param header 头部信息
 * @returns HEX格式内容
 */
const generateHex = (mapData: string[], header?: string[]) => {
    const hexLines: string[] = [];

    if (header) {
        hexLines.push(...header);
        hexLines.push('');
    }

    const digitCount: Record<string, number> = {};

    for (const row of mapData) {
        const processedRow: string[] = [];
        for (const char of row) {
            if (char === '.' || char === 'S') {
                processedRow.push('__ ');
            } else if (char.match(/\d/)) {
                processedRow.push(`0${char} `);
                digitCount[char] = (digitCount[char] || 0) + 1;
            } else {
                processedRow.push(`*${char} `);
            }
        }
        hexLines.push(`Rowdata: ${processedRow.join('')}`);
    }

    return hexLines.join('\n');
};

/**
 * 保存HEX格式文件
 * @param mapData 地图数据
 * @param cp1Header CP1头部信息
 * @returns 文件路径
 */
export const saveHexFile = async (
    mapData: string[],
    cp1Header?: Record<string, string>
) => {
    const hexHeader = cp1Header
        ? [
            `DEVICE:${cp1Header['Device Name'] || 'Unknown'}`,
            `LOT:${cp1Header['Lot No.'] || 'Unknown'}`,
            `WAFER:${cp1Header['Wafer ID'] || 'Unknown'}`,
            'FNLOC:0',
            `ROWCT:${mapData.length}`,
            `COLCT:${mapData[0]?.length || 0}`,
            'BCEQU:01',
            'REFPX:1',
            'REFPY:28',
            'DUTMS:MM',
            `XDIES:${cp1Header['Dice SizeX']
                ? (parseFloat(cp1Header['Dice SizeX']) / 1000).toFixed(5)
                : 'Unknown'
            }`,
            `YDIES:${cp1Header['Dice SizeY']
                ? (parseFloat(cp1Header['Dice SizeY']) / 1000).toFixed(5)
                : 'Unknown'
            }`,
        ]
        : [];

    const hexContent = generateHex(mapData, hexHeader);
    const hexPath = await join(
        outputFormats['HEX'],
        `${baseFileName}_overlayed.hex`
    );
    await writeTextFile(hexPath, hexContent);

    return hexPath;
};

/**
 * 保存mapEx格式文件
 * @param mapData 地图数据
 * @param stats 统计信息
 * @param header 头部信息
 * @returns 文件路径
 */
export const saveMapExFile = async (
    mapData: string[],
    stats: Statistics,
    header: Record<string, string>
) => {
    const mapExContent: string[] = [];
    Object.entries(header).forEach(([key, value]) => {
        switch (key) {
            case 'Total Tested':
                mapExContent.push(`${key}: ${stats.totalTested}`);
                break;
            case 'Total Pass':
                mapExContent.push(`${key}: ${stats.totalPass}`);
                break;
            case 'Total Fail':
                mapExContent.push(`${key}: ${stats.totalFail}`);
                break;
            case 'Yield':
                mapExContent.push(`${key}: ${stats.yieldPercentage.toFixed(2)}%`);
                break;
            default:
                mapExContent.push(`${key}: ${value}`);
        }
    });
    mapExContent.push('');
    mapExContent.push(...mapData);

    const mapExPath = await join(
        outputFormats['mapEx'],
        `${baseFileName}_overlayed.mapEx`
    );
    await writeTextFile(mapExPath, mapExContent.join('\n'));

    return mapExPath;
};

/**
 * 保存wafermap格式文件
 * @param mapData 地图数据
 * @param stats 统计信息
 * @param header 头部信息
 * @returns 文件路径
 */
export const saveWafermapFile = async (
    mapData: string[],
    stats: Statistics,
    header: Record<string, string>
) => {
    const wafermapContent: string[] = [];
    Object.entries(header).forEach(([key, value]) => {
        switch (key) {
            case 'Total Tested':
                wafermapContent.push(`${key}: ${stats.totalTested}`);
                break;
            case 'Total Pass':
                wafermapContent.push(`${key}: ${stats.totalPass}`);
                break;
            case 'Total Fail':
                wafermapContent.push(`${key}: ${stats.totalFail}`);
                break;
            case 'Yield':
                wafermapContent.push(`${key}: ${stats.yieldPercentage.toFixed(2)}%`);
                break;
            default:
                wafermapContent.push(`${key}: ${value}`);
        }
    });

    wafermapContent.push('');
    wafermapContent.push(...mapData);

    const wafermapPath = await join(
        outputFormats['wafermap'],
        `${baseFileName}_overlayed.wafermap`
    );
    await writeTextFile(wafermapPath, wafermapContent.join('\n'));

    return wafermapPath;
};

/**
 * 保存调试信息文件
 * @param debug 调试信息
 * @param formatNamesList 格式名称列表
 * @param stats 统计信息
 * @returns 文件路径
 */
export const saveDebugFile = async (
    debug: string[],
    formatNamesList: string[],
    stats: Statistics
) => {
    const debugFile = await join(outputFormats['debug'], 'debug.txt');
    await writeTextFile(
        debugFile,
        [
            `叠图顺序: ${formatNamesList.join(', ')}\n\n`,
            debug.join('\n'),
            '\n\n统计信息:',
            `总测试数: ${stats.totalTested}`,
            `通过数: ${stats.totalPass}`,
            `失败数: ${stats.totalFail}`,
            `良率: ${stats.yieldPercentage.toFixed(2)}%`,
        ].join('\n')
    );

    return debugFile;
};

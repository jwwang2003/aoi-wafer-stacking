import { join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { outputFormats, baseFileName } from './config';
import { readFileContent } from './fileHandlers';

/**
 * 解析WLBI格式文件的header信息
 * @param content 文件内容
 * @returns 解析后的header字典
 */
export const parseWlbiHeader = (content: string): Record<string, string> => {
    const header: Record<string, string> = {};
    const lines = content.split(/\r?\n/);
    let inHeaderSection = true;

    for (const line of lines) {
        const strippedLine = line.trim();

        if (strippedLine === '[MAP]:') {
            inHeaderSection = false;
            break;
        }

        if (!inHeaderSection || !strippedLine) continue;

        const colonMatch = strippedLine.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
        if (colonMatch) {
            const [, key, value] = colonMatch;
            header[key] = value;
            continue;
        }

        const equalMatch = strippedLine.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
        if (equalMatch) {
            const [, key, value] = equalMatch;
            header[key] = value;
            continue;
        }
    }
    return header;
};

/**
 * 解析WLBI格式文件为矩阵
 * @param content 文件内容
 * @returns 解析后的地图数据
 */
export const parseWlbiToMatrix = (content: string): string[] => {
    const lines = content.split('\n');
    const coordinates: [number, number, string][] = [];
    let inMapSection = false;

    for (const line of lines) {
        const strippedLine = line.trim();

        if (strippedLine === '[MAP]:') {
            inMapSection = true;
            continue;
        }

        if (!inMapSection) continue;

        if (
            strippedLine.startsWith('Total Prober') ||
            strippedLine.startsWith('Bin') ||
            strippedLine.startsWith('## END ##')
        ) {
            continue;
        }

        const parts = strippedLine.split(/\s+/);
        if (parts.length >= 3) {
            const x = parseInt(parts[0]);
            const y = parseInt(parts[1]);
            const binValue = parseInt(parts[2]);
            const value = binValue === 257 ? 'S' : binValue.toString();
            coordinates.push([x, y, value]);
        }
    }

    if (coordinates.length === 0) return [];

    const xValues = coordinates.map((c) => c[0]);
    const minX = Math.min(...xValues);
    const matrix: string[][] = [];
    const sortedCoords = coordinates.sort((a, b) =>
        a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]
    );

    let currentY: number | null = null;
    let currentRow: string[] = [];

    for (const [x, y, value] of sortedCoords) {
        if (currentY === null || y !== currentY) {
            if (currentRow.length > 0) {
                matrix.push(currentRow);
            }
            currentRow = [];
            currentY = y;
        }

        while (currentRow.length < x - minX) {
            currentRow.push('.');
        }
        currentRow.push(value);
    }

    if (currentRow.length > 0) {
        matrix.push(currentRow);
    }

    const maxLength = Math.max(...matrix.map((row) => row.length), 0);
    return matrix.map((row) => {
        while (row.length < maxLength) row.push('.');
        return row.join('');
    });
};

/**
 * 处理WLBI特殊格式输出
 * @param overlayedMap 叠图结果
 * @param wlbiFilepath WLBI文件路径
 * @returns 保存的文件路径
 */
export const printInformWafermap = async (
    overlayedMap: string[],
    wlbiFilepath: string,
    header: Record<string, string>
) => {
    const cleanedRow: string[] = [];
    for (const row of overlayedMap) {
        cleanedRow.push(row.replace(/\./g, ''));
    }
    const singleLine = cleanedRow.join('');

    const coordinates: [number, number][] = [];
    const content = await readFileContent(wlbiFilepath);
    const lines = content.split('\n');

    let inHeaderSection = true;
    for (const line of lines) {
        const strippedLine = line.trim();

        if (strippedLine === '[MAP]:') {
            inHeaderSection = false;
            continue;
        }

        if (
            inHeaderSection ||
            strippedLine.startsWith('Total Prober') ||
            strippedLine.startsWith('Bin') ||
            strippedLine.startsWith('## END ##')
        ) {
            continue;
        }

        const parts = strippedLine.split(/\s+/);
        if (parts.length >= 3) {
            const x = parseInt(parts[0]);
            const y = parseInt(parts[1]);
            coordinates.push([x, y]);
        }
    }

    // 更新坐标值并统计Bin
    const binCounts: Record<string, number> = {};
    const updatedCoordinates: [number, number, string][] = [];
    let index = 0;

    for (const [x, y] of coordinates) {
        if (index < singleLine.length) {
            const binValue = singleLine[index] === 'S' ? '257' : singleLine[index];
            updatedCoordinates.push([x, y, binValue]);
            binCounts[binValue] = (binCounts[binValue] || 0) + 1;
            index++;
        } else {
            break;
        }
    }

    const totalTested = updatedCoordinates.length - 2;
    let totalPass = 0;
    for (const [binValue, count] of Object.entries(binCounts)) {
        if (binValue === '1' || binValue === 'A' || binValue === 'B' || binValue === 'C') {
            totalPass += count;
        }
    }

    const outputLines: string[] = [
        `WaferType: ${header?.['WaferType'] ? parseInt(header['WaferType']) : 0}`,
        `DUT: ${header?.['DUT'] ? parseInt(header['DUT']) : 0}`,
        `Mode: ${header?.['Mode'] ? parseInt(header['Mode']) : 0}`,
        `notch: ${header?.['Flat/Notch'] || 'Unknown'}`,
        `Product: ${header?.['Device Name'] || 'Unknown'}`,
        `Wafer Lots: ${header?.['Lot No.'] || 'Unknown'}`,
        `Wafer No: ${header?.['Wafer ID'] || 'Unknown'}`,
        `Wafer Size: ${header?.['Wafer Size'] ? parseFloat(header['Wafer Size']).toFixed(3) : 6.000}`,
        `Index X: ${header?.['Dice SizeX'] ? parseFloat(header['Dice SizeX']).toFixed(3) : 0.000}`,
        `Index Y: ${header?.['Dice SizeY'] ? parseFloat(header['Dice SizeY']).toFixed(3) : 0.000}`,
    ];

    outputLines.push('\n[MAP]:');
    for (const [x, y, value] of updatedCoordinates) {
        outputLines.push(`${x} ${y} ${value}`);
    }

    outputLines.push(`\nTotal Prober Test Dies: ${totalTested}`);
    outputLines.push(`Total Prober Pass Dies: ${totalPass}`);

    let binLine = '';
    for (let binNum = 0; binNum <= 150; binNum++) {
        const binStr = binNum < 100
            ? `Bin ${binNum.toString().padStart(2, ' ')}`
            : `Bin${binNum.toString().padStart(3, ' ')}`;
        const count = binCounts[binNum.toString()] || 0;

        binLine += `${binStr}    ${count},  `;
        if (binNum > 0 && binNum % 7 === 0) {
            outputLines.push(binLine);
            binLine = '';
        }
    }
    if (binLine) outputLines.push(binLine);

    outputLines.push('\n\n## END ##');

    const outputPath = await join(
        outputFormats['wafermap'],
        `${baseFileName}_overlayed.wafermap`
    );
    await writeTextFile(outputPath, outputLines.join('\n'));

    return outputPath;
};

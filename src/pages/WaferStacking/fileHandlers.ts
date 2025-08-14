import { readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { resolve } from '@tauri-apps/api/path';
import { ParsedFileData } from './types';

/**
 * 读取文件内容
 * @param filePath 文件路径
 * @returns 文件内容字符串
 */
export const readFileContent = async (filePath: string): Promise<string> => {
    try {
        const pathMap: Record<string, string> = {
            AOI: 'DEMO/AOI-01/S1M040120B_B003990/S1M040120B_B003990_02_20250721095040.txt',
            CP1: 'DEMO/CP-prober-01/S1M040120B_B003990_1_0/S1M040120B_B003990_02/S1M040120B_B003990_02_mapEx.txt',
            CP2: 'DEMO/CP-prober-02/S1M040120B_B003990_2_0/S1M040120B_B003990_02/S1M040120B_B003990_02_mapEx.txt',
            FAB_CP: 'DEMO/FAB CP/BinMap/B003990/P0097B_B003990_02.txt',
            WLBI: 'DEMO/WLBI-02/S1M040120B_B003990_1_0/WaferMap/B003990-02_20250325_165831.WaferMap',
        };

        let actualPath = '';
        const keyToDir = {
            AOI: 'AOI-01',
            CP1: 'CP-prober-01',
            CP2: 'CP-prober-02',
            FAB_CP: 'FAB CP',
            WLBI: 'WLBI-02',
        };

        for (const [key, dir] of Object.entries(keyToDir)) {
            if (filePath.includes(dir)) {
                actualPath = pathMap[key];
                break;
            }
        }
        if (!actualPath) {
            throw new Error(`未找到与 ${filePath} 匹配的文件路径`);
        }

        const fullPath = await resolve(
            '/Users/tan/Downloads/wafer-overlay-main/aoi-wafer-stacking/src/pages/WaferStacking/',
            actualPath
        );

        return await readTextFile(fullPath);
    } catch (error) {
        console.error('读取文件失败:', error);
        return '';
    }
};

/**
 * 解析文件为头部和地图数据
 * @param content 文件内容
 * @returns 解析后的头部和地图数据
 */
export const readFile = (content: string): ParsedFileData => {
    const lines = content.split('\n');
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
        if (
            lines[i].includes('.*') ||
            lines[i].includes('.S') ||
            lines[i].includes('[MAP]:')
        ) {
            startLine = i;
            break;
        }
    }

    const header: Record<string, string> = {};
    for (const line of lines.slice(0, startLine)) {
        if (line.includes(': ')) {
            const [key, value] = line.split(': ', 2);
            header[key.trim()] = value.trim();
        }
    }

    const mapData: string[] = [];
    for (const line of lines.slice(startLine)) {
        const strippedLine = line.trim();
        if (strippedLine && !strippedLine.startsWith('##')) {
            mapData.push(strippedLine);
        }
    }

    return { header, mapData };
};

/**
 * 创建输出目录
 * @param directories 目录路径数组
 */
export const createOutputDirectories = async (directories: string[]) => {
    for (const dir of directories) {
        await mkdir(dir, { recursive: true });
    }
};

import { getSubfolders } from '@/utils/fs';
import { DataSourceRegexState, DataSourceType } from '@/types/DataSource';

/**
 * Returns a categorized mapping of folder types to matched subfolder paths.
 *
 * @param rootPath The root directory
 * @param regexMap The regex strings from Redux state.config.regex
 * @returns A Promise resolving to an object like:
 *   {
 *     substrate: ['/path/Substrate123'],
 *     aoi: ['/path/AOI-456'],
 *     ...
 *   }
 */
export async function autoRecognizeFoldersByType(
    rootPath: string | undefined,
    regexMap: DataSourceRegexState
): Promise<Record<DataSourceType, string[]>> {
    if (!rootPath) {
        throw new Error('请先设置根目录！');
    }

    const subfolders = await getSubfolders(rootPath);
    const folderMatches: Record<DataSourceType, string[]> = {
        substrate: [],
        fabCp: [],
        cpProber: [],
        wlbi: [],
        aoi: [],
    };

    for (const [key, regexStr] of Object.entries(regexMap)) {
        try {
            const regex = new RegExp(regexStr);
            const matchedPaths = subfolders.filter((folderPath) => {
                const folderName = folderPath.split(/[\\/]/).pop() || '';
                return regex.test(folderName);
            });

            if (key in folderMatches) {
                folderMatches[key as DataSourceType] = matchedPaths;
            } else {
                console.warn(`无效类型: ${key}`);
            }
        } catch {
            console.warn(`无效正则: ${key} → ${regexStr}`);
        }
    }

    const totalMatches = Object.values(folderMatches).flat().length;
    if (totalMatches === 0) {
        throw new Error('未识别到任何符合的子文件夹。请检查正则表达式和文件夹结构。');
    }

    console.debug('数据源子目录自动识别结果:', folderMatches);
    return folderMatches;
}
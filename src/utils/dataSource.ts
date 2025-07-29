import { toast } from 'react-toastify';

import { getSubfolders } from '@/utils/fs';
import { RegexState } from "@/types/DataSource"
// import { FolderGroups } from "@/types/DataSourceFolder";

/**
 * Returns a categorized mapping of folder types to matched subfolder paths.
 *
 * @param rootPath The root directory
 * @param regexMap The regex strings from Redux state.config.regex
 * @returns A Promise resolving to an object like:
 *   {
 *     SubstrateRegex: ['/path/Substrate123'],
 *     AoiRegex: ['/path/AOI-456'],
 *     ...
 *   }
 */
export async function autoRecognizeFoldersByType(
    rootPath: string | undefined,
    regexMap: RegexState
): Promise<Record<string, string[]>> {
    if (!rootPath) {
        toast.error('请先设置根目录！');
        return {};
    }

    try {
        const subfolders = await getSubfolders(rootPath);
        const folderMatches: Record<string, string[]> = {};

        for (const [key, regexStr] of Object.entries(regexMap)) {
            try {
                const regex = new RegExp(regexStr);
                folderMatches[key] = subfolders.filter((folderPath) => {
                    const folderName = folderPath.split(/[\\/]/).pop() || '';
                    return regex.test(folderName);
                });
            } catch {
                folderMatches[key] = [];
                console.warn(`无效正则: ${key} → ${regexStr}`);
            }
        }

        const totalMatches = Object.values(folderMatches).flat().length;

        toast.success(
            `识别完成，共识别到 ${totalMatches} 个有效子文件夹。`,
            {
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
            }
        );
        console.debug('数据源子目录自动识别结果:', folderMatches);

        return folderMatches;
    } catch (err) {
        console.error(err);
        toast.error('读取文件夹失败');
        return {};
    }
}
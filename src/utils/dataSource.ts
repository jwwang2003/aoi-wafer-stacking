import { DataSourceRegexState, DataSourceType } from '@/types/dataSource';

/**
 * Categorize subfolder **paths** by data source type using provided regex rules.
 *
 * How it works:
 * - Iterates over `regexMap` (from Redux), skipping the key `"lastModified"`.
 * - Compiles each regex string and tests it **against the folder basename** (not the full path).
 * - For every matching rule, pushes the **full** subfolder path into the corresponding bucket.
 * - Invalid regex strings or unknown type keys are safely skipped with a console warning.
 *
 * Notes:
 * - Matching is independent per type: a subfolder can appear in **multiple** buckets if multiple regexes match.
 * - Matching is case-sensitive by default (standard JS `RegExp`). Add flags like `(?i)` or use `/.../i` style in strings if needed.
 * - Input order is preserved within each bucket.
 *
 * @param subfolders Full paths of direct subfolders to classify (e.g., from `getSubfolders(...)`).
 * @param regexMap   Mapping of `DataSourceType` → regex string (e.g., `{ substrate: "^Substrate", aoi: "AOI" }`).
 *                   The special key `"lastModified"` (if present) is ignored.
 *
 * @returns A mapping from `DataSourceType` to arrays of **full** subfolder paths that matched, e.g.:
 */
export async function autoRecognizeFoldersByType(
    subfolders: string[],
    regexMap: DataSourceRegexState
): Promise<Record<DataSourceType, string[]>> {
    const folderMatches: Record<DataSourceType, string[]> = {
        substrate: [],
        fabCp: [],
        cpProber: [],
        wlbi: [],
        aoi: [],
    };

    for (const [key, regexStr] of Object.entries(regexMap)) {
        if (key === 'lastModified') continue;
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

    // console.debug('子目录自动识别结果:', folderMatches);
    return folderMatches;
}
import { invokeReadFileStatBatch } from '@/api/tauri/fs';
import { getDb } from '@/db/index';
import { DataSourceRegexState, DataSourceType, FolderGroupsState } from '@/types/dataSource';
import type { DirResult } from '@/types/ipc';
import { ExcelMetadata, ExcelType, DirCollection, RawWaferMetadataCollection, WaferFileMetadata } from '@/types/wafer';

/**
 * Folder / file name patterns for each data source directory layout.
 * These define the on-disk contract with the production machines; exported
 * so tests (see test/unit/scanTreeLayout.test.ts) can verify them against
 * the canonical fixture tree.
 */
// 型号/批次 token：允许 "-A"、".2" 这类后缀（如 SZ4MA25120BK-8、HL9188.20）。
// 下划线仍是字段分隔符，不允许出现在 token 内。
const ID = '[A-Za-z0-9][A-Za-z0-9.-]*';

export const SCAN_PATTERNS = {
    cpProber: {
        // 产品型号_批次号_工序_复测次数
        processFolder: new RegExp(`^(${ID})_(${ID})_(\\d+)_(\\d+)$`),
        // 产品型号_批次号_片号
        waferFolder: new RegExp(`^(${ID})_(${ID})_(\\d+)$`),
        // 产品型号_批次号_片号_mapEx.txt
        mapExFile: new RegExp(`^(${ID})_(${ID})_(\\d+)_mapEx\\.txt$`),
    },
    wlbi: {
        // 产品型号_批次号_工序_复测次数
        processFolder: new RegExp(`^(${ID})_(${ID})_(\\d+)_(\\d+)$`),
        waferMapFolder: /^WaferMap$/,
        // 批次号_片号_年月日_时分秒.WaferMap
        waferMapFile: new RegExp(`^(${ID})_([0-9]+)_([0-9]{8})_([0-9]{6})\\.WaferMap$`),
    },
    fabCp: {
        binMapFolder: /^BinMap$/,
        batchFolder: new RegExp(`^(${ID})$`),
        // oem型号_批次号_片号.txt
        mapFile: new RegExp(`^(${ID})_(${ID})_(\\d+)\\.txt$`),
    },
    aoi: {
        // 产品型号_批次号
        processFolder: new RegExp(`^(${ID})_(${ID})$`),
        // 产品型号_批次号_片号_年月日时分秒.txt
        mapFile: new RegExp(`^(${ID})_(${ID})_([0-9]+)_([0-9]{8})([0-9]{6})\\.txt$`),
    },
} as const;

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
            const regex = new RegExp(regexStr as string);
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

    // console.debug("子目录自动识别结果:", folderMatches);
    return folderMatches;
}

export async function getAllWaferFolders(state: FolderGroupsState): Promise<DirCollection> {
    const entries = Object.entries(state).filter(([key]) => key !== 'lastModified').map(e => [e[0], e[1].map(f => f.path)]) as [DataSourceType, string[]][];

    const results = await Promise.all(
        entries.map(async ([key, folderList]) => {
            const responses: DirResult[] = await invokeReadFileStatBatch(folderList);
            return [key, responses] as const;
        })
    );

    const dataSourceFolders: DirCollection = { substrate: [], cpProber: [], fabCp: [], wlbi: [], aoi: [] };
    for (const [key, folderResults] of results) dataSourceFolders[key] = folderResults;

    return dataSourceFolders;
}

export async function readAllWaferData(folders: DirCollection): Promise<RawWaferMetadataCollection> {
    // Execute all at the same time
    try {
        const substrate = await readSubstrateMetadata(folders.substrate);
        const cpProber = await readCpProberMetadata(folders.cpProber);
        const wlbi = await readWlbiMetadata(folders.wlbi);
        const aoi = await readAoiMetadata(folders.aoi);
        const fabCp = await readFabCpMetadata(folders.fabCp);

        const totDir = substrate.totDir + cpProber.totDir + wlbi.totDir + aoi.totDir + fabCp.totDir;
        const numRead = substrate.numRead + cpProber.numRead + wlbi.numRead + aoi.numRead + fabCp.numRead;
        const numCached = substrate.numCached + cpProber.numCached + wlbi.numCached + aoi.numCached + fabCp.numCached;
        const totMatch = substrate.totMatch + cpProber.totMatch + wlbi.totMatch + aoi.totMatch + fabCp.totMatch;
        const totAdded = substrate.totAdded + cpProber.totAdded + wlbi.totAdded + aoi.totAdded + fabCp.totAdded;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elapsed = (substrate as any).elapsed + (cpProber as any).elapsed + (wlbi as any).elapsed + (aoi as any).elapsed + (fabCp as any).elapsed;

        dirScanResultToast(
            { totDirs: totDir, numRead, numCached, totMatch, totAdded },
            elapsed,
            '读取元数据'
        );

        return [
            ...substrate.data,
            ...cpProber.data,
            ...wlbi.data,
            ...aoi.data,
            ...fabCp.data,
        ];
    } catch (err) {
        console.error(err);
    }

    return [];
}

/**
 * - `Substrate`
 *      - `Defect List`
 *          - `编号.xls`
 *      - `代工厂产品型号_年月日时分秒.xlsx`
 *      - `Product list.xlsx`
 * @param folders 
 * @returns 
 */
import { listDirs, listFiles, match, nameFromPath, flushIndexQueues } from '@/utils/fs';
import { scanPattern } from '@/utils/wafer';
import { logCacheReport } from '@/utils/console';
import { dirScanResultToast } from '@/components/UI/Toaster';
export async function readSubstrateMetadata(
    folders: DirResult[]
): Promise<{ data: ExcelMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const t0 = performance.now();
    const result: ExcelMetadata[] = [];

    const defectListFolder = /^Defect list$/;
    const defectXls = /^([A-Za-z0-9][A-Za-z0-9-]*)\.xls$/;
    const productMap = /^([A-Za-z0-9][A-Za-z0-9.-]*)_([0-9]{8})([0-9]{6})\.xlsx$/;
    const productList = /^Product list\.xlsx$/;

    let totDir = 0, numRead = 0, numCached = 0, totMatch = 0, totAdded = 0;

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        const {
            dirs: dlFolders,
            // cached: dlFoldersCached,
            totDir: totDirFolder,
            numRead: numReadFolders,
            numCached: numCachedFolders,
        } = await listDirs({ root: folder.path, name: defectListFolder });

        totDir += totDirFolder;
        numRead += numReadFolders;
        numCached += numCachedFolders;

        for (const dl of dlFolders) {
            const dlPath = dl.path;

            const {
                dirs,
                // cached,
                totDir: _totDir,
                numRead: _numRead,
                numCached: _numCached,
            } = await listFiles({ root: dlPath, name: defectXls });

            totDir += _totDir; numRead += _numRead; numCached += _numCached;

            for (const f of dirs) {
                const m = match(defectXls, nameFromPath(f.path)); if (!m) continue;
                const [, id] = m;
                const filePath = f.path
                result.push({
                    type: ExcelType.DefectList,
                    stage: DataSourceType.Substrate,
                    id,
                    filePath,
                    lastModified: Number(f.info?.mtime),
                });
                totMatch++; totAdded++;
            }
        }

        // 2) Root-level Excel files
        const {
            dirs,
            // cached,
            totDir: _totDir,
            numRead: _numRead,
            numCached: _numCached,
        } = await listFiles({ root: folder.path, name: /.+/ });

        totDir += _totDir; numRead += _numRead; numCached += _numCached;

        for (const f of dirs) {
            const m1 = match(productList, nameFromPath(f.path));
            const m2 = match(productMap, nameFromPath(f.path));
            const filePath = f.path;

            if (m1) {
                result.push({
                    type: ExcelType.Mapping,
                    stage: DataSourceType.Substrate,
                    filePath,
                    lastModified: Number(f.info?.mtime),
                });
                totMatch++; totAdded++;
            } else if (m2) {
                const [, oem, date, time] = m2;
                result.push({
                    type: ExcelType.Product,
                    stage: DataSourceType.Substrate,
                    oem,
                    time: parseWaferMapTimestamp(date, time).toISOString(),
                    filePath,
                    lastModified: Number(f.info?.mtime),
                });
                totMatch++; totAdded++;
            }
        }
    }

    const elapsed = performance.now() - t0;

    await flushIndexQueues();

    logCacheReport({
        dirs: 0,
        totDir,
        numCached,
        numRead,
        label: 'substrate',
        durationMs: Math.round(elapsed),
    });

    return { data: result, totDir, numRead, numCached, totMatch, totAdded, elapsed };
}

/**
 * TODO: Folder structure unclear at the moment (TBD)
 * @param folders 
 * @returns 
 */
// export async function readFabCpMetadata(folders: DirResult[]): Promise<WaferFileMetadata[]> {
//     const result: WaferFileMetadata[] = [];
//     folders.filter(() => true);
//     return result;
// }

/**
 * Folder structure
 * CP-prober-XX/    (we are here already)
 *      产品型号_批次号_工序_复测次数/
 *          产品型号_批次号_片号/
 *              产品型号_批次号_片号_mapExt.txt
 * @param folders 
 */
export async function readCpProberMetadata(
    folders: DirResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);

    const { processFolder, waferFolder, mapExFile: fileName } = SCAN_PATTERNS.cpProber;

    type Ctx = {
        productModel: string; batch: string; processSubStage: string; retestCount: string; waferId?: string;
    };

    const scanResult = await scanPattern<Ctx>(
        roots,
        {
            steps: [
                {
                    name: processFolder,
                    // onMatch: ([model, batch]) => true,
                    onMatch: () => true
                },
                {
                    name: waferFolder,
                    onMatch: (/*return false if mismatch*/) => true,
                },
            ],
            files: {
                name: fileName,
                onFile: () => { } // no-op; we"ll map after
            }
        },
        (level, _name, g) => {
            if (level === 0) {
                const [productModel, batch, processSubStage, retestCount] = g;
                return { productModel, batch, processSubStage, retestCount };
            }
            if (level === 1) {
                const [, , waferId] = g; // model,batch,wafer
                return { waferId };
            }
            return {};
        }
    );

    const { data: items } = scanResult;

    const result: WaferFileMetadata[] = [];
    for (const { ctx, filePath, lastModified } of items) {
        const ok =
            ctx.productModel && ctx.batch && ctx.waferId &&
            // sanity check (optional): names align across levels
            true;

        if (!ok) {
            console.error('Data misalignment in CP-prober!', { ctx, filePath });
            continue;
        }

        result.push({
            stage: DataSourceType.CpProber,
            productModel: ctx.productModel,
            processSubStage: Number(ctx.processSubStage),
            batch: ctx.batch,
            waferId: ctx.waferId!,
            retestCount: Number(ctx.retestCount),
            filePath,
            lastModified,
        });
    }

    await flushIndexQueues();

    return {
        ...scanResult,
        data: result,
    };
}

/**
 * - `WLBI-XX`
 *      - `产品型号_批次号_工序_复测次数`
 *          - `WaferMap`
 *              - `批次号_片号_年月日_时分秒.WaferMap`
 * @param folders 
 * @returns 
 */
export async function readWlbiMetadata(
    folders: DirResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);

    const { processFolder, waferMapFolder: wlbiFolder, waferMapFile: fileName } = SCAN_PATTERNS.wlbi;

    type Ctx = { productModel: string; batch: string; processSubStage: string; retestCount: string };

    const scanResult = await scanPattern<Ctx>(
        roots,
        {
            steps: [{ name: processFolder }, { name: wlbiFolder }],
            files: { name: fileName, onFile: () => { } }
        },
        (level, _name, g) => {
            if (level === 0) {
                const [productModel, batch, processSubStage, retestCount] = g;
                return { productModel, batch, processSubStage, retestCount };
            }
            return {};
        }
    );

    const {
        data: items
    } = scanResult;

    const result: WaferFileMetadata[] = [];
    for (const { ctx, filePath, lastModified } of items) {
        const m = fileName.exec(filePath.split('/').pop()!);
        if (!m) continue;
        const [, batch2, waferId, date, time] = m;

        if (batch2 !== ctx.batch) {
            console.error(`Data misalignment in WLBI! ${batch2} != ${ctx.batch}`, { ctx, filePath });
            continue;
        }

        result.push({
            stage: DataSourceType.Wlbi,
            productModel: ctx.productModel,
            processSubStage: Number(ctx.processSubStage),
            batch: batch2,
            waferId,
            retestCount: Number(ctx.retestCount),
            time: parseWaferMapTimestamp(date, time).toISOString(),
            filePath,
            lastModified,
        });
    }

    await flushIndexQueues();

    return {
        ...scanResult,
        data: result
    };
}

/** 去掉型号尾部的 "-A"/"-8" 一类后缀，得到基础型号 */
export const stripProductIdSuffix = (id: string): string => {
    const dashIndex = id.indexOf('-');
    return dashIndex > 0 ? id.slice(0, dashIndex) : id;
};

/**
 * FAB CP 文件里的 oem 型号可能带 "-A" 等后缀（或映射表里带而文件里不带）。
 * 先精确匹配 oem_product_map；查不到时按基础型号匹配，仅在唯一命中时采用。
 */
async function resolveFabCpProductModel(oemModel: string): Promise<string> {
    const db = await getDb();

    const exact = await db.select<Array<{ product_id: string }>>(
        'SELECT product_id FROM oem_product_map WHERE oem_product_id = ? LIMIT 1',
        [oemModel]
    );
    if (exact.length > 0) return exact[0].product_id;

    const base = stripProductIdSuffix(oemModel);
    const candidates = await db.select<Array<{ oem_product_id: string; product_id: string }>>(
        'SELECT oem_product_id, product_id FROM oem_product_map WHERE oem_product_id = ? OR oem_product_id LIKE ? LIMIT 2',
        [base, `${base}-%`]
    );
    if (candidates.length === 1) {
        console.warn(
            `[FAB CP] oem 型号 "${oemModel}" 未精确命中映射表，按基础型号匹配到 "${candidates[0].oem_product_id}"`
        );
        return candidates[0].product_id;
    }

    return oemModel;
}

/**
 * FAB CP 数据读取
 */
export async function readFabCpMetadata(
    folders: DirResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);
    const { binMapFolder, batchFolder, mapFile } = SCAN_PATTERNS.fabCp;

    type Ctx = { batch: string };

    const scanResult = await scanPattern<Ctx>(
        roots,
        {
            steps: [
                { name: binMapFolder },
                { name: batchFolder }
            ],
            files: { name: mapFile, onFile: () => { } }
        },
        (level, _name, g) => {
            if (level === 0) {
                return {};
            }
            if (level === 1) {
                const [batch] = g;
                return { batch };
            }
            return {};
        }
    );

    const {
        data: items
    } = scanResult;

    const result: WaferFileMetadata[] = [];
    for (const { ctx, filePath, lastModified } of items) {
        const m = mapFile.exec(filePath.split('/').pop()!);
        if (!m) continue;
        const [, oemModel, batchFromFile, waferId] = m;

        if (batchFromFile !== ctx.batch) {
            continue;
        }
        const productModel = await resolveFabCpProductModel(oemModel);

        result.push({
            stage: DataSourceType.FabCp,
            productModel: productModel,
            batch: ctx.batch,
            waferId,
            filePath,
            lastModified,
        });
    }

    await flushIndexQueues();
    return {
        ...scanResult,
        data: result
    };
}

/**
 * - `AOI-XX`
 *      - `产品型号_批次号`
 *          - `片号`
 *          - `产品型号_批次号_片号_年月日时分秒.txt`
 * @param folders 
 * @returns 
 */
export async function readAoiMetadata(
    folders: DirResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);
    const { processFolder, mapFile } = SCAN_PATTERNS.aoi;

    type Ctx = { productModel: string; batch: string };

    const scanResult = await scanPattern<Ctx>(
        roots,
        {
            steps: [{ name: processFolder }],
            files: { name: mapFile, onFile: () => { } }
        },
        (level, _name, g) => (level === 0 ? { productModel: g[0], batch: g[1] } : {})
    );

    const {
        data: items
    } = scanResult;

    const result: WaferFileMetadata[] = [];
    for (const { ctx, filePath, lastModified } of items) {
        const m = mapFile.exec(filePath.split('/').pop()!);
        if (!m) continue;
        const [, model2, batch2, waferId, date, time] = m;

        if (model2 !== ctx.productModel || batch2 !== ctx.batch) {
            console.error('Folder data structure misalignment in AOI!', { ctx, filePath });
            continue;
        }

        result.push({
            stage: DataSourceType.Aoi,
            productModel: ctx.productModel,
            batch: ctx.batch,
            waferId,
            time: parseWaferMapTimestamp(date, time).toISOString(),
            filePath,
            lastModified,
        });
    }

    await flushIndexQueues();

    return {
        ...scanResult,
        data: result
    };
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: Helper methods
////////////////////////////////////////////////////////////////////////////////

function parseWaferMapTimestamp(dateStr: string, timeStr: string): Date {
    // Example: dateStr = "20250709", timeStr = "120302"
    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateStr.slice(6, 8), 10);

    const hours = parseInt(timeStr.slice(0, 2), 10);
    const minutes = parseInt(timeStr.slice(2, 4), 10);
    const seconds = parseInt(timeStr.slice(4, 6), 10);

    return new Date(year, month, day, hours, minutes, seconds);
}
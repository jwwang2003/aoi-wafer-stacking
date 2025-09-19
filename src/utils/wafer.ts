import { listDirs, listFiles, join, match, nameFromPath } from './fs';
import { logCacheReport } from './console';
import { upsertManyWaferMaps, upsertManyWaferMapsWithStats } from '@/db/wafermaps';
import { ExcelMetadata, ExcelType, WaferFileMetadata } from '@/types/wafer';
import { ProductDefectIngestStats, SubstrateDefectIngestStats, WaferMapIngestStats } from '@/types/ingest';

type FolderStep = {
    name: RegExp;
    onMatch?: (groups: string[]) => void | boolean;
};

type FileStep = {
    name: RegExp;
    onFile: (ctx: Record<string, string>, absPath: string, lastModified: number) => void;
};

type Pattern = {
    steps: FolderStep[];
    files: FileStep;
};

export async function scanPattern<T extends Record<string, string>>(
    roots: string[],
    pattern: Pattern,
    contextFromFolder: (level: number, folderName: string, groups: string[]) => Partial<T>
): Promise<{
    data: { ctx: T; filePath: string; lastModified: number }[];
    totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number; elapsed: number;
}> {
    let totDir = 0, numRead = 0, numCached = 0, totMatch = 0, totAdded = 0, elapsed = 0;

    const readDirs: string[] = [];
    const cachedDirs: string[] = [];
    const readFiles: string[] = [];
    const cachedFiles: string[] = [];

    async function walk(level: number, parentPath: string, ctx: T) {
        if (level === pattern.steps.length) {
            const t0 = performance.now();
            const { dirs, cached, totDir: totFiles, numCached: numCachedFile, numRead: numReadFile } =
                await listFiles({ root: parentPath, name: pattern.files.name });
            elapsed += performance.now() - t0;

            totDir += totFiles; numRead += numReadFile; numCached += numCachedFile;

            for (const f of dirs) {
                const name = nameFromPath(f.path);
                const m = match(pattern.files.name, name); if (!m) continue;
                totMatch++;
                totAdded++;
                const filePath = f.path;
                readFiles.push(filePath);
                pattern.files.onFile(ctx, filePath, Number(f.info?.mtime));
            }
            for (const cache of cached) {
                const filepath = cache.file_path;
                const filename = nameFromPath(filepath);
                const m = match(pattern.files.name, filename); if (!m) continue;
                cachedFiles.push(filepath);
                // pattern.files.onFile(ctx, filepath, Number(cache.last_mtime));
            }
            return;
        }

        const step = pattern.steps[level];
        const t1 = performance.now();
        const { dirs, cached, totDir: totFolders, numCached: numCachedFolder, numRead: numReadFolder } =
            await listDirs({ root: parentPath, name: step.name });
        elapsed += performance.now() - t1;

        totDir += totFolders; numRead += numReadFolder; numCached += numCachedFolder;

        for (const d of dirs) {
            const name = nameFromPath(d.path);
            const m = match(step.name, name)!;
            const [, ...g] = m;
            if (step.onMatch && step.onMatch(g) === false) continue;
            totMatch++;
            totAdded++;
            const nextCtx = { ...ctx, ...contextFromFolder(level, name, g) } as T;
            const nextPath = await join(parentPath, name);
            readDirs.push(nextPath);
            await walk(level + 1, nextPath, nextCtx);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const d of cached as any[]) {
            const folderPath: string = typeof d === 'string' ? await join(parentPath, d) : d.folder_path;
            const folderName = await nameFromPath(folderPath);
            const m = match(step.name, folderName)!; const [, ...g] = m;
            if (step.onMatch && step.onMatch(g) === false) continue;
            cachedDirs.push(folderPath);
        }
    }

    const items: Array<{ ctx: T; filePath: string; lastModified: number }> = [];
    const push = (ctx: T, filePath: string, lastModified: number) => items.push({ ctx, filePath, lastModified });

    const originalOnFile = pattern.files.onFile;
    pattern.files.onFile = (ctx, p, m) => { push(ctx as T, p, m); originalOnFile(ctx, p, m); };

    for (const r of roots) await walk(0, r, {} as T);
    pattern.files.onFile = originalOnFile;

    logCacheReport({
        dirs: 0,
        totDir,
        numCached,
        numRead,
        label: 'scanPattern',
        durationMs: elapsed,
    });

    return { data: items, totDir, numRead, numCached, totMatch, totAdded, elapsed };
}

/** Helper: dynamic import of spreadsheet-related functions (only when needed). */
async function getSpreadsheetApis() {
    const waferApi = await import('@/api/tauri/wafer');
    const sheetDb = await import('@/db/spreadSheet');
    return {
        invokeParseProductMappingXls: waferApi.invokeParseProductMappingXls,
        invokeParseProductXls: waferApi.invokeParseProductXls,
        maintainOemMapping: sheetDb.maintainOemMapping,
        upsertManyProductDefectMaps: sheetDb.upsertManyProductDefectMaps,
        upsertManyProductDefectMapsWithStats: sheetDb.upsertManyProductDefectMapsWithStats,
        upsertSubstrateDefect: sheetDb.upsertSubstrateDefect,
    };
}

/**
 * Process a batch of parsed Excel files (non‑synchronously) and persist their contents,
 * with **dynamic imports** for spreadsheet parsers/DB writes to keep initial bundle light.
 */
export async function processNSyncExcelData(data: ExcelMetadata[]): Promise<number> {
    const name = 'Proc. N. Sync. Excel Data';
    let sum = 0;

    const typeOrder: Record<ExcelType, number> = {
        [ExcelType.Mapping]: 0,
        [ExcelType.Product]: 1,
        [ExcelType.DefectList]: 2,
    };

    data.sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));

    console.groupCollapsed(`%c[${name}]`, 'color: lightblue;');

    // Lazy-load once here (still deferred until this function is called).
    const {
        invokeParseProductMappingXls,
        invokeParseProductXls,
        maintainOemMapping,
        upsertManyProductDefectMaps,
        upsertSubstrateDefect,
    } = await getSpreadsheetApis();

    for (const d of data) {
        console.groupCollapsed(`%c[${d.type}]`, 'color: lightgreen;');

        switch (d.type) {
            case ExcelType.Mapping: {
                const xlsResult = await invokeParseProductMappingXls(d.filePath);
                const results = Object.values(xlsResult).flat();
                const dbResult = await maintainOemMapping(
                    results
                        .filter(r => r.oemId && r.productId)
                        .map(r => ({
                            oem_product_id: r.oemId,
                            product_id: r.productId,
                        }))
                );
                sum += dbResult.tot;
                console.debug('%c[excel] upsert OEM mapping', 'color:#6b7280', { dbResult });
                break;
            }
            case ExcelType.Product: {
                const xlsResult = await invokeParseProductXls(d.filePath);
                const results = Object.values(xlsResult).flat();
                const dbResult = await upsertManyProductDefectMaps(
                    results
                        .filter(r => r.productId)
                        .map(r => ({
                            oem_product_id: r.productId,   // NOTE: productId in XLS == OEM product id
                            lot_id: r.batchId,
                            wafer_id: r.waferId,
                            sub_id: r.subId,
                            file_path: d.filePath,
                        }))
                );
                sum += dbResult;
                console.debug('%c[excel] upsert product defect maps', 'color:#6b7280', {
                    dbResult,
                    inputCount: results.length,
                    sanityCheck: Boolean(dbResult === results.length),
                });
                break;
            }
            case ExcelType.DefectList: {
                // We only record the file location at this stage
                const dbResult = await upsertSubstrateDefect({
                    sub_id: d.id!,
                    file_path: d.filePath,
                });
                if (dbResult) sum += 1;
                console.debug('%c[excel] upsert substrate defect', 'color:#6b7280', { dbResult });
                break;
            }
        }

        console.groupEnd();
    }

    console.groupEnd();
    return sum;
}

/**
 * Batch-sync an array of WaferFileMetadata into SQLite’s `wafer_maps` table,
 * updating only when the incoming record is newer. (kept static)
 */
export async function processNSyncWaferData(records: WaferFileMetadata[]): Promise<number> {
    const name = 'Proc. N. Sync. Wafer Data';
    console.groupCollapsed(`%c[${name}]`, 'color: lightblue;');
    try {
        const dbResult = await upsertManyWaferMaps(
            records.map(r => ({
                product_id: r.productModel,          // internal product_id (not OEM)
                batch_id: r.batch,
                wafer_id: Number(r.waferId),
                stage: r.stage,
                sub_stage: String(r.processSubStage ?? 0),
                retest_count: r.retestCount ?? 0,
                time: Number(r.time ?? 0),
                file_path: r.filePath,
            }))
        );
        console.debug('%c[wafer] upsert wafer maps', 'color:#6b7280', { dbResult });
        return dbResult;
    } catch (err) {
        const msg = `[${name}] ${err instanceof Error ? err.message : String(err)}`;
        console.error(msg);
        throw err;
    } finally {
        console.groupEnd();
    }
}

/**
 * Detailed ingest with statistics, to drive UI status. Keeps original ingest logic but
 * returns insert/update/duplicate counts and keys.
 */
export async function processNSyncExcelDataWithStats(data: ExcelMetadata[]): Promise<{
    productDefects: ProductDefectIngestStats;
    substrateDefects: SubstrateDefectIngestStats;
}> {
    const name = 'Proc. N. Sync. Excel Data (stats)';
    const typeOrder: Record<ExcelType, number> = {
        [ExcelType.Mapping]: 0,
        [ExcelType.Product]: 1,
        [ExcelType.DefectList]: 2,
    };
    const sorted = [...data].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));

    console.groupCollapsed(`%c[${name}]`, 'color: lightblue;');

    const {
        invokeParseProductMappingXls,
        invokeParseProductXls,
        maintainOemMapping,
        upsertManyProductDefectMapsWithStats,
        upsertSubstrateDefect,
    } = await getSpreadsheetApis();

    // Product defect maps aggregation
    const productInputs: Array<{ oem_product_id: string; lot_id: string; wafer_id: string; sub_id: string; file_path: string } > = [];
    // Substrate defects aggregation (DefectList)
    const substrateIds: Array<{ sub_id: string; file_path: string }> = [];

    for (const d of sorted) {
        console.groupCollapsed(`%c[${d.type}]`, 'color: lightgreen;');
        switch (d.type) {
            case ExcelType.Mapping: {
                // Still perform mapping maintenance; we won't compute insert vs update for mapping for now
                const xls = await invokeParseProductMappingXls(d.filePath);
                const pairs = Object.values(xls).flat().filter(r => r.oemId && r.productId).map(r => ({
                    oem_product_id: r.oemId,
                    product_id: r.productId,
                }));
                await maintainOemMapping(pairs);
                break;
            }
            case ExcelType.Product: {
                const xls = await invokeParseProductXls(d.filePath);
                const results = Object.values(xls).flat();
                for (const r of results) {
                    if (!r.productId) continue;
                    productInputs.push({
                        oem_product_id: r.productId,   // productId in XLS == OEM product id
                        lot_id: r.batchId,
                        wafer_id: r.waferId,
                        sub_id: r.subId,
                        file_path: d.filePath,
                    });
                }
                break;
            }
            case ExcelType.DefectList: {
                if (d.id) substrateIds.push({ sub_id: d.id, file_path: d.filePath });
                break;
            }
        }
        console.groupEnd();
    }

    // Run product defects upsert with stats
    const pdStatsRaw = await upsertManyProductDefectMapsWithStats(productInputs);
    const productDefects: ProductDefectIngestStats = {
        input: productInputs.length,
        unique: pdStatsRaw.unique,
        duplicates: pdStatsRaw.duplicates,
        duplicateKeys: pdStatsRaw.duplicateKeys,
        existing: pdStatsRaw.existing,
        inserted: pdStatsRaw.insertedKeys.length,
        updated: pdStatsRaw.updatedKeys.length,
        insertedKeys: pdStatsRaw.insertedKeys,
        updatedKeys: pdStatsRaw.updatedKeys,
    };

    // Substrate defects: compute existing vs inserted, then upsert one-by-one (rarely huge)
    const subIdMap = new Map<string, string>();
    let substrateDuplicates = 0;
    const dupSubIds = new Set<string>();
    for (const s of substrateIds) {
        if (subIdMap.has(s.sub_id)) { substrateDuplicates += 1; dupSubIds.add(s.sub_id); }
        subIdMap.set(s.sub_id, s.file_path);
    }
    const uniqueSubIds = Array.from(subIdMap.keys());

    // Query existing
    const db = await (await import('@/db')).getDb();
    const existingSubIdSet = new Set<string>();
    const CHUNK = 300;
    for (let i = 0; i < uniqueSubIds.length; i += CHUNK) {
        const batch = uniqueSubIds.slice(i, i + CHUNK);
        const placeholders = batch.map(() => '?').join(',');
        const found = await db.select<{ sub_id: string }[]>(`SELECT sub_id FROM substrate_defect WHERE sub_id IN (${placeholders})`, batch);
        for (const f of found) existingSubIdSet.add(f.sub_id);
    }

    const insertedIds: string[] = [];
    const updatedIds: string[] = [];
    for (const sid of uniqueSubIds) (existingSubIdSet.has(sid) ? updatedIds : insertedIds).push(sid);

    // Perform actual upserts
    for (const sid of uniqueSubIds) await upsertSubstrateDefect({ sub_id: sid, file_path: subIdMap.get(sid)! });

    const substrateDefects: SubstrateDefectIngestStats = {
        input: substrateIds.length,
        unique: uniqueSubIds.length,
        duplicates: substrateDuplicates,
        duplicateIds: Array.from(dupSubIds),
        existing: existingSubIdSet.size,
        inserted: insertedIds.length,
        updated: updatedIds.length,
        insertedIds,
        updatedIds,
    };

    console.groupEnd();

    return { productDefects, substrateDefects };
}

export async function processNSyncWaferDataWithStats(records: WaferFileMetadata[]): Promise<WaferMapIngestStats> {
    const name = 'Proc. N. Sync. Wafer Data (stats)';
    console.groupCollapsed(`%c[${name}]`, 'color: lightblue;');
    try {
        const dbResult = await upsertManyWaferMapsWithStats(
            records.map(r => ({
                product_id: r.productModel,
                batch_id: r.batch,
                wafer_id: Number(r.waferId),
                stage: r.stage,
                sub_stage: String(r.processSubStage ?? 0),
                retest_count: r.retestCount ?? 0,
                time: Number(r.time ?? 0),
                file_path: r.filePath,
            }))
        );
        const stats: WaferMapIngestStats = {
            input: records.length,
            unique: dbResult.unique,
            duplicates: dbResult.duplicates,
            duplicateFiles: dbResult.duplicateFiles,
            existing: dbResult.existing,
            inserted: dbResult.insertedFiles.length,
            updated: dbResult.updatedFiles.length,
            insertedFiles: dbResult.insertedFiles,
            updatedFiles: dbResult.updatedFiles,
        };
        console.debug('%c[wafer] upsert wafer maps (stats)', 'color:#6b7280', { stats });
        return stats;
    } finally {
        console.groupEnd();
    }
}

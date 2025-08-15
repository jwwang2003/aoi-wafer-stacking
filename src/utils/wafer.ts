import { listDirs, listFiles, join, match, nameFromPath } from './fs';
import { logCacheReport } from './console';
import { upsertManyWaferMaps } from '@/db/wafermaps';
import { ExcelMetadata, ExcelType, WaferFileMetadata } from '@/types/wafer';

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
        upsertSubstrateDefect: sheetDb.upsertSubstrateDefect,
    };
}

/**
 * Process a batch of parsed Excel files (non‑synchronously) and persist their contents,
 * with **dynamic imports** for spreadsheet parsers/DB writes to keep initial bundle light.
 */
export async function processNSyncExcelData(data: ExcelMetadata[]) {
    const name = 'Proc. N. Sync. Excel Data';

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
                console.log({ dbResult });
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
                console.log({
                    dbResult,
                    r: [dbResult, results.length],
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
                console.log({ dbResult });
                break;
            }
        }

        console.groupEnd();
    }

    console.groupEnd();
}

/**
 * Batch-sync an array of WaferFileMetadata into SQLite’s `wafer_maps` table,
 * updating only when the incoming record is newer. (kept static)
 */
export async function processNSyncWaferData(records: WaferFileMetadata[]) {
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
        console.log({ dbResult });
    } catch (err) {
        const msg = `[${name}] ${err instanceof Error ? err.message : String(err)}`;
        console.error(msg);
        throw err;
    } finally {
        console.groupEnd();
    }
}

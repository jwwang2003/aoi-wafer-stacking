// import { basename } from '@tauri-apps/api/path';
import { listDirs, listFiles, join, match, nameFromPath } from './fs';
import { logCacheReport } from './console';
import { ExcelMetadata, ExcelType, WaferFileMetadata } from '@/types/Wafer';
import { invokeParseProductMappingXls, invokeParseProductXls } from '@/api/tauri/wafer';
import { maintainOemMapping, upsertManyProductDefectMaps, upsertSubstrateDefect } from '@/db/spreadSheet';
import { upsertManyWaferMaps } from '@/db/wafermaps';

type FolderStep = {
    name: RegExp;                       // regex to select child dirs
    onMatch?: (groups: string[]) => void | boolean; // return false to skip this branch
};

type FileStep = {
    name: RegExp;                       // regex to select files
    onFile: (ctx: Record<string, string>, absPath: string, lastModified: number) => void;
};

type Pattern = {
    steps: FolderStep[];                // ordered folder levels
    files: FileStep;                    // terminal file rule
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

    // track both folders and files
    const readDirs: string[] = [];
    const cachedDirs: string[] = [];
    const readFiles: string[] = [];
    const cachedFiles: string[] = [];

    async function walk(level: number, parentPath: string, ctx: T) {
        if (level === pattern.steps.length) {
            // terminal: files
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

        // descend into next-level folders
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

        for (const d of cached as any[]) {
            const folderPath: string = typeof d === 'string' ? await join(parentPath, d) : d.folder_path;
            const folderName = await nameFromPath(folderPath);
            const m = match(step.name, folderName)!; const [, ...g] = m;
            if (step.onMatch && step.onMatch(g) === false) continue;
            // const nextCtx = { ...ctx, ...contextFromFolder(level, folderName, g) } as T;
            cachedDirs.push(folderPath);
            // await walk(level + 1, await join(parentPath, folderName), nextCtx);
        }
    }

    // collect via files.onFile
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

    return {
        data: items,
        totDir,
        numRead,
        numCached,
        totMatch,
        totAdded,
        elapsed
    };
}

/**
 * Process a batch of parsed Excel files (non‑synchronously) and persist their contents
 * into the local database in a FK‑safe order.
 *
 * ### What it does
 * 1) **Sorts** the incoming `ExcelMetadata[]` by a fixed type priority so that inserts
 *    respect foreign‑key constraints:
 *    - `Mapping` (OEM → internal product) **first**
 *    - `Product` (product/lot/wafer → sub_id map) **second**
 *    - `DefectList` (sub_id → defect file path) **last**
 * 2) **Per file**, performs the corresponding parse + upsert:
 *    - `Mapping`: parses a “Product Mapping” XLS and `maintainOemMapping(...)` with
 *      `{ oem_product_id, product_id }` pairs.
 *    - `Product`: parses a “Product” XLS and `upsertManyProductDefectMaps(...)` with
 *      `{ product_id, lot_id, wafer_id, sub_id, file_path }` rows (the file path of
 *      the *current* Excel is stored).
 *    - `DefectList`: **does not parse** the XLS content here; simply upserts the
 *      existence/location of the defect list file via `upsertSubstrateDefect(...)`
 *      with `{ sub_id, file_path }`.
 *
 * ### Logging
 * Uses `console.groupCollapsed` to group logs by:
 * - a top-level “Proc. N. Sync. Excel Data” group, then
 * - a per‑item subgroup labeled with the `ExcelType`.
 * Each branch logs its DB write result to aid debugging/sanity checks.
 *
 * ### Error handling
 * This function **does not** catch errors; any thrown exception from parsing or DB
 * calls will propagate to the caller. Wrap this function if you need retries or
 * user‑facing error reporting.
 *
 * ### Idempotency & constraints
 * - The DB helpers are assumed to perform **UPSERT**s so the operation is safe to
 *   repeat.
 * - Ordering is critical: `Product` rows reference `oem_product_map` (from
 *   `Mapping`) and `DefectList` rows may be referenced by `product_defect_map`.
 * - For `DefectList` items, `d.id` **must** be present (used as `sub_id`).
 *
 * @param data Array of excel file descriptors to process. The function sorts this array
 *             **in place** to enforce the type priority before processing.
 *
 * @returns `Promise<void>` that resolves when all items have been processed.
 *
 * @sideEffects
 * - Mutates the input `data` order (in‑place sort).
 * - Writes to the database via `maintainOemMapping`, `upsertManyProductDefectMaps`,
 *   and `upsertSubstrateDefect`.
 * - Emits console logs/groups for debugging.
 */
export async function processNSyncExcelData(data: ExcelMetadata[]) {
    const name = "Proc. N. Sync. Excel Data";

    const typeOrder: Record<ExcelType, number> = {
        [ExcelType.Mapping]: 0,
        [ExcelType.Product]: 1,
        [ExcelType.DefectList]: 2
    };

    // Sort in-place according to our type priority
    // This is because they must be upserted in a certain order to respect FK rules
    data.sort((a, b) => {
        const orderA = typeOrder[a.type] ?? 99;
        const orderB = typeOrder[b.type] ?? 99;
        return orderA - orderB;
    });

    console.groupCollapsed(`%c[${name}]`, "color: lightblue;");

    for (const d of data) {
        console.groupCollapsed(`%c[${d.type}]`, "color: lightgreen;");

        switch (d.type) {
            case ExcelType.Mapping: {
                const xlsResult = await invokeParseProductMappingXls(d.filePath);
                const results = Object.values(xlsResult).flat();
                const dbResult = await maintainOemMapping(
                    results
                        .filter(r => r.oemId && r.productId)
                        .map(r => ({
                            oem_product_id: r.oemId,
                            product_id: r.productId
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
                            product_id: r.productId,
                            lot_id: r.batchId,
                            wafer_id: r.waferId,
                            sub_id: r.subId,
                            file_path: d.filePath
                        }))
                );
                console.log({ dbResult, r: [dbResult, results.length], sanityCheck: Boolean(dbResult === results.length) })
                break;
            }
            case ExcelType.DefectList: {
                // No need to read the contents of these just yet (only during processing)
                // const xlsResult = await invokeParseSubstrateDefectXls(d.filePath);
                // const results = Object.values(xlsResult).flat();
                const dbResult = await upsertSubstrateDefect({
                    sub_id: d.id!,
                    file_path: d.filePath
                });
                console.log({ dbResult });
                break;
            }
        }
        console.groupEnd(); // end per-type
    }
    console.groupEnd(); // end main
}


/**
 * Batch-sync an array of WaferFileMetadata into SQLite’s `wafer_maps` table,
 * updating only when the incoming record is newer.
 */
export async function processNSyncWaferData(
    records: WaferFileMetadata[]
) {
    const name = 'Proc. N. Sync. Wafer Data';
    console.groupCollapsed(`%c[${name}]`, "color: lightblue;");
    try {
        const dbResult = await upsertManyWaferMaps(
            records
                .map(r => ({
                    product_id: r.productModel,
                    batch_id: r.batch,
                    wafer_id: Number(r.waferId),
                    stage: r.stage,
                    sub_stage: String(r.processSubStage ?? 0),
                    retest_count: r.retestCount ?? 0,
                    time: Number(r.time ?? 0),
                    file_path: r.filePath
                }))
        );
        console.log({ dbResult });
    }
    catch (err) {
        const msg = `[${name}] ${typeof err === 'object' ? err instanceof Error ? err.message : String(err) : 'unknown error'}`;
        console.error(msg);
        throw err;
    }
    console.groupEnd();
}

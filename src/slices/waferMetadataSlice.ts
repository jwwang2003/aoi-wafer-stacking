import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { basename, resolve } from '@tauri-apps/api/path';

import { DataSourceConfigState, DataSourceType, FolderResult } from '@/types/DataSource';
import { ExcelMetadata, ExcelType, FolderCollection, RawWaferMetadataCollection, WaferFileMetadata, WaferMetadataState } from '@/types/Wafer';
import { initialWaferMetadataState as initialState, now } from '@/constants/default';
import { RootState } from '@/store';
import { advanceStepper, setStepper } from './preferencesSlice';
import { ConfigStepperState } from '@/types/Stepper';
import { invokeReadFileStatBatch } from '@/api/tauri/fs';
import { dirScanResultToast, infoToast } from '@/components/Toaster';

/**
 * This slice is responsible for keeping track of the data read from the data source folders.
 * Whenever a change happens to dataSourceConfig.paths[...] (... is a stage), the same
 * change should be applied here. For example, a new path gets added or an old path gets deleted.
 */

// Async thunk to fetch and parse all wafer metadata
export const fetchWaferMetadata = createAsyncThunk<
    WaferMetadataState['data'],
    void,
    { state: RootState; rejectValue: string }
>(
    'waferMetadata/fetch',
    async (_, thunkAPI) => {
        try {
            const { dataSourceConfig } = thunkAPI.getState();

            // start timer
            const start = performance.now();

            const dataSourcePaths = await getDataSourcePathsFolders(dataSourceConfig);
            const parsed: RawWaferMetadataCollection = await readFolderData(dataSourcePaths);

            // end timer & compute duration
            const duration = performance.now() - start;
            console.debug(`%cRead & parse wafer metadata (${duration.toFixed(0)}ms)`, 'color: orange;')

            // advance stepper based on result
            if (parsed.length > 0) {
                await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Database));
            } else {
                await thunkAPI.dispatch(setStepper(ConfigStepperState.Metadata));
            }

            return parsed;
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                        ? err
                        : 'Failed to fetch wafer metadata';

            return thunkAPI.rejectWithValue(message);
        }
    }
);

const waferMetadataSlice = createSlice({
    name: 'waferMetadata',
    initialState,
    reducers: {
        clearWaferMetadata(state) {
            state.data = initialState.data;
            state.lastSaved = now();
        },
    },
    extraReducers: (builder) => {
        builder
            // .addCase(fetchWaferMetadata.pending, () => {})
            // .addCase(fetchWaferMetadata.rejected, () => {})
            .addCase(fetchWaferMetadata.fulfilled, (state, action: PayloadAction<WaferMetadataState['data']>) => {
                state.data = action.payload;
                state.lastSaved = now();
            });
    },
});

export const { clearWaferMetadata } = waferMetadataSlice.actions;
export default waferMetadataSlice.reducer;

export async function getDataSourcePathsFolders(state: DataSourceConfigState): Promise<FolderCollection> {
    const { rootPath, paths } = state;

    const entries = Object.entries(paths).filter(([key]) => key !== 'lastModified') as [DataSourceType, string[]][];

    const results = await Promise.all(
        entries.map(async ([key, folderList]) => {
            const resolvedFolders = await Promise.all(
                folderList.map(async (f) => (await resolve(rootPath, f)))
            );

            const responses: FolderResult[] = await invokeReadFileStatBatch(resolvedFolders);

            return [key, responses] as const;
        })
    );

    const dataSourceFolders: FolderCollection = {
        substrate: [],
        fabCp: [],
        cpProber: [],
        wlbi: [],
        aoi: [],
    };

    for (const [key, folderResults] of results) {
        dataSourceFolders[key] = folderResults;
    }

    return dataSourceFolders;
}

export async function readFolderData(folders: FolderCollection): Promise<RawWaferMetadataCollection> {
    // Execute all at the same time
    const [substrate, cpProber, wlbi, aoi] = await Promise.all([
        readSubstrateMetadata(folders.substrate),
        readCpProberMetadata(folders.cpProber),
        readWlbiMetadata(folders.wlbi),
        readAoiMetadata(folders.aoi),
    ]);

    // Aggregate metrics
    const totDir = substrate.totDir + cpProber.totDir + wlbi.totDir + aoi.totDir;
    const numRead = substrate.numRead + cpProber.numRead + wlbi.numRead + aoi.numRead;
    const numCached = substrate.numCached + cpProber.numCached + wlbi.numCached + aoi.numCached;
    const totMatch = substrate.totMatch + cpProber.totMatch + wlbi.totMatch + aoi.totMatch;
    const totAdded = substrate.totAdded + cpProber.totAdded + wlbi.totAdded + aoi.totAdded;
    const elapsed = (substrate as any).elapsed + (cpProber as any).elapsed + (wlbi as any).elapsed + (aoi as any).elapsed;

    // One toast, summed across all stages
    dirScanResultToast(
        { totDirs: totDir, numRead, numCached, totMatch, totAdded },
        elapsed,
        '读取元数据'
    );

    // Flatten data
    return [
        ...substrate.data,
        ...cpProber.data,
        ...wlbi.data,
        ...aoi.data,
    ];
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
import { listDirs, listFiles, join, mtimeMs, match } from '@/utils/fs';
import { scanPattern } from '@/utils/waferData';
import { logCacheReport } from '@/utils/console';
export async function readSubstrateMetadata(
    folders: FolderResult[]
): Promise<{ data: ExcelMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const t0 = performance.now();
    const result: ExcelMetadata[] = [];

    const defectListFolder = /^Defect list$/;
    const defectXls = /^([A-Za-z0-9]+)\.xls$/;
    const productMap = /^([A-Za-z0-9]+)_([0-9]{8})([0-9]{6})\.xlsx$/;
    const productList = /^Product list\.xlsx$/;

    let totDir = 0, numRead = 0, numCached = 0, totMatch = 0, totAdded = 0;

    // for log: everything we considered (folders + files; read + cached)
    const considered: string[] = [];

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        // 1) Defect list folder
        const {
            folders: dlFolders,
            cached: dlFoldersCached,
            totDir: totDirFolder,
            numRead: numReadFolders,
            numCached: numCachedFolders,
        } = await listDirs({ root: folder.path, name: defectListFolder });

        totDir += totDirFolder;
        numRead += numReadFolders;
        numCached += numCachedFolders;

        // record considered folders (absolute paths)
        for (const d of dlFolders) considered.push(await join(folder.path, d));
        for (const c of dlFoldersCached) considered.push(c.folder_path);

        for (const dl of dlFolders.concat(dlFoldersCached.map((f) => f.folder_path))) {
            const dlName = await basename(dl);
            const dlPath = await join(folder.path, dlName);

            const {
                files,
                cached,
                totDir: totDirFilesInDl,
                numRead: numReadFilesInDl,
                numCached: numCachedFilesInDl,
            } = await listFiles({ root: dlPath, name: defectXls });

            totDir += totDirFilesInDl;
            numRead += numReadFilesInDl;
            numCached += numCachedFilesInDl;

            // record considered files
            for (const f of files) considered.push(await join(dlPath, f));
            for (const c of cached) considered.push(c.file_path);

            for (const f of files) {
                const m = match(defectXls, f); if (!m) continue;
                const [, id] = m;
                const filePath = await join(dlPath, f);
                result.push({
                    type: ExcelType.DefectList,
                    stage: 'substrate',
                    id,
                    filePath,
                    lastModified: await mtimeMs(filePath),
                });
                totMatch++; totAdded++;
            }

            for (const file of cached) {
                const f = await basename(file.file_path);
                const m = match(defectXls, f); if (!m) continue;
                const [, id] = m;
                result.push({
                    type: ExcelType.DefectList,
                    stage: 'substrate',
                    id,
                    filePath: file.file_path,
                    lastModified: file.last_mtime,
                });
                // no numCached++ here; we already added numCachedFilesInDl
            }
        }

        // 2) Root-level Excel files
        const {
            files: rootFiles,
            cached: rootCached,
            totDir: totDirRootFiles,
            numRead: numReadRootFiles,
            numCached: numCachedRootFiles,
        } = await listFiles({ root: folder.path, name: /.+/ });

        totDir += totDirRootFiles;
        numRead += numReadRootFiles;
        numCached += numCachedRootFiles;

        // record considered files
        for (const f of rootFiles) considered.push(await join(folder.path, f));
        for (const c of rootCached) considered.push(c.file_path);

        for (const f of rootFiles) {
            const m1 = match(productList, f);
            const m2 = match(productMap, f);
            const filePath = await join(folder.path, f);

            if (m1) {
                result.push({
                    type: ExcelType.Mapping,
                    stage: 'substrate',
                    filePath,
                    lastModified: await mtimeMs(filePath),
                });
                totMatch++; totAdded++;
            } else if (m2) {
                const [, oem, date, time] = m2;
                result.push({
                    type: ExcelType.Product,
                    stage: 'substrate',
                    oem,
                    time: parseWaferMapTimestamp(date, time).toISOString(),
                    filePath,
                    lastModified: await mtimeMs(filePath),
                });
                totMatch++; totAdded++;
            }
        }

        for (const file of rootCached) {
            const f = await basename(file.file_path);
            const m1 = match(productList, f);
            const m2 = match(productMap, f);

            if (m1) {
                result.push({
                    type: ExcelType.Mapping,
                    stage: 'substrate',
                    filePath: file.file_path,
                    lastModified: file.last_mtime,
                });
            } else if (m2) {
                const [, oem, date, time] = m2;
                result.push({
                    type: ExcelType.Product,
                    stage: 'substrate',
                    oem,
                    time: parseWaferMapTimestamp(date, time).toISOString(),
                    filePath: file.file_path,
                    lastModified: file.last_mtime,
                });
            }
            // no numCached++ here; we already added numCachedRootFiles
        }
    }

    const elapsed = performance.now() - t0;

    logCacheReport({
        dirs: considered.length ? considered : 0,
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
export async function readFabCpMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
    const result: WaferFileMetadata[] = [];
    folders.filter(() => true);
    return result;
}

/**
 * Folder structure
 * CP-prober-XX/    (we are here already)
 *      产品型号_批次号_工序_复测次数/
 *          产品型号_批次号_片号/
 *              产品型号_批次号_片号_mapExt.txt
 * @param folders 
 */
export async function readCpProberMetadata(
    folders: FolderResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);

    // Folder: 产品型号_批次号_工序_复测次数
    const processFolder = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
    //                            productModel   batch         processSubStage  retestCount
    // Folder: 产品型号_批次号_片号
    const waferFolder = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)$/;
    //                          productModel   batch         waferId
    // File: 产品型号_批次号_片号_mapExt.txt
    const fileName = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_mapEx\.txt$/;
    //                   productModel   batch         waferId

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
                onFile: () => { } // no-op; we'll map after
            }
        },
        (level, name, g) => {
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

    const {
        data: items
    } = scanResult;

    // validate and map to your output type
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
            stage: 'cpProber',
            productModel: ctx.productModel,
            processSubStage: Number(ctx.processSubStage),
            batch: ctx.batch,
            waferId: ctx.waferId!,
            retestCount: Number(ctx.retestCount),
            filePath,
            lastModified,
        });
    }

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
    folders: FolderResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);

    const processFolder = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/; // model,batch,subStage,retest
    const wlbiFolder = /^WaferMap$/;
    const fileName = /^([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})_([0-9]{6})\.WaferMap$/; // wafer,batch,date,time

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
            stage: 'wlbi',
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
    folders: FolderResult[]
): Promise<{ data: WaferFileMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);

    // Folder: 产品型号_批次号
    const processFolder = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)$/;
    //                            productModel   batch
    // Folder: 片号片号
    // const waferFolderRegex = /^WaferMap$/;           // Wafer folder so far has no use case
    // File: 产品型号_批次号_片号_年月日时分秒.txt
    const mapFile = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})([0-9]{6})\.txt$/
    //                  productModel   batch        waferId    date & time

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
            stage: 'aoi',
            productModel: ctx.productModel,
            batch: ctx.batch,
            waferId,
            time: parseWaferMapTimestamp(date, time).toISOString(),
            filePath,
            lastModified,
        });
    }
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
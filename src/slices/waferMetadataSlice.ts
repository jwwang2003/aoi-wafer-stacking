import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';

import { DataSourceType, DirResult, FolderGroupsState } from '@/types/DataSource';
import { ExcelMetadata, ExcelType, FolderCollection, RawWaferMetadataCollection, WaferFileMetadata, WaferMetadataState } from '@/types/Wafer';
import { initialWaferMetadataState as initialState, now } from '@/constants/default';
import { RootState } from '@/store';
import { advanceStepper, setStepper } from './preferencesSlice';
import { ConfigStepperState } from '@/types/Stepper';
import { invokeReadFileStatBatch } from '@/api/tauri/fs';

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
            const { dataSourceState } = thunkAPI.getState();

            // start timer
            const start = performance.now();

            const dataSourcePaths = await getAllWaferFolders(dataSourceState);
            const parsed: RawWaferMetadataCollection = await readAllWaferData(dataSourcePaths);

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

//======================================================================================================================

export async function getAllWaferFolders(state: FolderGroupsState): Promise<FolderCollection> {
    const entries = Object.entries(state).filter(([key]) => key !== 'lastModified').map(e => [e[0], e[1].map(f => f.path)]) as [DataSourceType, string[]][];

    const results = await Promise.all(
        entries.map(async ([key, folderList]) => {
            const responses: DirResult[] = await invokeReadFileStatBatch(folderList);
            return [key, responses] as const;
        })
    );

    const dataSourceFolders: FolderCollection = { substrate: [], fabCp: [], cpProber: [], wlbi: [], aoi: [] };
    for (const [key, folderResults] of results) dataSourceFolders[key] = folderResults;

    return dataSourceFolders;
}

export async function readAllWaferData(folders: FolderCollection): Promise<RawWaferMetadataCollection> {
    // Execute all at the same time
    try {
        const substrate = await readSubstrateMetadata(folders.substrate);
        const cpProber = await readCpProberMetadata(folders.cpProber);
        const wlbi = await readWlbiMetadata(folders.wlbi);
        const aoi = await readAoiMetadata(folders.aoi);

        const totDir = substrate.totDir + cpProber.totDir + wlbi.totDir + aoi.totDir;
        const numRead = substrate.numRead + cpProber.numRead + wlbi.numRead + aoi.numRead;
        const numCached = substrate.numCached + cpProber.numCached + wlbi.numCached + aoi.numCached;
        const totMatch = substrate.totMatch + cpProber.totMatch + wlbi.totMatch + aoi.totMatch;
        const totAdded = substrate.totAdded + cpProber.totAdded + wlbi.totAdded + aoi.totAdded;
        const elapsed = (substrate as any).elapsed + (cpProber as any).elapsed + (wlbi as any).elapsed + (aoi as any).elapsed;

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
import { scanPattern } from '@/utils/waferData';
import { logCacheReport } from '@/utils/console';
import { dirScanResultToast } from '@/components/Toaster';
export async function readSubstrateMetadata(
    folders: DirResult[]
): Promise<{ data: ExcelMetadata[]; totDir: number; numRead: number; numCached: number; totMatch: number; totAdded: number, elapsed: number }> {
    const t0 = performance.now();
    const result: ExcelMetadata[] = [];

    const defectListFolder = /^Defect list$/;
    const defectXls = /^([A-Za-z0-9]+)\.xls$/;
    const productMap = /^([A-Za-z0-9]+)_([0-9]{8})([0-9]{6})\.xlsx$/;
    const productList = /^Product list\.xlsx$/;

    let totDir = 0, numRead = 0, numCached = 0, totMatch = 0, totAdded = 0;

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        const {
            dirs: dlFolders,
            cached: dlFoldersCached,
            totDir: totDirFolder,
            numRead: numReadFolders,
            numCached: numCachedFolders,
        } = await listDirs({ root: folder.path, name: defectListFolder });

        console.debug({
            dlFolders, dlFoldersCached
        })

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
                    stage: 'substrate',
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
                    stage: 'substrate',
                    filePath,
                    lastModified: Number(f.info?.mtime),
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
export async function readFabCpMetadata(folders: DirResult[]): Promise<WaferFileMetadata[]> {
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
    folders: DirResult[]
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
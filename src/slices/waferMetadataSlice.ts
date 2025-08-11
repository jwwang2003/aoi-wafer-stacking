import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { basename, resolve } from '@tauri-apps/api/path';
import { readDir, stat } from '@tauri-apps/plugin-fs';

import { DataSourceConfigState, DataSourceType, FolderResult } from '@/types/DataSource';
import { ExcelMetadata, ExcelType, FolderCollection, RawWaferMetadataCollection, WaferFileMetadata, WaferMetadataState } from '@/types/Wafer';
import { initialWaferMetadataState as initialState, now } from '@/constants/default';
import { RootState } from '@/store';
import { advanceStepper, setStepper } from './preferencesSlice';
import { ConfigStepperState } from '@/types/Stepper';
import { invokeReadFileStatBatch } from '@/api/tauri/fs';
import { infoToast } from '@/components/Toaster';

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

            // show toast with elapsed time
            infoToast(
                {
                    title: '读取并解析元数据',
                    lines: [{ label: '耗时', value: `${Math.round(duration)} ms` }],
                }
            );

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
    const stageReaders = await Promise.all([
        readSubstrateMetadata(folders.substrate),
        readCpProberMetadata(folders.cpProber),
        readWlbiMetadata(folders.wlbi),
        readAoiMetadata(folders.aoi),
    ]);

    const [substrate, cpProber, wlbi, aoi] = stageReaders;
    return [...substrate, ...cpProber, ...wlbi, ...aoi];

    // Old method (slow)
    // console.time('readFolderData');
    // let result: RawWaferMetadataCollection = [];
    // for (const [key, value] of Object.entries(folders)) {
    //     switch (key as DataSourceType) {
    //         case 'substrate': {
    //             result = result.concat(await readSubstrateMetadata(value));
    //             break;
    //         }
    //         case 'fabCp': {
    //             // Handle fabCp metadata here
    //             break;
    //         }
    //         case 'cpProber': {
    //             result = result.concat(await readCpProberMetadata(value));
    //             break;
    //         }
    //         case 'wlbi': {
    //             result = result.concat(await readWlbiMetadata(value));
    //             break;
    //         }
    //         case 'aoi': {
    //             result = result.concat(await readAoiMetadata(value));
    //             break;
    //         }
    //         default: {
    //             console.error('Unknown key!', key);
    //             break;
    //         }
    //     }
    // }

    // console.log(result);
    // console.timeEnd('readFolderData'); // Will print duration in ms
    // return result;
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
// export async function readSubstrateMetadata(folders: FolderResult[]): Promise<ExcelMetadata[]> {
//     const result: ExcelMetadata[] = [];

//     const defectListFolderRegex = /^Defect list$/;
//     const substrateDefectListFileRegex = /^([A-Za-z0-9]+)\.xls$/;
//     const productMapFileRegex = /^([A-Za-z0-9]+)_([0-9]{8})([0-9]{6})\.xlsx$/;
//     const productListFileRegex = /^Product list\.xlsx$/;

//     for (const folder of folders) {
//         if (!folder.exists || !folder.info?.isDirectory) continue;

//         // Currently on the first level, looking for process folders
//         const substrateDir = await readDir(folder.path);    // non-recursive by nature

//         for (const substrateFile of substrateDir) {
//             const substratePath = await resolve(folder.path, substrateFile.name);
//             if (substrateFile.isDirectory) {
//                 if (!defectListFolderRegex.test(substrateFile.name)) continue;

//                 const defectDir = (await readDir(substratePath)).filter(
//                     (file) => file.isFile && substrateDefectListFileRegex.test(file.name)
//                 );

//                 for (const defect of defectDir) {
//                     const productListMatch = substrateDefectListFileRegex.exec(defect.name);
//                     if (!productListMatch) continue;
//                     const [, id] = productListMatch;
//                     const filePath = await resolve(substratePath, defect.name);
//                     const info = await stat(filePath);
//                     const lastModified = info.mtime?.getTime() ?? -1;
//                     result.push({
//                         type: ExcelType.DefectList,
//                         stage: 'substrate',
//                         id,
//                         filePath,
//                         lastModified
//                     })
//                 }
//             } else {
//                 // Read files
//                 const name = await basename(substratePath);

//                 // Product list (FAB Product ID <=> FAB Product ID, mapping)
//                 // 产品型号与产品型号对应关系 (批次号是唯一的)
//                 if (productListFileRegex.test(name)) {
//                     const info = await stat(substratePath);
//                     const lastModified = info.mtime?.getTime() ?? -1;
//                     result.push({
//                         type: ExcelType.Mapping,
//                         stage: 'substrate',
//                         filePath: substratePath,
//                         lastModified
//                     });
//                 } else if (productMapFileRegex.test(name)) {
//                     const productListMatch = productMapFileRegex.exec(name);
//                     if (!productListMatch) continue;
//                     const [, oem, date, time] = productListMatch;
//                     // oem -> 代工广场产品号
//                     const info = await stat(substratePath);
//                     const lastModified = info.mtime?.getTime() ?? -1;
//                     result.push({
//                         type: ExcelType.Product,
//                         stage: 'substrate',
//                         oem,
//                         time: parseWaferMapTimestamp(date, time).toISOString(),
//                         filePath: substratePath,
//                         lastModified
//                     });
//                 }
//             }
//         }
//     }
//     return result;
// }
import { listDirs, listFiles, join, mtimeMs, match } from '@/utils/fs';
import { scanPattern } from '@/utils/waferData';
export async function readSubstrateMetadata(folders: FolderResult[]): Promise<ExcelMetadata[]> {
    const result: ExcelMetadata[] = [];

    const defectListFolder = /^Defect list$/;
    const defectXls = /^([A-Za-z0-9]+)\.xls$/;
    const productMap = /^([A-Za-z0-9]+)_([0-9]{8})([0-9]{6})\.xlsx$/;
    const productList = /^Product list\.xlsx$/;

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        // 1) Defect list folder
        for (const dl of await listDirs(folder.path, defectListFolder)) {
            const dlPath = await join(folder.path, dl.name);
            for (const f of await listFiles(dlPath, defectXls)) {
                const m = match(defectXls, f.name); if (!m) continue;
                const [, id] = m;
                const filePath = await join(dlPath, f.name);
                result.push({
                    type: ExcelType.DefectList,
                    stage: 'substrate',
                    id,
                    filePath,
                    lastModified: await mtimeMs(filePath),
                });
            }
        }

        // 2) Root-level Excel files
        const rootFiles = await listFiles(folder.path, /.+/);
        for (const f of rootFiles) {
            const m1 = match(productList, f.name);
            const m2 = match(productMap, f.name);
            const filePath = await join(folder.path, f.name);

            if (m1) {
                result.push({
                    type: ExcelType.Mapping,
                    stage: 'substrate',
                    filePath,
                    lastModified: await mtimeMs(filePath),
                });
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
            }
        }
    }
    return result;
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
// export async function readCpProberMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
//     const result: WaferFileMetadata[] = [];

//     // Folder: 产品型号_批次号_工序_复测次数
//     const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
//     //                            productModel   batch         processSubStage  retestCount
//     // Folder: 产品型号_批次号_片号
//     const waferFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)$/;
//     //                          productModel   batch         waferId
//     // File: 产品型号_批次号_片号_mapExt.txt
//     const fileRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_mapEx\.txt$/;
//     //                   productModel   batch         waferId

//     for (const folder of folders) {
//         if (!folder.exists || !folder.info?.isDirectory) continue;

//         // Currently on the first level, looking for process folders
//         const processFolders = (await readDir(folder.path)).filter(
//             (folder) => folder.isDirectory && processFolderRegex.test(folder.name)
//         );    // non-recursive by nature

//         for (const processFolder of processFolders) {
//             const processFolderMatch = processFolderRegex.exec(processFolder.name);
//             if (!processFolderMatch) continue;

//             // NOTE: processSubStage determines CP2 or CP3, etc.
//             const [, productModel1, batch1, processSubStage, retestCount] = processFolderMatch;

//             // Now on the second level, looking for wafer folders
//             const processFolderPath = await resolve(folder.path, processFolder.name);
//             const waferFolders = (await readDir(processFolderPath)).filter(
//                 (folder) => folder.isDirectory && waferFolderRegex.test(folder.name)
//             );

//             for (const wafer of waferFolders) {
//                 const waferFolderMatch = waferFolderRegex.exec(wafer.name);
//                 if (!waferFolderMatch) continue;

//                 const [, productModel2, batch2, waferId2] = waferFolderMatch;

//                 if (productModel1 !== productModel2 || batch1 !== batch2) {
//                     console.error('Data misalignment in CP-prober!');
//                     console.error(`${productModel2}, ${batch2}, ${waferId2} != ${productModel1}, ${batch1}, ${waferId2}`)
//                     continue;
//                 }

//                 const waferFolderPath = await resolve(processFolderPath, wafer.name);
//                 const files = (await readDir(waferFolderPath)).filter(
//                     (file) => file.isFile && fileRegex.test(file.name)
//                 );

//                 for (const file of files) {
//                     if (!file.isFile) continue;

//                     const fileMatch = fileRegex.exec(file.name);
//                     if (!fileMatch) continue;

//                     const [, productModel3, batch3, waferId3] = fileMatch;

//                     if (productModel3 !== productModel2 || batch3 !== batch2 || waferId3 !== waferId2) {
//                         console.error('Data misalignment in CP-prober!');
//                         console.error(`${productModel3}, ${batch3}, ${waferId3} != ${productModel2}, ${batch2}, ${waferId2}`)
//                         continue;
//                     }

//                     const filePath = await resolve(waferFolderPath, file.name);
//                     const info = await stat(filePath);
//                     const lastModified = info?.mtime?.getTime() ?? -1;
//                     result.push({
//                         stage: 'cpProber',
//                         productModel: productModel3,
//                         processSubStage: Number(processSubStage),
//                         batch: batch3,
//                         waferId: waferId3,
//                         retestCount: Number(retestCount),
//                         filePath,
//                         lastModified
//                     });
//                 }
//             }
//         }
//     }
//     return result;
// }
export async function readCpProberMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
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

    const items = await scanPattern<Ctx>(
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

    return result;
}

/**
 * - `WLBI-XX`
 *      - `产品型号_批次号_工序_复测次数`
 *          - `WaferMap`
 *              - `批次号_片号_年月日_时分秒.WaferMap`
 * @param folders 
 * @returns 
 */
// export async function readWlbiMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
//     const result: WaferFileMetadata[] = [];

//     // Folder: 产品型号_批次号_工序_复测次数
//     const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
//     //                            productModel   batch         processSubStage  retestCount
//     // Folder: 产品型号_批次号_片号
//     const wlbiFolderRegex = /^WaferMap$/;
//     // File: 产品型号_批次号_片号_mapExt.txt
//     const fileRegex = /^([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})_([0-9]{6})\.WaferMap$/
//     //                   waferID      batch      date       time

//     for (const folder of folders) {
//         if (!folder.exists || !folder.info?.isDirectory) continue;

//         // Currently on the first level, looking for process folders
//         const processFolders = (await readDir(folder.path)).filter(
//             (folder) => folder.isDirectory && processFolderRegex.test(folder.name)
//         );

//         for (const processFolder of processFolders) {
//             const processFolderMatch = processFolderRegex.exec(processFolder.name);
//             if (!processFolderMatch) continue;

//             // NOTE: processSubStage determines CP2 or CP3, etc.
//             const [, productModel1, batch1, processSubStage, retestCount] = processFolderMatch;

//             // Now on the second level, looking for wafer folders
//             const processFolderPath = await resolve(folder.path, processFolder.name);
//             const wlbiFolders = (await readDir(processFolderPath)).filter(
//                 (folder) => folder.isDirectory && wlbiFolderRegex.test(folder.name)
//             );

//             for (const wlbi of wlbiFolders) {
//                 const waferFolderMatch = wlbiFolderRegex.exec(wlbi.name);
//                 if (!waferFolderMatch) continue;

//                 const [,] = waferFolderMatch;

//                 const wlbiFolderPath = await resolve(processFolderPath, wlbi.name);
//                 const files = (await readDir(wlbiFolderPath)).filter(
//                     (file) => file.isFile && fileRegex.test(file.name)
//                 );

//                 for (const file of files) {
//                     const fileMatch = fileRegex.exec(file.name);
//                     if (!fileMatch) continue;

//                     const [, batch3, waferId3, date, time] = fileMatch;

//                     if (batch3 !== batch1) {
//                         console.error('Data misalignment in WLBI!');
//                         console.error(`batch: ${batch3} != ${batch1}`)
//                         continue;
//                     }

//                     const filePath = await resolve(wlbiFolderPath, file.name);
//                     const info = await stat(filePath);
//                     const lastModified = info.mtime?.getTime() ?? -1;
//                     result.push({
//                         stage: 'wlbi',
//                         productModel: productModel1,
//                         processSubStage: Number(processSubStage),
//                         batch: batch3,
//                         waferId: waferId3,
//                         retestCount: Number(retestCount),
//                         time: parseWaferMapTimestamp(date, time).toISOString(),
//                         filePath,
//                         lastModified
//                     });
//                 }
//             }
//         }
//     }
//     return result;
// }
export async function readWlbiMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
    const roots = folders.filter(f => f.exists && f.info?.isDirectory).map(f => f.path);

    const processFolder = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/; // model,batch,subStage,retest
    const wlbiFolder = /^WaferMap$/;
    const fileName = /^([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})_([0-9]{6})\.WaferMap$/; // wafer,batch,date,time

    type Ctx = { productModel: string; batch: string; processSubStage: string; retestCount: string };

    const items = await scanPattern<Ctx>(
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
    return result;
}

/**
 * - `AOI-XX`
 *      - `产品型号_批次号`
 *          - `片号`
 *          - `产品型号_批次号_片号_年月日时分秒.txt`
 * @param folders 
 * @returns 
 */
// export async function readAoiMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
//     const result: WaferFileMetadata[] = [];

//     // Folder: 产品型号_批次号
//     const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)$/;
//     //                            productModel   batch
//     // Folder: 片号片号
//     // const waferFolderRegex = /^WaferMap$/;           // Wafer folder so far has no use case
//     // File: 产品型号_批次号_片号_年月日时分秒.txt
//     const mapFile = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})([0-9]{6})\.txt$/
//     //                  productModel   batch        waferId    date & time

//     for (const folder of folders) {
//         if (!folder.exists || !folder.info?.isDirectory) continue;

//         // Currently on the first level, looking for process folders
//         const processFolders = (await readDir(folder.path)).filter(
//             (folder) => folder.isDirectory && processFolderRegex.test(folder.name)
//         );

//         for (const processFolder of processFolders) {
//             const processFolderMatch = processFolderRegex.exec(processFolder.name);
//             if (!processFolderMatch) continue;

//             // NOTE: processSubStage determines CP2 or CP3, etc.
//             const [, productModel1, batch1] = processFolderMatch;

//             // Now on the second level, looking for wafer folders
//             const processFolderPath = await resolve(folder.path, processFolder.name);
//             // DC for now
//             // const waferFolders = (await readDir(processFolderPath)).filter(
//             //     (folder) => folder.isDirectory && waferFolders.test(folder.name)
//             // );
//             const mapFiles = (await readDir(processFolderPath)).filter(
//                 (file) => file.isFile && mapFile.test(file.name)
//             );

//             for (const file of mapFiles) {
//                 const mapFileMatch = mapFile.exec(file.name);
//                 if (!mapFileMatch) continue;

//                 const [, productModel3, batch3, waferId3, date, time] = mapFileMatch;
//                 const filePath = await resolve(processFolderPath, file.name);

//                 // sanity check...
//                 if (productModel3 !== productModel1 || batch3 !== batch1) {
//                     console.error('Folder data structure misalignment in AOI!');
//                     console.error({
//                         msg: `${productModel3}, ${batch3} != ${productModel1}, ${batch1}`,
//                         path: filePath
//                     });
//                     continue;
//                 }

//                 const info = await stat(filePath);
//                 const lastModified = info.mtime?.getTime() ?? -1;
//                 result.push({
//                     stage: 'aoi',
//                     productModel: productModel1,
//                     // processSubStage: Number(processSubStage),    // AOI does not have a substage
//                     batch: batch3,
//                     waferId: waferId3,
//                     // retestCount: Number(retestCount),            // AOI does not have retestCount attribute
//                     time: parseWaferMapTimestamp(date, time).toISOString(),
//                     filePath,
//                     lastModified
//                 });
//             }
//         }
//     }

//     return result;
// }
export async function readAoiMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
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

    const items = await scanPattern<Ctx>(
        roots,
        {
            steps: [{ name: processFolder }],
            files: { name: mapFile, onFile: () => { } }
        },
        (level, _name, g) => (level === 0 ? { productModel: g[0], batch: g[1] } : {})
    );

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
    return result;
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
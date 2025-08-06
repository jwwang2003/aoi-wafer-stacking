import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { invoke } from '@tauri-apps/api/core';
import { basename, resolve } from '@tauri-apps/api/path';
import { readDir, stat } from '@tauri-apps/plugin-fs';

import { DataSourceConfigState, DataSourceType, FolderResult } from '@/types/DataSource';
import { ExcelData, ExcelType, FolderCollection, RawWaferMetadataCollection, WaferFileMetadata, WaferMetadataState } from '@/types/Wafer';
import { initialWaferMetadataState as initialState, now } from '@/constants/default';
import { RootState } from '@/store';

/**
 * This slice is responsible for keeping track of the data read from the data source folders.
 * Whenever a change happens to dataSourceConfig.paths[...] (... is a stage), the same
 * change should be applied here. For example, a new path gets added or an old path gets deleted.
 */

// Async thunk to fetch and parse all wafer metadata
export const fetchWaferMetadata = createAsyncThunk<
    WaferMetadataState['data'],
    void,
    { state: RootState, rejectValue: string }
>('waferMetadata/fetch', async (_, thunkAPI) => {
    try {
        const state = thunkAPI.getState();
        const { dataSourceConfig } = state;

        console.time('Read&ParseWaferMetadata');
        const dataSourcePaths = await getDataSourcePathsFolders(dataSourceConfig);
        const parsed: RawWaferMetadataCollection = await readFolderData(dataSourcePaths);
        console.timeEnd('Read&ParseWaferMetadata');

        const result = parsed;

        return result;
    } catch (err: unknown) {
        if (err instanceof Object) {
            return thunkAPI.rejectWithValue((err as Error).message || 'Failed to fetch wafer metadata');
        }
        return thunkAPI.rejectWithValue(err as string || 'Failed to fetch wafer metadata');
    }
});

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
                folderList.map(async (f) => ({ path: await resolve(rootPath, f) }))
            );

            const responses: FolderResult[] = await invoke('get_file_batch_stat', {
                folders: resolvedFolders,
            });

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
export async function readSubstrateMetadata(folders: FolderResult[]): Promise<ExcelData[]> {
    const result: ExcelData[] = [];

    const defectListFolderRegex = /^Defect list$/;
    const substrateDefectListFileRegex = /^([A-Za-z0-9]+)\.xls$/;
    const productMapFileRegex = /^([A-Za-z0-9]+)_([0-9]{8})([0-9]{6})\.xlsx$/;
    const productListFileRegex = /^Product list\.xlsx$/;

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        // Currently on the first level, looking for process folders
        const substrateDir = await readDir(folder.path);    // non-recursive by nature

        for (const substrateFile of substrateDir) {
            const substratePath = await resolve(folder.path, substrateFile.name);
            if (substrateFile.isDirectory) {
                if (!defectListFolderRegex.test(substrateFile.name)) continue;

                const defectDir = (await readDir(substratePath)).filter(
                    (file) => file.isFile && substrateDefectListFileRegex.test(file.name)
                );

                for (const defect of defectDir) {
                    const productListMatch = substrateDefectListFileRegex.exec(defect.name);
                    if (!productListMatch) continue;
                    const [, id] = productListMatch;
                    const filePath = await resolve(substratePath, defect.name);
                    const info = await stat(filePath);
                    result.push({
                        type: ExcelType.DefectList,
                        stage: 'substrate',
                        id,
                        filePath,
                        info
                    })
                }
            } else {
                // Read files
                const name = await basename(substratePath);

                // Product list (FAB Product ID <=> FAB Product ID, mapping)
                // 产品型号与产品型号对应关系 (批次号是唯一的)
                if (productListFileRegex.test(name)) {
                    const info = await stat(substratePath);
                    result.push({
                        type: ExcelType.Mapping,
                        stage: 'substrate',
                        filePath: substratePath,
                        info
                    });
                } else if (productMapFileRegex.test(name)) {
                    const productListMatch = productMapFileRegex.exec(name);
                    if (!productListMatch) continue;
                    const [, oem, date, time] = productListMatch;
                    // oem -> 代工广场产品号
                    const info = await stat(substratePath);
                    result.push({
                        type: ExcelType.Product,
                        stage: 'substrate',
                        oem,
                        time: parseWaferMapTimestamp(date, time).toISOString(),
                        filePath: substratePath,
                        info
                    });
                }
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
export async function readCpProberMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
    const result: WaferFileMetadata[] = [];

    // Folder: 产品型号_批次号_工序_复测次数
    const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
    //                            productModel   batch         processSubStage  retestCount
    // Folder: 产品型号_批次号_片号
    const waferFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)$/;
    //                          productModel   batch         waferId
    // File: 产品型号_批次号_片号_mapExt.txt
    const fileRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_mapEx\.txt$/;
    //                   productModel   batch         waferId

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        // Currently on the first level, looking for process folders
        const processFolders = (await readDir(folder.path)).filter(
            (folder) => folder.isDirectory && processFolderRegex.test(folder.name)
        );    // non-recursive by nature

        for (const processFolder of processFolders) {
            const processFolderMatch = processFolderRegex.exec(processFolder.name);
            if (!processFolderMatch) continue;

            // NOTE: processSubStage determines CP2 or CP3, etc.
            const [, productModel1, batch1, processSubStage, retestCount] = processFolderMatch;

            // Now on the second level, looking for wafer folders
            const processFolderPath = await resolve(folder.path, processFolder.name);
            const waferFolders = (await readDir(processFolderPath)).filter(
                (folder) => folder.isDirectory && waferFolderRegex.test(folder.name)
            );

            for (const wafer of waferFolders) {
                const waferFolderMatch = waferFolderRegex.exec(wafer.name);
                if (!waferFolderMatch) continue;

                const [, productModel2, batch2, waferId2] = waferFolderMatch;

                if (productModel1 !== productModel2 || batch1 !== batch2) {
                    console.error('Data misalignment in CP-prober!');
                    console.error(`${productModel2}, ${batch2}, ${waferId2} != ${productModel1}, ${batch1}, ${waferId2}`)
                    continue;
                }

                const waferFolderPath = await resolve(processFolderPath, wafer.name);
                const files = (await readDir(waferFolderPath)).filter(
                    (file) => file.isFile && fileRegex.test(file.name)
                );

                for (const file of files) {
                    if (!file.isFile) continue;

                    const fileMatch = fileRegex.exec(file.name);
                    if (!fileMatch) continue;

                    const [, productModel3, batch3, waferId3] = fileMatch;

                    if (productModel3 !== productModel2 || batch3 !== batch2 || waferId3 !== waferId2) {
                        console.error('Data misalignment in CP-prober!');
                        console.error(`${productModel3}, ${batch3}, ${waferId3} != ${productModel2}, ${batch2}, ${waferId2}`)
                        continue;
                    }

                    const filePath = await resolve(waferFolderPath, file.name);
                    const info = await stat(filePath);
                    result.push({
                        stage: 'cpProber',
                        productModel: productModel3,
                        processSubStage: Number(processSubStage),
                        batch: batch3,
                        waferId: waferId3,
                        retestCount: Number(retestCount),
                        filePath,
                        info
                    });
                }
            }
        }
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
export async function readWlbiMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
    const result: WaferFileMetadata[] = [];

    // Folder: 产品型号_批次号_工序_复测次数
    const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
    //                            productModel   batch         processSubStage  retestCount
    // Folder: 产品型号_批次号_片号
    const wlbiFolderRegex = /^WaferMap$/;
    // File: 产品型号_批次号_片号_mapExt.txt
    const fileRegex = /^([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})_([0-9]{6})\.WaferMap$/
    //                   waferID      batch      date       time

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        // Currently on the first level, looking for process folders
        const processFolders = (await readDir(folder.path)).filter(
            (folder) => folder.isDirectory && processFolderRegex.test(folder.name)
        );

        for (const processFolder of processFolders) {
            const processFolderMatch = processFolderRegex.exec(processFolder.name);
            if (!processFolderMatch) continue;

            // NOTE: processSubStage determines CP2 or CP3, etc.
            const [, productModel1, batch1, processSubStage, retestCount] = processFolderMatch;

            // Now on the second level, looking for wafer folders
            const processFolderPath = await resolve(folder.path, processFolder.name);
            const wlbiFolders = (await readDir(processFolderPath)).filter(
                (folder) => folder.isDirectory && wlbiFolderRegex.test(folder.name)
            );

            for (const wlbi of wlbiFolders) {
                const waferFolderMatch = wlbiFolderRegex.exec(wlbi.name);
                if (!waferFolderMatch) continue;

                const [,] = waferFolderMatch;

                const wlbiFolderPath = await resolve(processFolderPath, wlbi.name);
                const files = (await readDir(wlbiFolderPath)).filter(
                    (file) => file.isFile && fileRegex.test(file.name)
                );

                for (const file of files) {
                    const fileMatch = fileRegex.exec(file.name);
                    if (!fileMatch) continue;

                    const [, batch3, waferId3, date, time] = fileMatch;

                    if (batch3 !== batch1) {
                        console.error('Data misalignment in WLBI!');
                        console.error(`batch: ${batch3} != ${batch1}`)
                        continue;
                    }

                    const filePath = await resolve(wlbiFolderPath, file.name);
                    const info = await stat(filePath);
                    result.push({
                        stage: 'wlbi',
                        productModel: productModel1,
                        processSubStage: Number(processSubStage),
                        batch: batch3,
                        waferId: waferId3,
                        retestCount: Number(retestCount),
                        time: parseWaferMapTimestamp(date, time).toISOString(),
                        filePath,
                        info,
                    });
                }
            }
        }
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
export async function readAoiMetadata(folders: FolderResult[]): Promise<WaferFileMetadata[]> {
    const result: WaferFileMetadata[] = [];

    // Folder: 产品型号_批次号
    const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)$/;
    //                            productModel   batch
    // Folder: 片号片号
    // const waferFolderRegex = /^WaferMap$/;           // Wafer folder so far has no use case
    // File: 产品型号_批次号_片号_年月日时分秒.txt
    const mapFile = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_([0-9]+)_([0-9]{8})([0-9]{6})\.txt$/
    //                  productModel   batch        waferId    date & time

    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;

        // Currently on the first level, looking for process folders
        const processFolders = (await readDir(folder.path)).filter(
            (folder) => folder.isDirectory && processFolderRegex.test(folder.name)
        );

        for (const processFolder of processFolders) {
            const processFolderMatch = processFolderRegex.exec(processFolder.name);
            if (!processFolderMatch) continue;

            // NOTE: processSubStage determines CP2 or CP3, etc.
            const [, productModel1, batch1] = processFolderMatch;

            // Now on the second level, looking for wafer folders
            const processFolderPath = await resolve(folder.path, processFolder.name);
            // DC for now
            // const waferFolders = (await readDir(processFolderPath)).filter(
            //     (folder) => folder.isDirectory && waferFolders.test(folder.name)
            // );
            const mapFiles = (await readDir(processFolderPath)).filter(
                (file) => file.isFile && mapFile.test(file.name)
            );

            for (const file of mapFiles) {
                const mapFileMatch = mapFile.exec(file.name);
                if (!mapFileMatch) continue;

                const [, productModel3, batch3, waferId3, date, time] = mapFileMatch;
                const filePath = await resolve(processFolderPath, file.name);

                // sanity check...
                if (productModel3 !== productModel1 || batch3 !== batch1) {
                    console.error('Folder data structure misalignment in AOI!');
                    console.error({
                        msg: `${productModel3}, ${batch3} != ${productModel1}, ${batch1}`,
                        path: filePath
                    });
                    continue;
                }

                const info = await stat(filePath);
                result.push({
                    stage: 'aoi',
                    productModel: productModel1,
                    // processSubStage: Number(processSubStage),    // AOI does not have a substage
                    batch: batch3,
                    waferId: waferId3,
                    // retestCount: Number(retestCount),            // AOI does not have retestCount attribute
                    time: parseWaferMapTimestamp(date, time).toISOString(),
                    filePath,
                    info,
                });
            }
        }
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
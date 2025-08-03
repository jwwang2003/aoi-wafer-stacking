import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { invoke } from '@tauri-apps/api/core';
import { resolve } from '@tauri-apps/api/path';
import { readDir } from '@tauri-apps/plugin-fs';

import { DataSourceConfigState, DataSourcePaths, DataSourceType, FolderResult } from '@/types/DataSource';
import { FolderCollection, RawWaferMetadataCollection, WaferFileMetadata, WaferMetadataState } from '@/types/Wafer';
import { initialWaferMetadataState as initialState, now } from '@/constants/default';
import { RootState } from '@/store';

// Async thunk to fetch and parse all wafer metadata
export const fetchWaferMetadata = createAsyncThunk<
    WaferMetadataState['data'],
    void,
    { state: RootState, rejectValue: string }
>('waferMetadata/fetch', async (_, thunkAPI) => {
    try {
        const state = thunkAPI.getState();
        const { dataSourcePathsConfig } = state;

        const folders = await getDataSourceFolders(dataSourcePathsConfig);
        const parsed = await readFolderData(folders);

        // Organize parsed metadata by source type
        const result: WaferMetadataState['data'] = {
            substrate: [],
            fabCp: [],
            cpProber: [],
            wlbi: [],
            aoi: [],
        };

        for (const entry of parsed) {
            if ('filePath' in entry && entry.filePath.includes('cpProber')) {
                result.cpProber.push(entry);
            } else if ('filePath' in entry && entry.filePath.includes('wlbi')) {
                result.wlbi.push(entry);
            } else if ('filePath' in entry && entry.filePath.includes('aoi')) {
                result.aoi.push(entry);
            } else if ('type' in entry && entry.type === 'DefectList') {
                result.substrate.push(entry);
            } else {
                result.fabCp.push(entry);
            }
        }

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
            .addCase(fetchWaferMetadata.pending, () => {

            })
            .addCase(fetchWaferMetadata.fulfilled, (state, action: PayloadAction<WaferMetadataState['data']>) => {
                state.data = action.payload;
                state.lastSaved = new Date().toISOString();
            })
            .addCase(fetchWaferMetadata.rejected, () => {

            });
    },
});

export const { clearWaferMetadata } = waferMetadataSlice.actions;
export default waferMetadataSlice.reducer;

export async function getDataSourceFolders(state: DataSourceConfigState): Promise<FolderCollection> {
    const { rootPath, paths } = state;
    const newPaths = { ...paths };
    delete newPaths.lastModified;
    const dataSourceFolders: FolderCollection = {
        'substrate': [],
        'fabCp': [],
        'cpProber': [],
        'wlbi': [],
        'aoi': []
    };
    for (const [key, value] of Object.entries(newPaths as DataSourcePaths)) {
        const folders = value;
        const resolvedFolders = await Promise.all(
            folders.map(async (f) => ({ path: await resolve(rootPath, f) }))
        );
        const responses: FolderResult[] = await invoke('get_file_batch_stat', {
            folders: resolvedFolders,
        });
        dataSourceFolders[key as keyof DataSourcePaths] = responses;
    }
    return dataSourceFolders;
}

export async function readFolderData(folders: FolderCollection): Promise<RawWaferMetadataCollection> {
    const result: RawWaferMetadataCollection = [];
    for (const [key, value] of Object.entries(folders)) {
        console.log(key);
        switch (key as DataSourceType) {
            case 'substrate': {
                // 处理 substrate data
                break;
            }
            case 'fabCp': {
                break;
            }
            case 'cpProber': {
                //
                await readCpProberMetadata(value);
                console.log('test2');
                break;
            }
            case 'wlbi': {
                break;
            }
            case 'aoi': {
                break;
            }
            default: {
                break;
            }
        }
    }
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
    // const processFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
    //                            productModel   batch         processSubStage  retestCount
    // Folder: 产品型号_批次号_片号
    // const waferFolderRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)$/;
    //                          productModel   batch         waferId
    // File: 产品型号_批次号_片号_mapExt.txt
    // const fileRegex = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_mapExt\.txt$/;
    //                   productModel   batch         waferId
    
    for (const folder of folders) {
        if (!folder.exists || !folder.info?.isDirectory) continue;
        
        // Currently on the first level, looking for process folders
        const processFolders = await readDir(folder.path);    // non-recursive by nature

        for (const processFolder of processFolders) {
            if (!processFolder.isDirectory) continue;
            // Now on the second level, looking for wafer folders
            const processFolderPath = await resolve(folder.path, processFolder.name);
            const waferFolders = await readDir(processFolderPath);

            for (const wafer of waferFolders) {
                if (!wafer.isDirectory) continue;
                const waferFolderPath = await resolve(processFolderPath, wafer.name);
                const files = await readDir(waferFolderPath);
                console.log('debug', files);
            }
        }

        // const fileName = await basename(folder.path); // e.g. 产品型号_批次号_片号_mapExt.txt
        // const waferFolder = await dirname(folder.path); // .../产品型号_批次号_片号
        // const processFolder = await dirname(waferFolder); // .../产品型号_批次号_工序_复测次数

        // const fileMatch = fileRegex.exec(fileName);
        // const processMatch = processFolderRegex.exec(await basename(processFolder));

        // if (!fileMatch || !processMatch) continue;

        // const [, fileProduct, fileBatch, waferId] = fileMatch;
        // const [, procProduct, procBatch, retestCountStr] = processMatch;

        // if (fileProduct !== procProduct || fileBatch !== procBatch) continue;

        // result.push({
        //     productModel: fileProduct,
        //     batch: fileBatch,
        //     waferId,
        //     retestCount: parseInt(retestCountStr, 10),
        //     filePath: folder.path,
        //     info: folder.info,
        // });
    }

    return result;
}
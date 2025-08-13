import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

import type { DataSourceType, Folder, FolderGroupsState, DirResult } from '@/types/DataSource';

import { initialDataSourceState as initialState } from '@/constants/default';
import { RootState } from '@/store';
import { resolve } from '@tauri-apps/api/path';
import { invokeReadFileStatBatch } from '@/api/tauri/fs';
import { norm } from '@/utils/fs';

// DEVELOPER NOTES:
// April 10, 2025
// - assuming that there won't be over 1-10K number of sub folders within the root
//      data folder, using Tauri's built-in resolve SHOULD not pose any significant
//      performance bottlenecks

// Specifically for the folder type
function sortFoldersByName(folders: Folder[]): Folder[] {
    return folders.slice().sort((a, b) => {
        const aName = a.path.split(/[/\\]/).pop() || a.path;
        const bName = b.path.split(/[/\\]/).pop() || b.path;
        return aName.localeCompare(bName);
    });
}

export const initDataSourceState = createAsyncThunk<
    FolderGroupsState,
    void,
    { state: RootState }
>('dataSourceState/init', async (_, thunkAPI) => {
    const { dataSourceConfig } = thunkAPI.getState();
    const { rootPath, paths } = dataSourceConfig;

    const result: FolderGroupsState = { ...initialState };

    for (const [type] of Object.entries(paths)) {
        // Filter out the 'lastModified' attribute that DNE in the type
        if (type === 'lastModified') continue;
        const typed = type as DataSourceType;

        const relativePaths = paths[typed];
        const resolved: Folder[] = await Promise.all(
            relativePaths.map(async (relPath): Promise<Folder> => {
                const absPath = norm(await resolve(rootPath, relPath));
                return {
                    id: uuidv4(),
                    path: absPath,
                    type: typed,
                    error: false,
                };
            })
        );

        result[typed] = sortFoldersByName(resolved);
    }
    return result;
});

/**
 * Async thunk: validate folder paths (check if exists) and update error/info
 */
export const refreshFolderStatuses = createAsyncThunk(
    'dataSourceState/refreshStatuses',
    async (_, { getState }) => {
        const state = getState() as { dataSourceState: FolderGroupsState };

        const updatedGroups: FolderGroupsState = { ...state.dataSourceState };

        try {
            for (const [type, value] of Object.entries(updatedGroups)) {
                if (type === 'lastModified') continue;
                const typed = type as DataSourceType;

                const folders: Folder[] = value;
                const responses: DirResult[] = await invokeReadFileStatBatch(folders.map((f) => f.path));

                const pathToResult = new Map(responses.map(r => [norm(r.path), r]));

                updatedGroups[typed] = sortFoldersByName(
                    folders.map((folder) => {
                        const result = pathToResult.get(folder.path);
                        if (!result || !result.exists) {
                            return { ...folder, info: undefined, error: true };
                        }
                        return { ...folder, info: result.info!, error: false };
                    })
                );
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error('An error occured while refreshing data source folder status:', err);
        }

        return updatedGroups;
    }
);

const dataSourceStateSlice = createSlice({
    name: 'dataSourceState',
    initialState,
    reducers: {
        /**
         * Assuming that this method is only called by the DirectorySelector component,
         * which always selects a valid path. Therefore, no need to check again.
         * @param state 
         * @param action 
         */
        addFolder: (state, action: PayloadAction<{ type: DataSourceType; path: string }>) => {
            const { type, path } = action.payload;
            const exists = state[type].some((f) => f.path === path);
            if (!exists) {
                state[type].push({
                    id: uuidv4(),           // they also have an arbitrary ID value
                    path,                   // this is the computed absolute path based on the root folder path
                    type,
                    error: false,
                });
            }
            state[type] = sortFoldersByName(state[type]);
        },
        /**
         * Removes folder by its path (string match).
         */
        removeFolder: (state, action: PayloadAction<{ type: DataSourceType; path: string }>) => {
            const { type, path } = action.payload;
            state[type] = state[type].filter((f) => f.path !== path);
        },

        /**
         * Removes folder by unique id.
         */
        removeFolderById: (state, action: PayloadAction<{ type: DataSourceType; id: string }>) => {
            const { type, id } = action.payload;
            state[type] = state[type].filter((f) => f.id !== id);
            return state;
        },
        resetFolders: (state) => {
            state = { ...initialState };
            return state;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(refreshFolderStatuses.fulfilled, (_state, action) => {
            return action.payload;
        });
        builder.addCase(initDataSourceState.fulfilled, (_state, action) => {
            return action.payload;
        });
    },
});

export const { addFolder, removeFolder, removeFolderById, resetFolders } = dataSourceStateSlice.actions;
export default dataSourceStateSlice.reducer;
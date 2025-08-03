import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// All packages except `@mantine/hooks` require styles imports
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import { Provider, useDispatch } from 'react-redux'
import { BrowserRouter } from 'react-router-dom';

import App from '@/App';

import store, { AppDispatch } from '@/store';
import { initPreferences } from '@/slices/preferencesSlice';

import { initialize } from '@/utils/init';
import { initDataSourceConfig } from '@/slices/dataSourcePathsConfigSlice';
import { initDataSourceState, refreshFolderStatuses } from '@/slices/dataSourceStateSlice';
import { DataSourceConfigState, FolderGroups } from '@/types/DataSource';

function AppInitializer({ children }: { children: React.ReactNode }) {
    const dispatch = useDispatch<AppDispatch>();

    useEffect(() => {
        const runInit = async () => {
            try {
                await initialize();
                await dispatch(initPreferences()).unwrap();
                const dataSourceConfig: DataSourceConfigState = await dispatch(initDataSourceConfig()).unwrap();
                const dataSourceState: FolderGroups = await dispatch(initDataSourceState()).unwrap();

                if (import.meta.env.DEV) {
                    console.debug('[INIT]', dataSourceConfig);
                    console.debug('[INIT]', dataSourceState);
                }

                setInterval(() => {
                    try {
                        dispatch(refreshFolderStatuses());
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } catch (err: any) {
                        console.error(err);
                    }
                }, 1000);
            } catch (e) {
                console.error('Initialization failed:', e);
            }
        };
        runInit();
    }, []);

    return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <MantineProvider>
        <React.StrictMode>
            <Provider store={store}>
                <AppInitializer>
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </AppInitializer>
            </Provider>
        </React.StrictMode>
    </MantineProvider>
);
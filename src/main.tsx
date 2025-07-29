import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";

// All packages except `@mantine/hooks` require styles imports
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import { Provider, useDispatch } from 'react-redux'
import { BrowserRouter } from 'react-router-dom';

import store, { AppDispatch } from './store';
import { initPreferences } from './slices/preferencesSlice';

import App from "./App";
import { initialize } from "@/utils/init";
import { initDataSourceConfig } from "./slices/dataSourcePathsConfigSlice";

function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const runInit = async () => {
      try {
        await initialize();

        const { dataSourcesConfigPath } = await dispatch(initPreferences()).unwrap();
        
        const dataSourceConfig = await dispatch(
          initDataSourceConfig({ dataSourcesConfigPath }) // or omit param if defaulted
        ).unwrap();

        console.log(dataSourceConfig);
      } catch (e) {
        console.error('Initialization failed:', e);
      }
    };

    runInit();
  }, [dispatch]);

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
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
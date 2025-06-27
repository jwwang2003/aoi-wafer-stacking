import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";

// All packages except `@mantine/hooks` require styles imports
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import { Provider, useDispatch } from 'react-redux'
import store, { AppDispatch } from './store';
import { initConfigFilePath } from './slices/userPreferencesSlice';
// import { loadConfigFromFile } from './slices/configSlice';

import App from "./App";

import { init_fs } from "@/helpers/init";

function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    console.log("hello!");
    init_fs()
      .then((e) => {
        // 1. make sure pref & config file exist
        dispatch(initConfigFilePath())
          .unwrap()
          .finally()
          .catch((e) => {
            console.log(e)
          });
        // 2. then load your config JSON into Redux
        // .then(() => dispatch(loadConfigFromFile()));
      })
      .catch((e) => {
        console.log(e);
      })
  }, [dispatch]);

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MantineProvider>
    <React.StrictMode>
      <Provider store={store}>
        <AppInitializer>
          <App />
        </AppInitializer>
      </Provider>
    </React.StrictMode>
  </MantineProvider>,
);

// init methods
function fs_init() {

}
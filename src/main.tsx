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
import { initialize } from "@/helpers/init";

function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    initialize()
      .then(() => {
        dispatch(initPreferences())
          .unwrap()
          .catch((e) => {
            console.error(e);
          });
      })
      .catch((e) => {
        console.error(e);
      });
  }, [dispatch]);

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MantineProvider>
    <React.StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <AppInitializer>
            <App />
          </AppInitializer>
        </BrowserRouter>
      </Provider>
    </React.StrictMode>
  </MantineProvider>
);
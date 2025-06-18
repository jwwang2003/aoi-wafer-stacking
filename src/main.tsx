import React from "react";
import ReactDOM from "react-dom/client";

// All packages except `@mantine/hooks` require styles imports
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import store from './store'
import { Provider } from 'react-redux'

import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MantineProvider>
    <React.StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>
  </MantineProvider>,
);
import React from "react";
import ReactDOM from "react-dom/client";

// All packages except `@mantine/hooks` require styles imports
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MantineProvider>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </MantineProvider>,
);
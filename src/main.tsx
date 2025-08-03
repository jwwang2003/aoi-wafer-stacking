import React from 'react';
import ReactDOM from 'react-dom/client';

// All packages except `@mantine/hooks` require styles imports
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom';

import App from '@/App';

import store from '@/store';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <MantineProvider>
        <React.StrictMode>
            <Provider store={store}>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </Provider>
        </React.StrictMode>
    </MantineProvider>
);
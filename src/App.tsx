import { useState, useEffect } from 'react';
import {
    Routes,
    Route,
    useLocation,
    Link,
} from 'react-router-dom';
import {
    Box,
    Flex,
    Button,
    Tooltip
} from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContainer, toast } from 'react-toastify';

import { menuItems } from '@/constants/MenuItems';
import { useDispatch } from 'react-redux';
import { AppDispatch } from './store';
import { initialize } from './utils/init';
import { initPreferences } from './slices/preferencesSlice';
import { DataSourceConfigState, FolderGroups } from './types/DataSource';
import { initDataSourceConfig } from './slices/dataSourcePathsConfigSlice';
import { initDataSourceState, refreshFolderStatuses } from './slices/dataSourceStateSlice';

// Small helper function
function getTopLevelPath(pathname: string): string {
    const segments = pathname.split('/').filter(Boolean);
    return '/' + (segments[0] || '');
}

export function AnimatedRoutes() {
    const location = useLocation();
    const topLevelKey = getTopLevelPath(location.pathname);

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={topLevelKey}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.10 }}
                style={{ flex: 1, overflow: 'auto' }}
            >
                {/* The app router is located here! */}
                <Routes location={location}>
                    {menuItems.map(({ path, component: Component }) => (
                        <Route key={path} path={path + '/*'} element={<Component />} />
                    ))}
                    <Route path="*" element={<div>未找到内容</div>} />
                </Routes>
            </motion.div>
        </AnimatePresence>
    );
}

export default function App() {
    const [hovered, setHovered] = useState<string | null>(null);
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();

    // A welcome message whenever the UI is loaded!
    useEffect(() => {
        toast.info('欢迎使用！', {
            position: 'top-right',
            autoClose: 7500,            // wait for 7.5 seconds
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: false,
            draggable: false,
        });
    }, []);

    useEffect(() => {
        const runInit = async () => {
            try {
                console.debug('Initializing...');
                await initialize();
                console.debug('Initialized!');
                await dispatch(initPreferences()).unwrap();
                console.debug('Initialized preferences!');
                const dataSourceConfig: DataSourceConfigState = await dispatch(initDataSourceConfig()).unwrap();
                const dataSourceState: FolderGroups = await dispatch(initDataSourceState()).unwrap();

                if (import.meta.env.DEV) {
                    console.debug('[INIT]', dataSourceConfig);
                    console.debug('[INIT]', dataSourceState);
                }

                setInterval(() => {
                    try {
                        dispatch(refreshFolderStatuses());
                    } catch (err) {
                        console.error(err);
                    }
                }, 1000);
            } catch (e) {
                console.error('Initialization failed:', e);
            }
        };
        runInit();
        // if (import.meta.hot) {
        //     import.meta.hot.accept(async () => {
        //         console.debug('[HMR] Re-running init...');
        //         runInit();
        //     });
        // }
    }, []);

    return (
        <div style={{ position: 'relative', height: '100vh', display: 'flex', overflow: 'hidden' }}>
            {/* Sidebar */}
            <Box
                p="md"
                style={{
                    width: 60,
                    borderRight: '1px solid #eaeaea',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                {/* Top Buttons */}
                <SidebarButtonGroup
                    items={menuItems.slice(0, 5)}
                    hovered={hovered}
                    setHovered={setHovered}
                    currentPath={location.pathname}
                />

                {/* Bottom Buttons */}
                <SidebarButtonGroup
                    items={menuItems.slice(5)}
                    hovered={hovered}
                    setHovered={setHovered}
                    currentPath={location.pathname}
                />
            </Box>

            {/* Main content */}
            <AnimatedRoutes />
            <ToastContainer />
        </div>
    );
}
function SidebarButtonGroup({
    items,
    hovered,
    setHovered,
    currentPath,
}: {
    items: typeof menuItems;
    hovered: string | null;
    setHovered: (path: string | null) => void;
    currentPath: string;
}) {
    return (
        <Flex direction="column" align="center" gap="md">
            {items.map(({ icon: Icon, label, path }) => {
                const isHovered = hovered === path;
                const isActive =
                    path === '/'
                        ? currentPath === '/'
                        : currentPath.startsWith(path + '/') || currentPath === path;

                return (
                    <Tooltip key={path} label={label} position="right">
                        <Button
                            component={Link}
                            to={path}
                            aria-label={label}
                            variant={isActive ? 'filled' : 'outline'}
                            onMouseEnter={() => setHovered(path)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                width: 40,
                                height: 40,
                                padding: 0,
                                transform: isHovered ? 'scale(1.075)' : 'scale(1)',
                                transition: 'transform 150ms ease',
                            }}
                        >
                            <Icon size={20} strokeWidth={2} />
                        </Button>
                    </Tooltip>
                );
            })}
        </Flex>
    );
}
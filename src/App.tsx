import { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from './store';

import { Box, Flex, Button, Tooltip } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContainer } from 'react-toastify';

// Components
import { infoToast } from '@/components/Toaster';
// UTILS
import { initialize } from '@/utils/init';
import { initConsoleInterceptor } from '@/utils/log';
import { warmIndexCaches } from '@/utils/fs';

import { initPreferences } from '@/slices/preferencesSlice';
import { initDataSourceConfig } from '@/slices/dataSourceConfigSlice';
import { initDataSourceState, refreshFolderStatuses } from '@/slices/dataSourceStateSlice';

import { DataSourceConfigState, FolderGroups } from '@/types/dataSource';
import { PreferencesState } from '@/types/preferences';

import { menuItems } from '@/constants/MenuItems';

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
    const [mounted, setMounted] = useState<boolean>(false);
    const [hovered, setHovered] = useState<string | null>(null);
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();

    // A welcome message whenever the UI is loaded!
    useEffect(() => {
        if (mounted) {
            infoToast({ title: '欢迎使用' });
            console.log('Hello, world!');
        }

        if (!mounted) {
            setMounted(true);
        }
    }, []);

    useEffect(() => {
        const runInit = async () => {
            try {
                await initConsoleInterceptor();

                console.log('Initializing...');
                console.time('initialize');
                // Initializes the configuration folder structure & initializes the database
                await initialize();
                const preferences: PreferencesState = await dispatch(initPreferences()).unwrap();
                console.log('%cInitialized preferences!', 'color: orange', preferences);
                const dataSourceConfig: DataSourceConfigState = await dispatch(initDataSourceConfig()).unwrap();
                console.log('%cInitialized dataSourceConfig!', 'color: orange', dataSourceConfig);
                const dataSourceState: FolderGroups = await dispatch(initDataSourceState()).unwrap();
                console.log('%cInitialized dataSourceState!', 'color: orange', dataSourceState);

                console.debug('%cLoaded preferences:', 'color: lime; background: black', JSON.stringify(preferences, null, 2));
                console.debug('%cLoaded dataSourceConfig:', 'color: lime; background: black', JSON.stringify(dataSourceConfig, null, 2));

                console.log('%cInitialization complete!', 'color: blue');
                console.timeEnd('initialize');

                // Warm-up the index caches for folders and files
                await warmIndexCaches();

                // Constantly check for a change in the folder status of the root folder
                // TODO: Change this pooling method into a event based method!
                setInterval(() => {
                    try {
                        dispatch(refreshFolderStatuses());
                    } catch (err) {
                        console.error(err);
                    }
                }, 1000);
            } catch (e) {
                console.error('Initialization failed!', e);
            }
        };
        runInit();

        if (import.meta.hot) {
            import.meta.hot.accept(async () => {
                console.debug('%c[HMR] Re-running init...', 'color: red');
                runInit();
            });
        }
    }, []);

    return (
        <div style={{ position: 'relative', height: '100vh', display: 'flex', overflow: 'hidden' }}>
            {/* Sidebar */}
            <Box
                tabIndex={-1}
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
                <SidebarButtonGroup items={menuItems.slice(0, 5)} hovered={hovered} setHovered={setHovered} currentPath={location.pathname} />
                {/* Bottom Buttons */}
                <SidebarButtonGroup items={menuItems.slice(5)} hovered={hovered} setHovered={setHovered} currentPath={location.pathname} />
            </Box>
            {/* Main content */}
            <AnimatedRoutes />
            <ToastContainer />
        </div>
    );
}

type Item = { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; path: string };

interface SidebarButtonGroupInterface {
    items: Item[];
    hovered: string | null;
    setHovered: (path: string | null) => void;
    currentPath: string;
}

function SidebarButtonGroup({ items, hovered, setHovered, currentPath }: SidebarButtonGroupInterface) {
    // index that is currently tabbable
    const activeIndexFromRoute = useMemo(() => {
        const idx = items.findIndex(({ path }) =>
            path === '/'
                ? currentPath === '/'
                : currentPath === path || currentPath.startsWith(path + '/')
        );
        return idx >= 0 ? idx : 0;
    }, [items, currentPath]);

    const [focusIndex, setFocusIndex] = useState<number>(activeIndexFromRoute);

    // keep roving focus in sync with route changes
    useEffect(() => setFocusIndex(activeIndexFromRoute), [activeIndexFromRoute]);

    // refs to focus the underlying buttons/anchors
    const refs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
    refs.current = items.map((_, i) => refs.current[i] ?? null);

    const moveFocus = (next: number) => {
        const clamped = Math.max(0, Math.min(items.length - 1, next));
        setFocusIndex(clamped);
        const el = refs.current[clamped];
        if (el) el.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // ignore when modifier keys held
        if (e.altKey || e.ctrlKey || e.metaKey) return;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                moveFocus(focusIndex - 1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                moveFocus(focusIndex + 1);
                break;
            case 'Home':
                e.preventDefault();
                moveFocus(0);
                break;
            case 'End':
                e.preventDefault();
                moveFocus(items.length - 1);
                break;
            default:
                break;
        }
    };

    return (
        <Flex
            direction="column"
            align="center"
            gap="md"
            role="toolbar"
            aria-label="Sidebar navigation"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
        >
            {items.map(({ icon: Icon, label, path }, i) => {
                const isHovered = hovered === path;
                const isActive =
                    path === '/'
                        ? currentPath === '/'
                        : currentPath === path || currentPath.startsWith(path + '/');

                return (
                    <Tooltip key={path} label={label} position="right">
                        <Button
                            component={Link}
                            to={path}
                            aria-label={label}
                            // announce current page to ATs when applicable
                            aria-current={isActive ? 'page' : undefined}
                            // roving tabindex: only one is 0, others -1
                            tabIndex={i === focusIndex ? 0 : -1}
                            // update roving index if the user clicks or tabs into an item
                            onFocus={() => setFocusIndex(i)}
                            ref={(el) => { refs.current[i] = el; }}
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
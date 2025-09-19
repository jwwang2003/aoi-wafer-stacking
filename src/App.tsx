import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from './store';

import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { Box, Button, Tooltip } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContainer } from 'react-toastify';

// Components
import { infoToast } from '@/components/Toaster';
import { SidebarButtonGroup } from '@/components/SidebarButton';
import AuthModal from '@/auth/AuthModal';

// UTILS
import { initialize } from '@/utils/init';
import { IS_PROD, IS_DEV } from '@/env';
import { setSqlDebugLogging } from '@/db';
import { warmIndexCaches } from '@/utils/fs';
import { isAdmin, isPrivileged } from '@/utils/auth';
import { initConsoleInterceptor } from '@/utils/log';   // debugging...

// REDUX
import { initPreferences } from '@/slices/preferencesSlice';
import { initDataSourceConfig } from '@/slices/dataSourceConfigSlice';
import { initDataSourceState, refreshFolderStatuses } from '@/slices/dataSourceStateSlice';
import { initAuth, loginWithRole, switchToGuest, checkAdminDefaultPassword, setAdminPassword } from '@/slices/authSlice';

// TYPES
import { DataSourceConfigState, FolderGroups } from '@/types/dataSource';
import { PreferencesState } from '@/types/preferences';
import { AuthRole, AuthRoleName } from '@/types/auth';

// Routing
import MenuItems from '@/MenuItems';


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
                    {MenuItems.map(({ path, component: Component }) => (
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
    const [authOpen, setAuthOpen] = useState(false);
    const authRole = useSelector((s: RootState) => s.auth.role);
    const adminDefault = useSelector((s: RootState) => s.auth.adminDefaultPassword);
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();

    // A welcome message whenever the UI is loaded!
    useEffect(() => {
        if (mounted) {
            infoToast({ title: '欢迎使用' });
            console.info('%cHello, world!', 'color:#2563eb');
        }

        if (!mounted) {
            setMounted(true);
        }
    }, []);

    // Sidebar items filtered by permissions (admin-only item hidden for non-admins)
    const filteredMenu = useMemo(
        () => MenuItems.filter(mi => mi.value !== 'admin' || authRole === AuthRole.Admin),
        [authRole]
    );

    useEffect(() => {
        const runInit = async () => {
            try {
                // Log environment once at first React init
                // Vite flags: import.meta.env.MODE and import.meta.env.PROD
                console.info(`[Env] MODE=${import.meta.env.MODE} | PROD=${String(import.meta.env.PROD)} | IS_PROD=${String(IS_PROD)} | IS_DEV=${String(IS_DEV)}`);
                await initConsoleInterceptor();

                console.info('%cInitializing...', 'color:#2563eb');
                console.time('initialize');
                // Initializes the configuration folder structure & initializes the database
                await initialize();
                const preferences: PreferencesState = await dispatch(initPreferences()).unwrap();
                // Apply SQL debug flag to DB logger
                setSqlDebugLogging(preferences.sqlDebug);
                console.info('%cInitialized preferences!', 'color:#22c55e; font-weight:600', preferences);
                const dataSourceConfig: DataSourceConfigState = await dispatch(initDataSourceConfig()).unwrap();
                console.info('%cInitialized dataSourceConfig!', 'color:#22c55e; font-weight:600', dataSourceConfig);
                const dataSourceState: FolderGroups = await dispatch(initDataSourceState()).unwrap();
                console.info('%cInitialized dataSourceState!', 'color:#22c55e; font-weight:600', dataSourceState);
                
                const logJson = (label: string, obj: unknown) => {
                    const pretty = JSON.stringify(obj, null, 2);
                    const indented = pretty.split('\n').map(l => `  ${l}`).join('\n');
                    // Debug-level, colored header + colored body
                    console.debug(
                        `%c📄 ${label}%c\n${indented}`,
                        'color:black',
                        'color:black'
                    );
                };
                logJson('Loaded preferences', preferences);
                logJson('Loaded dataSourceConfig', dataSourceConfig);

                console.info('%cInitialization complete!', 'color:#2563eb; font-weight:600');
                console.timeEnd('initialize');

                // Warm-up the index caches for folders and files
                await warmIndexCaches();

                // Initialize Redux-only auth state
                try { await dispatch(initAuth()).unwrap(); } catch (err) { console.error('Auth init failed', err); }

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

    const loginTooltip = useMemo(() => {
        if (authRole === AuthRole.Guest) {
            return `登录为${AuthRoleName[AuthRole.Admin]}或${AuthRoleName[AuthRole.User]}`;
        }
        return `已是${AuthRoleName[authRole]} (点击切换为${AuthRoleName[AuthRole.Guest]})`;
    }, [authRole]);

    const loginAriaLabel = useMemo(() => {
        if (authRole === AuthRole.Guest) return '进入登录模式';
        return `退出${AuthRoleName[authRole]}`;
    }, [authRole]);

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
                <SidebarButtonGroup items={filteredMenu.slice(0, 5)} hovered={hovered} setHovered={setHovered} currentPath={location.pathname} />
                {/* Bottom Buttons + Auth */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                    <SidebarButtonGroup items={filteredMenu.slice(5)} hovered={hovered} setHovered={setHovered} currentPath={location.pathname} />
                    {/* Auth toggle button */}
                    <Tooltip label={loginTooltip} position="right">
                        <Button
                            aria-label={loginAriaLabel}
                            tabIndex={0}
                            variant={isPrivileged(authRole) ? 'filled' : 'outline'}
                            color={isAdmin(authRole) ? 'lightgreen' : ''}
                            onMouseEnter={() => setHovered('/__auth')}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => {
                                if (isPrivileged(authRole)) {
                                    dispatch(switchToGuest());
                                } else {
                                    // Check if admin password is default before opening modal
                                    dispatch(checkAdminDefaultPassword()).finally(() => setAuthOpen(true));
                                }
                            }}
                            style={{
                                width: 40,
                                height: 40,
                                padding: 0,
                                transform: hovered === '/__auth' ? 'scale(1.075)' : 'scale(1)',
                                transition: 'transform 150ms ease',
                            }}
                        >
                            {authRole === AuthRole.Admin ?
                                <IconLockOpen size={20} strokeWidth={2} /> :
                                <IconLock size={20} strokeWidth={2} />
                            }
                        </Button>
                    </Tooltip>
                </div>
            </Box>
            {/* Main content */}
            <AnimatedRoutes />
            <ToastContainer />

            {/* Auth modal */}
            <AuthModal
                opened={authOpen}
                onClose={() => setAuthOpen(false)}
                onSuccess={() => setAuthOpen(false)}
                validateCredentials={async (role, pwd, username) => {
                    const res = await dispatch(loginWithRole({ role, password: pwd, username }));
                    return loginWithRole.fulfilled.match(res);
                }}
                adminDefaultPassword={adminDefault}
                onChangeAdminPassword={async (newPwd) => {
                    const res = await dispatch(setAdminPassword(newPwd));
                    return setAdminPassword.fulfilled.match(res);
                }}
                title="选择登录模式"
            />
        </div>
    );
}

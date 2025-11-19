import { Container, Group, Stack, SegmentedControl, Button, Paper, useMantineTheme, Switch } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    Routes,
    Route,
    useNavigate,
    useLocation,
    Navigate,
} from 'react-router-dom';
import { useMemo, useState } from 'react';
import ProductViewer from '@/components/Navigator/ProductViewer';
import JobManager from '@/components/JobManager';
import LayersSelector from '@/components/Form/LayersSelector';
import ComingSoon from '../ComingSoon';
import WaferMapIndex from './WaferMapIndex';

import { appDataDir, join, basename } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { deleteAllFileIndexes } from '@/db/fileIndex';
import { resetSpreadSheetData } from '@/db/spreadSheet';
import { deleteAllFolderIndexes } from '@/db/folderIndex';
import { deleteAllWaferMaps } from '@/db/wafermaps';
import { warmIndexCaches } from '@/utils/fs';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { setSqlDebug } from '@/slices/preferencesSlice';
import { setSqlDebugLogging } from '@/db';
import { infoToast, errorToast } from '@/components/UI/Toaster';

const subpageOptions = [
    { label: '预览', value: 'browse' },
    { label: '索引', value: 'search' },
    { label: '更多', value: 'more' }
];

export default function DatabaseIndexPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // figure out which segment is active
    const currentValue = useMemo(() => {
        const match = subpageOptions.find((opt) => location.pathname.endsWith(opt.value));
        return match?.value ?? 'browse';
    }, [location.pathname]);

    const handleChange = (value: string) => {
        navigate(`/db/data/${value}`);
    };

    return (
        <Group grow>
            <Container fluid p="md">
                <Stack gap="md">
                    <SegmentedControl
                        w="min-content"
                        data={subpageOptions}
                        value={currentValue}
                        onChange={handleChange}
                    />
                    <Routes>
                        <Route path="/" element={<Navigate to="browse" replace />} />
                        <Route path="browse" element={<BrowsePage />} />
                        <Route path="search" element={<WaferMapIndex />} />
                        <Route path="more" element={<MorePage />} />
                        <Route path="*" element={<ComingSoon />} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}

function BrowsePage() {
    const theme = useMantineTheme();
    const isNarrow = useMediaQuery(`(max-width: ${theme.breakpoints.lg})`);
    return (
        <Group align="start" gap="md" wrap="wrap" style={{ overflowX: 'visible' }}>
            <Stack style={{ flex: '1 1 600px', minWidth: 0 }}>
                <ProductViewer />
            </Stack>
            <Stack
                gap="md"
                style={{
                    flex: isNarrow ? '1 1 100%' : '0 0 360px',
                    width: isNarrow ? '100%' : 360,
                    minWidth: isNarrow ? 0 : 300,
                }}
            >
                <LayersSelector />
                <JobManager />
            </Stack>
        </Group>
    );
}

/** Helpers */
async function getDbAbsolutePath() {
    // The Tauri SQL plugin with "sqlite:data.db" stores the DB in the app's data dir.
    const dir = await appDataDir();
    return join(dir, 'data.db');
}

/** “更多” subpage implementation */
function MorePage() {
    const dispatch = useAppDispatch();
    const sqlDebug = useAppSelector(s => s.preferences.sqlDebug);
    const [busy, setBusy] = useState(false);
    const handleResetDb = async () => {
        if (!await Promise.resolve(window.confirm('确认要重置数据库吗？该操作将清空所有晶圆、缓存与索引数据，且无法撤销。'))) {
            return;
        }

        setBusy(true);
        try {
            await deleteAllWaferMaps();
            await resetSpreadSheetData();
            await deleteAllFileIndexes();
            await deleteAllFolderIndexes();
            await warmIndexCaches();
            infoToast({ title: '重置完成', message: '数据库已成功重置。' });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            errorToast({ title: '重置失败', message });
        } finally {
            setBusy(false);
        }
    };

    const handleExportDb = async () => {
        setBusy(true);
        try {
            const src = await getDbAbsolutePath();
            // default file name: keep the original base name, but suggest something friendly
            const defaultName = await basename(src).catch(() => 'wafer-db.sqlite');
            const target = await save({
                title: '导出数据库文件',
                filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
                defaultPath: `./${defaultName}`,
            });

            if (!target) {
                setBusy(false);
                return; // user cancelled
            }

            const bytes = await readFile(src);
            await writeFile(target, bytes);

            infoToast({ title: '导出完成', message: `已导出到：${target}` });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '导出失败', message: msg });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack>
            <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                    <Group>
                        <Switch
                            checked={sqlDebug}
                            label="输出 SQL 调试日志"
                            onChange={(e) => {
                                const on = e.currentTarget.checked;
                                dispatch(setSqlDebug(on));
                                setSqlDebugLogging(on);
                            }}
                        />
                    </Group>
                    <Group>
                        <Button loading={busy} onClick={handleExportDb}>
                            {'导出数据库（.sql）'}
                        </Button>
                        <Button variant="outline" color="red" onClick={handleResetDb} loading={busy}>
                            {'重置数据库'}
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </Stack>
    );
}

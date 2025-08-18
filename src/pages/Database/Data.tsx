import {
    Container,
    Group,
    Stack,
    SegmentedControl,
    Button,
    Text,
    Paper,
} from '@mantine/core';
import {
    Routes,
    Route,
    useNavigate,
    useLocation,
    Navigate,
} from 'react-router-dom';
import { useMemo, useState } from 'react';
import ProductViewer from '@/components/Navigator/ProductViewer';
import ComingSoon from '../ComingSoon';

import { appDataDir, join, basename } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { deleteAllFileIndexes } from '@/db/fileIndex';
import { resetSpreadSheetData } from '@/db/spreadSheet';
import { deleteAllFolderIndexes } from '@/db/folderIndex';
import { deleteAllWaferMaps } from '@/db/wafermaps';
import { warmIndexCaches } from '@/utils/fs';

const subpageOptions = [
    { label: '快速预览', value: 'browse' },
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
                        <Route path="search" element={<ComingSoon />} />
                        <Route path="more" element={<MorePage />} />
                        <Route path="*" element={<ComingSoon />} />
                    </Routes>
                </Stack>
            </Container>
        </Group>
    );
}

function BrowsePage() {
    return (
        <Stack>
            <ProductViewer />
        </Stack>
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
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const handleResetDb = async () => {
        await deleteAllWaferMaps();
        await resetSpreadSheetData();
        await deleteAllFileIndexes();
        await deleteAllFolderIndexes();
        await warmIndexCaches();
    }

    const handleExportDb = async () => {
        setBusy(true);
        setMsg(null);
        setErr(null);
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

            setMsg(`已导出到：${target}`);
        } catch (e: any) {
            setErr(`导出失败：${e?.message ?? String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack>
            <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                    {/* <Text c="dimmed" size="sm">
                        工具与设置
                    </Text>
                    <Divider /> */}
                    <Group>
                        <Button loading={busy} onClick={handleExportDb}>
                            导出整个数据库文件
                        </Button>
                        <Button variant='outline' color='red' onClick={handleResetDb}>
                            重置数据库
                        </Button>
                    </Group>

                    {msg && (
                        <Text size="sm" c="teal">
                            {msg}
                        </Text>
                    )}
                    {err && (
                        <Text size="sm" c="red">
                            {err}
                        </Text>
                    )}
                </Stack>
            </Paper>
        </Stack>
    );
}

import { useEffect, useMemo, useState } from 'react';
import {
    Title, Stack, Button, Group, Tooltip, Divider, Indicator, SegmentedControl,
    Text, Checkbox, Pagination, Select
} from '@mantine/core';
import { IconLoader, IconReload } from '@tabler/icons-react';

import Database from '@tauri-apps/plugin-sql';
import { useDispatch } from 'react-redux';

// Store
import { AppDispatch } from '@/store';
import { useAppSelector } from '@/hooks';
import { fetchWaferMetadata } from '@/slices/waferMetadataSlice';
import { advanceStepper } from '@/slices/preferencesSlice';
// DB
import { getDb } from '@/db';
import { deleteAllFileIndexes } from '@/db/fileIndex';
import { deleteAllFolderIndexes } from '@/db/folderIndex';
// Cache
import { resetSessionFileIndexCache, resetSessionFolderIndexCache } from '@/utils/fs';
// Components
import RawWaferSummary from '@/components/RawWaferSummary';
// Utils
import { processNSyncExcelData, processNSyncWaferData } from '@/utils/wafer';
// Types
import { ExcelMetadata, WaferFileMetadata } from '@/types/wafer';
import { ConfigStepperState } from '@/types/stepper';
import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/MetadataCard';
import { AutoTriggers } from '@/types/preferences';
import AutoTrigger from '@/components/AutoTriggerSwitch';
import { infoToast } from '@/components/Toaster';

export default function Preview() {
    const dispatch = useDispatch<AppDispatch>();
    const [mounted, setMounted] = useState<boolean>(false);

    const searchAutoTrigger = useAppSelector(s => s.preferences.autoTriggers.search);
    const ingestAutoTrigger = useAppSelector(s => s.preferences.autoTriggers.ingest);

    const stepper = useAppSelector((state) => state.preferences.stepper);
    const rawWaferMetadata = useAppSelector((state) => state.waferMetadata);

    const [db, setDb] = useState<Database | null>(null);
    const [loading, setLoading] = useState(false);

    // Write-throuch session cache
    const [ignoreSessionCache, setIgnoreSessionCache] = useState<boolean>(false);
    const [resetCache, setResetCache] = useState<boolean>(false);

    // Pagination & filter state
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [kind, setKind] = useState<'all' | 'excel' | 'wafer'>('all');

    // Build filtered items once
    const items = useMemo(() => {
        const all = rawWaferMetadata;
        if (kind === 'excel') return all.filter((r): r is ExcelMetadata => 'type' in r);
        if (kind === 'wafer') return all.filter((r): r is WaferFileMetadata => 'waferId' in r);
        return all;
    }, [rawWaferMetadata, kind]);

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageItems = useMemo(() => items.slice(start, end), [items, start, end]);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        if (!mounted) {
            setMounted(true);
        }
    }, []);

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================

    const handleLoadWaferMetadata = async () => {
        setLoading(true);
        try {
            if (!db) return;
            if (ignoreSessionCache) {
                // Clear the session file and folder caches
                await resetSessionFileIndexCache();
                await resetSessionFolderIndexCache();
                setIgnoreSessionCache(false);   // reset

                if (resetCache) {
                    await deleteAllFileIndexes();
                    await deleteAllFolderIndexes();
                    setResetCache(false);       // reset
                }
            }
            await dispatch(fetchWaferMetadata());
        } catch (err) {
            console.error('Load failed:', err);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Any files/folders that had defected changes will be reprocessed and upserted into the database.
     * @returns 
     */
    const handleSQLDataIngest = async () => {
        if (!db) return;
        setLoading(true);
        try {
            const excelRecords = rawWaferMetadata.filter((r): r is ExcelMetadata => 'type' in r);
            const waferRecords = rawWaferMetadata.filter((r): r is WaferFileMetadata => 'waferId' in r);

            let sum = 0;

            // 2) batch‐upsert in one transaction
            sum += await processNSyncExcelData(excelRecords);
            sum += await processNSyncWaferData(waferRecords);

            if (sum === 0) {
                infoToast({
                    title: '数据摄取结果',
                    message: '没有新增或更新的记录',
                });
            } else {
                infoToast({
                    title: '数据摄取结果',
                    message: `数据库已更新，共写入 ${sum} 条记录`,
                    lines: [
                        { label: 'Excel', value: excelRecords.length },
                        { label: 'Wafer', value: waferRecords.length },
                    ],
                });
            }

            // 3) advance to next step
            await dispatch(advanceStepper(ConfigStepperState.Database + 1));
        } catch (err) {
            console.error('Sync failed:', err);
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // NOTE: REACT
    // =========================================================================
    useEffect(() => {
        if (!mounted) return;

        // Init DB connection on first load
        if (!db) {
            const connectDB = async () => setDb(await getDb());
            connectDB();
        }

        if (db) {
            const tasks = async () => {
                // Triggers when mounted or db changes
                if (searchAutoTrigger && stepper >= ConfigStepperState.Metadata)
                    await handleLoadWaferMetadata();
                if (ingestAutoTrigger)
                    await handleSQLDataIngest();
            }
            tasks();
        }
    }, [mounted, db]);

    // Reset page when deps change
    useEffect(() => {
        setPage(1);
    }, [rawWaferMetadata, kind, pageSize]);

    return (
        <Stack>
            <Title order={2}>元文件数据信息</Title>

            <Group align="center" gap="sm">
                <SegmentedControl
                    value={ignoreSessionCache ? 'force' : 'cache'}
                    onChange={(v) => setIgnoreSessionCache(v === 'force')}
                    data={[
                        { label: '使用缓存', value: 'cache' },
                        { label: '重扫（写穿缓存）', value: 'force' },
                    ]}
                    disabled={loading}
                />
                <Tooltip
                    label={
                        ignoreSessionCache
                            ? '清空已有的缓冲，然后重新扫描并刷新缓存（数据库不变）'
                            : '优先使用已有缓存（更快）'
                    }
                    withArrow
                >
                    <Indicator
                        disabled={!(stepper <= ConfigStepperState.Metadata)}
                        processing
                        color="red"
                        offset={2}
                        position="top-end"
                        size={8}
                    >
                        <Button
                            fullWidth
                            disabled={stepper < ConfigStepperState.Metadata}
                            variant="light"
                            color="blue"
                            leftSection={<IconLoader size={16} />}
                            loading={loading}
                            onClick={handleLoadWaferMetadata}
                        >
                            加载/刷新
                        </Button>
                    </Indicator>
                </Tooltip>

                <Checkbox
                    label="重置缓存"
                    checked={resetCache}
                    onChange={(event) => setResetCache(event.currentTarget.checked)}
                    disabled={loading || !ignoreSessionCache}
                />

                <AutoTrigger type={AutoTriggers.search} />
            </Group>

            <RawWaferSummary description="新/修改过的数据" />

            <Group flex="1 auto">
                <Tooltip label="将未知数据添加进数据库（手动）" withArrow>
                    <Indicator
                        disabled={!(stepper <= ConfigStepperState.Database)}
                        processing
                        color="red"
                        offset={2}
                        position="top-end"
                        size={8}
                    >
                        <Button
                            disabled={stepper < ConfigStepperState.Database}
                            fullWidth
                            variant="light"
                            color="blue"
                            leftSection={<IconReload size={16} />}
                            loading={loading}
                            onClick={handleSQLDataIngest}
                        >
                            同步数据库
                        </Button>
                    </Indicator>
                </Tooltip>

                <AutoTrigger type={AutoTriggers.ingest} />
            </Group>

            <Divider />

            {total ? (
                <>
                    <Group justify="space-between" align="center">
                        <Title order={3}>新数据</Title>
                        <Group gap="sm" align="center">
                            <SegmentedControl
                                value={kind}
                                onChange={(v) => setKind(v as typeof kind)}
                                data={[
                                    { label: '全部', value: 'all' },
                                    { label: '衬底', value: 'excel' },
                                    { label: 'Wafer', value: 'wafer' },
                                ]}
                            />
                            <Select
                                w={120}
                                value={String(pageSize)}
                                onChange={(v) => setPageSize(Number(v ?? 20))}
                                data={['10', '20', '50', '100']}
                                label="每页"
                            />
                        </Group>
                    </Group>

                    <Group justify="space-between" align="center" mt="xs">
                        <Text c="dimmed" size="sm">
                            显示 {total ? start + 1 : 0}-{end} / {total}
                        </Text>
                        <Pagination total={totalPages} value={page} onChange={setPage} />
                    </Group>

                    {/* Page content */}
                    <Stack mt="sm">
                        {pageItems.map((r) =>
                            'type' in r ? (
                                <ExcelMetadataCard key={r.filePath} data={r} onClick={() => open(r.filePath)} />
                            ) : (
                                <WaferFileMetadataCard key={r.filePath} data={r} />
                            )
                        )}
                    </Stack>

                    <Group justify="space-between" align="center" mt="md">
                        <Text c="dimmed" size="sm">
                            显示 {total ? start + 1 : 0}-{end} / {total}
                        </Text>
                        <Pagination total={totalPages} value={page} onChange={setPage} />
                    </Group>
                </>
            ) : (
                <Text>暂无新数据</Text>
            )}
        </Stack>
    );
}

import { useEffect, useState } from 'react';
import {
    Title, Stack, Button,
    Group, Tooltip, Divider, Indicator,
    SegmentedControl, Text, Checkbox
} from '@mantine/core';
import { IconLoader, IconReload } from '@tabler/icons-react';

import Database from '@tauri-apps/plugin-sql';
import { useDispatch } from 'react-redux';

// Store
import { AppDispatch } from '@/store';
import { useAppSelector } from '@/hooks';
import { fetchWaferMetadata } from '@/slices/waferMetadataSlice';
import { advanceStepper, setStepper } from '@/slices/preferencesSlice';
// DB
import { getDb } from '@/db';
import { deleteAllFileIndexes } from '@/db/fileIndex';
import { deleteAllFolderIndexes } from '@/db/folderIndex';
// Cache
import { resetSessionFileIndexCache, resetSessionFolderIndexCache } from '@/utils/fs';
// Components
import RawWaferSummary from '@/components/RawWaferSummary';
// Utils
import { processNSyncExcelData, processNSyncWaferData } from '@/utils/waferData';
// Types
import { ExcelMetadata, WaferFileMetadata } from '@/types/Wafer';
import { ConfigStepperState } from '@/types/Stepper';
import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/MetadataCard';

export default function Preview() {
    const dispatch = useDispatch<AppDispatch>();
    const [mounted, setMounted] = useState<boolean>(false);

    const stepper = useAppSelector((state) => state.preferences.stepper);
    const rawWaferMetadata = useAppSelector((state) => state.waferMetadata.data);

    const [db, setDb] = useState<Database | null>(null);
    const [loading, setLoading] = useState(false);

    // Write-throuch session cache
    const [ignoreSessionCache, setIgnoreSessionCache] = useState<boolean>(false);
    const [resetCache, setResetCache] = useState<boolean>(false);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        if (!mounted) {
            setMounted(true);
        }

        // Init DB connection on first load
        const connectDB = async () => setDb(await getDb());
        connectDB();
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

            const data = await dispatch(fetchWaferMetadata());
            if (!data) return;

            await dispatch(setStepper(ConfigStepperState.Metadata + 1));
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
    const handleSQLSynchronize = async () => {
        if (!db) return;
        setLoading(true);
        try {
            const excelRecords = rawWaferMetadata.filter((r): r is ExcelMetadata => 'type' in r);
            const waferRecords = rawWaferMetadata.filter((r): r is WaferFileMetadata => 'waferId' in r);

            // 2) batch‐upsert in one transaction
            await processNSyncExcelData(excelRecords);
            await processNSyncWaferData(waferRecords);

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
        // Triggers when mounted or db changes
        if (mounted && stepper >= ConfigStepperState.Metadata)
            handleLoadWaferMetadata();
    }, [mounted, db]);  

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
            </Group>

            <RawWaferSummary description='新/修改过的数据'/>

            <Tooltip label="将未知数据添加进数据库（手动）" withArrow>
                <Indicator
                    disabled={!(stepper <= ConfigStepperState.Database)}
                    processing
                    color="red"
                    offset={2}
                    position="top-end"
                    w="100%"
                    size={8}
                >
                    <Button
                        disabled={stepper < ConfigStepperState.Database}
                        fullWidth
                        variant="light"
                        color="blue"
                        leftSection={<IconReload size={16} />}
                        loading={loading}
                        onClick={handleSQLSynchronize}
                    >
                        同步数据库
                    </Button>
                </Indicator>
            </Tooltip>

            <Divider />

            {rawWaferMetadata.length ?
                <>
                    <Title order={3}>{'新数据'}</Title>
                    {
                        rawWaferMetadata
                            .filter((r): r is ExcelMetadata => 'type' in r)
                            .map((r) =>
                                <ExcelMetadataCard key={r.filePath} data={r} onClick={() => open(r.filePath)} />
                            )
                    }
                    {
                        rawWaferMetadata
                            .filter((r): r is WaferFileMetadata => 'waferId' in r)
                            .map((r) =>
                                <WaferFileMetadataCard key={r.filePath} data={r} />
                            )
                    }
                </>
                : <>
                    <Text>{'暂无新数据'}</Text>
                </>}
        </Stack>
    );
}

import { useEffect, useState } from 'react';
import {
    Title, ScrollArea, Stack, Button,
    Group, Tooltip, Divider, Indicator,
    SegmentedControl, Code, Text
} from '@mantine/core';
import { IconDownload, IconLoader } from '@tabler/icons-react';

// import { open } from '@tauri-apps/plugin-dialog';
import Database from '@tauri-apps/plugin-sql';
import { useDispatch } from 'react-redux';

import { AppDispatch } from '@/store';
import { fetchWaferMetadata } from '@/slices/waferMetadataSlice';
import RawWaferSummary from '@/components/RawWaferSummary';
import { useAppSelector } from '@/hooks';
import { ConfigStepperState } from '@/types/Stepper';
import { advanceStepper, setStepper } from '@/slices/preferencesSlice';
import { ExcelMetadata, WaferFileMetadata } from '@/types/Wafer';
import { deleteAllFileIndexes } from '@/db/fileIndex';
import { deleteAllFolderIndexes } from '@/db/folderIndex';
import { processNSyncExcelData, processNSyncWaferData } from '@/utils/waferData';

export default function Preview() {
    const dispatch = useDispatch<AppDispatch>();
    const [mounted, setMounted] = useState<boolean>(false);

    const stepper = useAppSelector((state) => state.preferences.stepper);
    const rawWaferMetadata = useAppSelector((state) => state.waferMetadata.data);

    const [db, setDb] = useState<Database | null>(null);
    const [loading, setLoading] = useState(false);

    const [forceRescan, setForceRescan] = useState(false);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        if (!mounted) {
            setMounted(true);
        }

        // Init DB connection on first load
        const connectDB = async () => {
            const db = await Database.load('sqlite:data.db');
            setDb(db);
        };
        connectDB();
    }, []);

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================
    const load = async () => {
        setLoading(true);
        try {
            // 当选择“强制重扫”时：先清空缓存表，再加载
            if (forceRescan && db) {
                await deleteAllFileIndexes();
                await deleteAllFolderIndexes();
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

    const handleSync = async () => {
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
        if (mounted && stepper >= ConfigStepperState.Metadata) load();
    }, [mounted]);

    return (
        <Stack>
            <Title order={2}>文件数据信息</Title>

            <Group align="center" gap="sm">
                <SegmentedControl
                    value={forceRescan ? 'force' : 'cache'}
                    onChange={(v) => setForceRescan(v === 'force')}
                    data={[
                        { label: '使用缓存', value: 'cache' },
                        { label: '重扫', value: 'force' },
                    ]}
                    disabled={loading}
                />
                <Tooltip
                    label={
                        forceRescan
                            ? '清空已有的缓冲，然后重新扫描并刷新缓存（数据库不变） '
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
                            onClick={load}
                        >
                            加载/刷新
                        </Button>
                    </Indicator>
                </Tooltip>
            </Group>

            <RawWaferSummary />

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
                        leftSection={<IconDownload size={16} />}
                        loading={loading}
                        onClick={handleSync}
                    >
                        同步数据库
                    </Button>
                </Indicator>
            </Tooltip>

            <Divider />

            {rawWaferMetadata.length ?
                <>
                    <Title order={3}>{'新数据'}</Title>
                    <ScrollArea>
                        <Code block fz="xs" style={{ whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(rawWaferMetadata, null, 2)}
                        </Code>
                    </ScrollArea>
                </>
                : <>
                    <Text>{'暂无新数据'}</Text>
                </>}
        </Stack>
    );
}

import { useEffect, useState } from 'react';
import {
    Stack,
    Group,
    Title,
    Button,
    Text,
    Divider,
    Badge,
    ScrollArea,
    Switch,
    Tooltip,
    SimpleGrid,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { exists, stat } from '@tauri-apps/plugin-fs';

import { useAppDispatch, useAppSelector } from '@/hooks';
import { initPreferences, revalidatePreferencesFile, resetPreferencesToDefault, setDataSourceConfigPath, setAutoTriggerState, setDieLayoutXlsPath } from '@/slices/preferencesSlice';
import { resetDataSourceConfigToDefault } from '@/slices/dataSourceConfigSlice';
import { resetFolders } from '@/slices/dataSourceStateSlice';
import { PathPicker, JsonCode } from '@/components';

import { appDataDir, resolve } from '@tauri-apps/api/path';
import { DB_FILENAME } from '@/constants';
import { prepPreferenceWriteOut } from '@/utils/helper';
import { infoToast, errorToast } from '@/components/UI/Toaster';
import { norm } from '@/utils/fs';
import { useNavigate } from 'react-router-dom';
import { AutoTriggers } from '@/types/preferences';
import { IS_DEV } from '@/env';
import { AuthRole } from '@/types/auth';

export default function PreferencesSubpage() {
    const navigate = useNavigate();

    const dispatch = useAppDispatch();
    const preferences = useAppSelector((s) => s.preferences);
    const dataSourceConfig = useAppSelector((s) => s.dataSourceConfig);
    const { preferenceFilePath, dataSourceConfigPath, dieLayoutXlsPath, stepper, error } = preferences;

    // for the dataSourceConfig (json) file
    const [fileExists, setFileExists] = useState<boolean>(false);
    const [layoutExists, setLayoutExists] = useState<boolean>(false);
    const [modifiedTime, setModifiedTime] = useState<string | null>(null);

    const [dbPath, setDbPath] = useState<string | null>(null);

    // AutoTriggers
    const autoTriggers = useAppSelector(s => s.preferences.autoTriggers);
    const role = useAppSelector(s => s.auth.role);
    const folderDetectTrigger = autoTriggers[AutoTriggers.folderDetection];
    const searchTrigger = autoTriggers[AutoTriggers.search];
    const ingestTrigger = autoTriggers[AutoTriggers.ingest];
    const [loading, setLoading] = useState(false);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        const init = async () => {
            const dir = await appDataDir();
            const path = norm(await resolve(dir, DB_FILENAME));
            setDbPath(path);
        }
        init();
    }, []);

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================
    const handlePrefReset = async () => {
        setLoading(true);
        try {
            await dispatch(resetPreferencesToDefault());
            await dispatch(initPreferences());
            infoToast({ title: '初始化完成', message: '已重置通用设置为默认值。' });
        } catch (err) {
            errorToast({ title: '初始化失败', message: String(err) });
        } finally {
            setLoading(false);
        }
    }

    const handleDataSourcePathReset = async () => {
        setLoading(true);
        try {
            // Reset the entire data source config to defaults and clear folder state
            await dispatch(resetDataSourceConfigToDefault());
            await dispatch(resetFolders());
            infoToast({ title: '初始化完成', message: '已重置数据源配置与子目录列表。' });
        } catch (err) {
            errorToast({ title: '初始化失败', message: String(err) });
        } finally {
            setLoading(false);
        }
    };

    // For the auto triggers
    const handleToggleFolderDetect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await dispatch(
            setAutoTriggerState({ target: AutoTriggers.folderDetection, value: event.currentTarget.checked })
        )
    }
    const handleToggleSearchDetect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await dispatch(
            setAutoTriggerState({ target: AutoTriggers.search, value: event.currentTarget.checked })
        )
    }
    const handleToggleIngestDetect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await dispatch(
            setAutoTriggerState({ target: AutoTriggers.ingest, value: event.currentTarget.checked })
        )
    }

    // =========================================================================
    // NOTE: REACT
    // =========================================================================
    useEffect(() => {
        let mounted = true;
        // Check the data source config path every time its value changes
        // NOTE: Updates stepper state
        // NOTE: Optimization available to PREVENT reading the stat of data source config file twice
        async function check() {
            if (!dataSourceConfigPath) {
                setFileExists(false);
                setModifiedTime(null);
                return;
            }
            try {
                const existsFlag = await exists(dataSourceConfigPath);
                if (!mounted) return;
                setFileExists(existsFlag);
                if (existsFlag) {
                    const info = await stat(dataSourceConfigPath);
                    if (!mounted) return;
                    setModifiedTime(info.mtime ? new Date(info.mtime).toLocaleString() : null);
                } else {
                    setModifiedTime(null);
                }
            } catch {
                if (mounted) {
                    setFileExists(false);
                    setModifiedTime(null);
                    return;
                }
            }
            await dispatch(revalidatePreferencesFile());
        }

        check();

        return () => {
            mounted = false;
        };
    }, [dataSourceConfigPath, stepper]);

    useEffect(() => {
        let mounted = true;
        async function checkLayout() {
            if (!dieLayoutXlsPath) {
                setLayoutExists(false);
                return;
            }
            try {
                const ok = await exists(dieLayoutXlsPath);
                if (mounted) setLayoutExists(ok);
            } catch {
                if (mounted) setLayoutExists(false);
            }
        }
        checkLayout();
        return () => { mounted = false; };
    }, [dieLayoutXlsPath]);

    return (
        <Stack gap="lg">
            <Group grow align="flex-start">
                <Stack>
                    <Title order={2}>通用</Title>
                    <PathPicker
                        label=""
                        value={preferenceFilePath || ''}
                        disabled
                        onChange={() => { }}
                        variant="filled"
                        withAsterisk={false}
                        mode="file"
                    />
                    <Group>
                        <Tooltip label="从磁盘读取并加载当前设置" withArrow>
                            <Button variant="light" onClick={() => dispatch(initPreferences())} disabled={loading}>
                                加载
                            </Button>
                        </Tooltip>
                        <Tooltip label="将通用设置恢复为默认值（会覆盖当前设置）" withArrow>
                            <Button variant="light" color="red" onClick={handlePrefReset} disabled={loading}>
                                初始化
                            </Button>
                        </Tooltip>
                    </Group>
                </Stack>

                <Stack>
                    <Title order={2}>数据库</Title>
                    <PathPicker
                        label=""
                        value={dbPath || ''}
                        disabled
                        onChange={() => { }}
                        variant="filled"
                        withAsterisk={false}
                        mode="file"
                    />
                    <Group>
                        <Button variant="light" onClick={() => navigate('/db/data/more')} disabled={loading}>
                            数据库设置
                        </Button>
                    </Group>
                </Stack>
            </Group>

            <Divider />

            <Title order={2}>自动</Title>
            <Group>
                <Switch
                    withThumbIndicator={false}
                    label="子目录识别"
                    size="lg"
                    onLabel="自动"
                    offLabel="手动"
                    checked={folderDetectTrigger}
                    onChange={handleToggleFolderDetect}
                    disabled={!IS_DEV && role !== AuthRole.Admin}
                />
                <Switch
                    withThumbIndicator={false}
                    label="读取元数据"
                    size="lg"
                    onLabel="自动"
                    offLabel="手动"
                    checked={searchTrigger}
                    onChange={handleToggleSearchDetect}
                />
                <Switch
                    withThumbIndicator={false}
                    label="加载与维护数据库"
                    size="lg"
                    onLabel="自动"
                    offLabel="手动"
                    checked={ingestTrigger}
                    onChange={handleToggleIngestDetect}
                />
            </Group>

            <Divider />

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl">
                <Stack gap="xs">
                    <Title order={2}>数据源配置文件</Title>
                    <Stack gap="xs">
                        <PathPicker
                            label="数据源配置文件路径(.json)"
                            value={dataSourceConfigPath || ''}
                            onChange={(e) => dispatch(setDataSourceConfigPath(e))}
                            mode="file"
                        />
                        <Group gap="sm">
                            {loading && <Text c="dimmed">初始化中...</Text>}
                            {error && <Text c="red">错误: {error}</Text>}
                            {fileExists ? (
                                <Badge color="green" leftSection={<IconCheck size={12} />}>存在</Badge>
                            ) : (
                                <Badge color="red" leftSection={<IconX size={12} />}>不存在</Badge>
                            )}
                            {modifiedTime && <Text size="sm">最后修改: {modifiedTime}</Text>}
                        </Group>
                    </Stack>
                    <Group>
                        <Tooltip label="将数据源配置与子目录列表重置为默认值" withArrow>
                            <Button variant="light" color="red" onClick={handleDataSourcePathReset} disabled={loading}>
                                初始化
                            </Button>
                        </Tooltip>
                    </Group>
                </Stack>

                <Stack gap="xs">
                    <Title order={2}>基板布局 Excel</Title>
                    <Stack gap="xs">
                        <PathPicker
                            label="基板布局 Excel 文件"
                            value={dieLayoutXlsPath || ''}
                            onChange={(e) => dispatch(setDieLayoutXlsPath(e))}
                            mode="file"
                        />
                        <Group gap="sm">
                            {layoutExists ? (
                                <Badge color="green" leftSection={<IconCheck size={12} />}>存在</Badge>
                            ) : (
                                <Badge color="red" leftSection={<IconX size={12} />}>不存在</Badge>
                            )}
                        </Group>
                    </Stack>
                </Stack>
            </SimpleGrid>

            <Divider />

            <Title order={2}>配置文件浏览</Title>
            <Title order={3}>通用设置</Title>
            {preferences ? (
                <ScrollArea>
                    <JsonCode value={prepPreferenceWriteOut(preferences)} />
                </ScrollArea>
            ) : (
                <Text>无信息</Text>
            )}
            <Title order={3}>数据源设置</Title>
            {dataSourceConfig ? (
                <ScrollArea>
                    <JsonCode value={dataSourceConfig} />
                </ScrollArea>
            ) : (
                <Text>无信息</Text>
            )}
        </Stack>
    );
}

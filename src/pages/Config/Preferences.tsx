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
    Code,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { exists, stat } from '@tauri-apps/plugin-fs';

import { useAppDispatch, useAppSelector } from '@/hooks';
import { initPreferences, revalidatePreferencesFile, resetPreferencesToDefault, setDataSourceConfigPath } from '@/slices/preferencesSlice';
import { PathPicker } from '@/components';

import { appDataDir, resolve } from '@tauri-apps/api/path';
import { DATA_SOURCE_CONFIG_FILENAME, DB_FILENAME } from '@/constants';
import { prepPreferenceWriteOut } from '@/utils/helper';
import { norm } from '@/utils/fs';

export default function PreferencesSubpage() {
    const dispatch = useAppDispatch();
    const preferences = useAppSelector((s) => s.preferences);
    const dataSourceConfig = useAppSelector((s) => s.dataSourceConfig);
    const { preferenceFilePath, dataSourceConfigPath, stepper, status, error } = preferences;

    // for the dataSourceConfig (json) file
    const [fileExists, setFileExists] = useState<boolean>(false);
    const [modifiedTime, setModifiedTime] = useState<string | null>(null);

    const [dbPath, setDbPath] = useState<string | null>(null);

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
        await dispatch(resetPreferencesToDefault());
        await dispatch(initPreferences());
    }

    const handleDataSourcePathReset = async () => {
        const dir = await appDataDir();
        const defaultPath = await resolve(dir, DATA_SOURCE_CONFIG_FILENAME);
        await dispatch(setDataSourceConfigPath(defaultPath));
    };

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

    return (
        <Stack gap="lg">
            <Title order={2}>通用设置</Title>

            <PathPicker
                label="通用设置文件路径"
                value={preferenceFilePath || ''}
                disabled
                onChange={() => { }}
                variant="filled"
                withAsterisk={false}
                mode="file"
            />

            <Group align="end" wrap="nowrap" w="100%">
                <Button w={'100%'} onClick={() => dispatch(initPreferences())} disabled={status === 'loading'}>
                    加载配置
                </Button>
                <Button w={'100%'} onClick={handlePrefReset} disabled={status === 'loading'}>
                    初始化配置
                </Button>
            </Group>

            <PathPicker
                label="数据库路径"
                value={dbPath || ''}
                disabled
                onChange={() => { }}
                variant="filled"
                withAsterisk={false}
                mode="file"
            />

            <Divider />

            <Title order={2}>数据源配置文件</Title>
            <Stack gap="xs">
                <PathPicker
                    label="数据源配置文件路径(.json)"
                    value={dataSourceConfigPath || ''}
                    onChange={(e) => dispatch(setDataSourceConfigPath(e))}
                    mode="file"
                />
                <Group gap="sm">
                    {status === 'loading' && <Text c="dimmed">初始化中...</Text>}
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
                <Button disabled={status === 'loading'}>
                    迁移
                </Button>
                <Button variant="light" color="red" disabled={status === 'loading'}>
                    导出
                </Button>
                <Button variant="light" color="green" disabled={status === 'loading'}>
                    导入
                </Button>
                <Button variant="outline" color="red" onClick={handleDataSourcePathReset} disabled={status === 'loading'}>
                    初始化
                </Button>
            </Group>

            <Divider />

            <Title order={2}>配置文件浏览</Title>
            <Title order={3}>通用设置</Title>
            {preferences ?
                <ScrollArea>
                    <Code block fz="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {prepPreferenceWriteOut(preferences)}
                    </Code>
                </ScrollArea>
                :
                <Text>无信息</Text>
            }
            <Title order={3}>数据源设置</Title>
            {dataSourceConfig ?
                <ScrollArea>
                    <Code block fz="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(dataSourceConfig, null, 2)}
                    </Code>
                </ScrollArea>
                :
                <Text>无信息</Text>
            }
        </Stack>
    );
}
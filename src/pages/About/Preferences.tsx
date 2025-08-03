import { useEffect, useState } from 'react';
import {
    Stack,
    Group,
    Title,
    Button,
    Text,
    Divider,
    Badge,
    TextInput,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { exists, stat } from '@tauri-apps/plugin-fs';

import { useAppDispatch, useAppSelector } from '@/hooks';
import { setDataSourceConfigPath, initPreferences, revalidatePreferencesFile } from '@/slices/preferencesSlice';
import { PathPicker } from '@/components';

import { appDataDir, resolve } from '@tauri-apps/api/path';
import { DATA_SOURCES_CONFIG_FILENAME } from '@/constants';

export default function PreferencesSubpage() {
    const dispatch = useAppDispatch();
    const dataSourceConfigPath = useAppSelector((state) => state.preferences.dataSourceConfigPath);
    const preferenceFilePath = useAppSelector((state) => state.preferences.preferenceFilePath);
    const status = useAppSelector((state) => state.preferences.status);
    const error = useAppSelector((state) => state.preferences.error);

    const [fileExists, setFileExists] = useState<boolean>(false);
    const [modifiedTime, setModifiedTime] = useState<string | null>(null);

    // Initialize preferences on mount
    useEffect(() => {
        dispatch(revalidatePreferencesFile());
    }, []);

    const handleResetDataSourcePath = async () => {
        const dir = await appDataDir();
        const defaultPath = await resolve(dir, DATA_SOURCES_CONFIG_FILENAME);
        await dispatch(setDataSourceConfigPath(defaultPath));
    };

    useEffect(() => {
        let mounted = true;
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

                    // Init data source config now that the file exists
                    // await dispatch(initDataSourceConfig({ dataSourceConfigPath: dataSourcesConfigPath }));
                    // await dispatch(initDataSourceState());
                } else {
                    setModifiedTime(null);
                }
            } catch {
                if (mounted) {
                    setFileExists(false);
                    setModifiedTime(null);
                }
            }
        }
        check();
        return () => {
            mounted = false;
        };
    }, [dataSourceConfigPath, dispatch]);

    return (
        <Stack gap="lg">
            <Title order={2}>通用设置文件</Title>
            <TextInput
                label="通用设置文件路径 (只读)"
                value={preferenceFilePath || ''}    // NOTE: add || '' to avoid undefined issues
                disabled
                variant="filled"
                withAsterisk={false}
            />
            <Button
                onClick={() => dispatch(initPreferences())}
                disabled={status === 'loading'}
            >
                加载配置
            </Button>

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

            <Button onClick={handleResetDataSourcePath}>
                初始化配置
            </Button>

            <Group>
                <Button>
                    迁移数据源配置文件
                </Button>
                <Button>
                    导出数据源配置文件
                </Button>
            </Group>
        </Stack>
    );
}
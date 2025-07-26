import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { setDataSourcesConfigPath, initPreferences } from '@/slices/preferencesSlice';
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
import SubFolderInput from '@/components/PathPicker';

export default function PreferencesSubpage() {
    const dispatch = useAppDispatch();
    const dataSourcesPath = useAppSelector((state) => state.preferences.dataSourcesConfigPath);
    const preferenceFilePath = useAppSelector((state) => state.preferences.preferenceFilePath);
    const status = useAppSelector((state) => state.preferences.status);
    const error = useAppSelector((state) => state.preferences.error);

    const [fileExists, setFileExists] = useState<boolean>(false);
    const [modifiedTime, setModifiedTime] = useState<string | null>(null);

    // Initialize on mount
    useEffect(() => {
        dispatch(initPreferences());
    }, [dispatch]);

    // Whenever path changes, check existence and mtime
    useEffect(() => {
        let mounted = true;
        async function check() {
            if (!dataSourcesPath) {
                setFileExists(false);
                setModifiedTime(null);
                return;
            }
            try {
                const existsFlag = await exists(dataSourcesPath);
                if (!mounted) return;
                setFileExists(existsFlag);
                if (existsFlag) {
                    const info = await stat(dataSourcesPath);
                    if (!mounted) return;
                    setModifiedTime(info.mtime ? new Date(info.mtime).toLocaleString() : null);
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
    }, [dataSourcesPath]);

    return (
        <Stack gap="lg">
            <Title order={2}>通用设置文件</Title>
            <TextInput
                label="通用设置文件路径 (只读)"
                value={preferenceFilePath}
                disabled
                variant="filled"
                withAsterisk={false}
            />
            <Divider />

            <Title order={2}>数据源配置文件</Title>
            <Stack gap="xs">
                <SubFolderInput
                    label="数据源配置文件路径(.json)"
                    value={dataSourcesPath}
                    onChange={(e) => dispatch(setDataSourcesConfigPath(e))}
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

            <Button
                onClick={() => dispatch(initPreferences())}
                disabled={status === 'loading'}
            >
                重置为默认路径
            </Button>
        </Stack>
    );
}
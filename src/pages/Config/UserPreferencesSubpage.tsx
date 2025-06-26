import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { setConfigFilePath, initConfigFilePath } from '@/slices/userPreferencesSlice';
import {
  Stack,
  Group,
  Title,
  TextInput,
  Button,
  Text,
  Divider,
  Badge,
} from '@mantine/core';
import { IconFolder, IconCheck, IconX } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { exists, stat } from '@tauri-apps/plugin-fs';

export default function UserPreferencesSubpage() {
  const dispatch = useAppDispatch();
  const configFilePath = useAppSelector((state) => state.preferences.configFilePath);
  const status = useAppSelector((state) => state.preferences.status);
  const error = useAppSelector((state) => state.preferences.error);

  const [fileExists, setFileExists] = useState<boolean>(false);
  const [modifiedTime, setModifiedTime] = useState<string | null>(null);

  // Initialize on mount
  useEffect(() => {
    dispatch(initConfigFilePath());
  }, [dispatch]);

  // Whenever path changes, check existence and mtime
  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!configFilePath) {
        setFileExists(false);
        setModifiedTime(null);
        return;
      }
      try {
        const existsFlag = await exists(configFilePath);
        if (!mounted) return;
        setFileExists(existsFlag);
        if (existsFlag) {
          const info = await stat(configFilePath);
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
  }, [configFilePath]);

  // Handler to pick a config file path
  const handlePick = async () => {
    try {
      const result = await open({
        title: '选择配置文件位置',
        multiple: false,
        filters: [
          { name: 'JSON', extensions: ['json'] },
        ],
      });
      if (!result) return;
      const selected = Array.isArray(result) ? result[0] : result;
      dispatch(setConfigFilePath(selected));
    } catch (e) {
      console.error('选择配置文件失败', e);
    }
  };

  return (
    <Stack gap="lg">
      <Title order={2}>用户偏好设置</Title>
      <Divider />

      <Stack gap="xs">
        <TextInput
          label="配置文件路径"
          placeholder="请选择或输入配置文件路径"
          value={configFilePath}
          onChange={(e) => dispatch(setConfigFilePath(e.currentTarget.value))}
          rightSection={
            <Button
              size="xs"
              variant="subtle"
              onClick={handlePick}
              leftSection={<IconFolder size={16} />}
            >
              选择
            </Button>
          }
        />

        <Group gap="sm">
          {status === 'loading' && <Text color="dimmed">初始化中...</Text>}
          {error && <Text color="red">错误: {error}</Text>}
          {fileExists ? (
            <Badge color="green" leftSection={<IconCheck size={12} />}>存在</Badge>
          ) : (
            <Badge color="red" leftSection={<IconX size={12} />}>不存在</Badge>
          )}
          {modifiedTime && <Text size="sm">最后修改: {modifiedTime}</Text>}
        </Group>
      </Stack>

      <Button
        onClick={() => dispatch(initConfigFilePath())}
        disabled={status === 'loading'}
      >
        重置为默认路径
      </Button>
    </Stack>
  );
}
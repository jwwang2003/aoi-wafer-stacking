import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { exists, stat } from '@tauri-apps/plugin-fs';
import * as path from '@tauri-apps/api/path';
import { TextInput, ActionIcon } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';

interface PathPickerProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    mode?: 'file' | 'folder';
}

export default function PathPicker({
    label,
    value,
    onChange,
    mode = 'folder',
}: PathPickerProps) {
    const [error, setError] = useState<string | null>(null);

    const validatePath = async (candidate: string) => {
        try {
            const normalized = await path.normalize(candidate);
            const resolved = await path.resolve(normalized);
            if (!(await exists(resolved))) {
                return [false, '路径无效或不存在'] as const;
            }
            const info = await stat(resolved);
            if (mode === 'folder' && !info.isDirectory) {
                return [false, '路径不是目录'] as const;
            }
            if (mode === 'file' && info.isDirectory) {
                return [false, '请选择文件而不是文件夹'] as const;
            }
            return [true, resolved] as const;
        } catch {
            return [false, '验证路径时出错'] as const;
        }
    };

    const handleSelect = async () => {
        try {
            const selected = await open({
                directory: mode === 'folder',
                multiple: false,
                title: `选择 ${label}`,
            });

            if (typeof selected === 'string') {
                const [ok, result] = await validatePath(selected);
                if (ok) {
                    onChange(result);
                    setError(null);
                } else {
                    setError(result);
                }
            }
        } catch (e: any) {
            setError(`选择失败: ${e.message}`);
        }
    };

    return (
        <TextInput
            label={label}
            placeholder={mode === 'folder' ? '点击选择目录' : '点击选择文件'}
            value={value}
            readOnly
            onClick={handleSelect}
            error={error}
            leftSection={
                <ActionIcon variant="filled" aria-label="Select path" onClick={handleSelect}>
                    <IconFolder size={16} stroke={2} />
                </ActionIcon>
            }
            styles={{ input: { cursor: 'pointer' } }}
        />
    );
}
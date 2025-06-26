import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { exists, stat } from '@tauri-apps/plugin-fs';
import * as path from '@tauri-apps/api/path';
import { TextInput, Button } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';

interface SubFolderInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
}

export default function SubFolderInput({ label, value, onChange }: SubFolderInputProps) {
    const [error, setError] = useState<string | null>(null);

    // Normalize → resolve → exists → stat
    const validateDirectory = async (candidate: string) => {
        try {
            const normalized = await path.normalize(candidate);
            const resolved = await path.resolve(normalized);
            if (!(await exists(resolved))) {
                return [false, '路径无效或不存在'] as const;
            }
            const info = await stat(resolved);
            if (!info.isDirectory) {
                return [false, '路径不是目录'] as const;
            }
            return [true, resolved] as const;
        } catch {
            return [false, '验证目录时出错'] as const;
        }
    };

    // Only way to change the value: open dialog
    const handleSelect = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: `选择 ${label}`,
            });
            if (typeof selected === 'string') {
                const [ok, result] = await validateDirectory(selected);
                if (ok) {
                    onChange(result);
                    setError(null);
                } else {
                    setError(result);
                }
            }
        } catch (e: any) {
            setError(`选择目录失败: ${e.message}`);
        }
    };

    return (
        <TextInput
            label={label}
            placeholder="点击选择目录"
            value={value}
            readOnly // disallow typing
            onClick={handleSelect} // open picker on click anywhere
            error={error}
            leftSection={
                <Button
                    onClick={handleSelect}
                    style={{ width: '100%', height: '100%', padding: 0 }}
                >
                    <IconFolder size={16} strokeWidth={2} />
                </Button>
            }
            styles={{
                input: { cursor: 'pointer' }          // show pointer cursor
            }}
        />
    );
}
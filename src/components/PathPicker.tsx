import { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import * as sysPath from '@tauri-apps/api/path';
import {
    TextInput,
    type TextInputProps,
    ActionIcon,
    Group,
    Tooltip,
    CopyButton,
} from '@mantine/core';
import { IconFolder, IconFolderOpen, IconCopy, IconCheck } from '@tabler/icons-react';
import { norm } from '@/utils/fs';

type Mode = 'file' | 'folder';

interface PathPickerProps
    extends Omit<TextInputProps, 'value' | 'onChange' | 'onClick' | 'leftSection' | 'rightSection'> {
    label: string;
    value: string;
    onChange: (value: string) => void;
    mode?: Mode;
    disabled?: boolean;
}

export default function PathPicker({
    label,
    value,
    onChange,
    mode = 'folder',
    disabled = false,
    error: errorProp,
    ...textInputProps
}: PathPickerProps) {
    const [error, setError] = useState<string | null>(null);
    const [folderPath, setFolderPath] = useState<string>('');

    // keep a folder version of `value` for copy/reveal
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (!value) {
                    if (alive) setFolderPath('');
                    return;
                }
                const folder = mode === 'folder' ? value : await sysPath.dirname(value);
                if (alive) setFolderPath(folder);
            } catch {
                if (alive) setFolderPath('');
            }
        })();
        return () => {
            alive = false;
        };
    }, [value, mode]);

    const validatePath = async (candidate: string) => {
        try {
            const normalized = await sysPath.normalize(candidate);
            const resolved = norm(await sysPath.resolve(normalized));
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
        if (disabled) return;
        try {
            const selected = await openDialog({
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
            setError(`选择失败: ${e?.message ?? String(e)}`);
        }
    };

    const canReveal = Boolean(folderPath);

    return (
        <Group gap="xs" align="end" wrap="nowrap" w="100%">
            <TextInput
                label={label}
                placeholder={mode === 'folder' ? '点击选择目录' : '点击选择文件'}
                value={value}
                readOnly
                onClick={handleSelect}
                disabled={disabled}
                error={error ?? errorProp}
                leftSection={
                    <ActionIcon
                        variant="filled"
                        aria-label="选择路径"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSelect();
                        }}
                        disabled={disabled}
                    >
                        <IconFolder size={16} stroke={2} />
                    </ActionIcon>
                }
                // fill remaining horizontal space
                style={{ flex: 1 }}
                w="100%"
                // keep pointer cursor only when interactive
                styles={{ input: { cursor: disabled ? 'default' : 'pointer' } }}
                {...textInputProps}
            />

            {/* Right controls rendered separately; do not grow */}
            <Group
                gap={6}
                align="center"
                style={{ flex: '0 0 auto', alignSelf: 'stretch', paddingTop: label ? 22 : 0 }}
            >
                <Tooltip label="在文件夹中显示" withArrow>
                    <ActionIcon
                        size="lg"
                        variant="light"
                        color="gray"
                        disabled={!canReveal}
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (!canReveal) return;
                            try {
                                await revealItemInDir(mode === 'file' ? value : folderPath);
                            } catch {
                                try {
                                    await revealItemInDir(folderPath || value);
                                } catch {/* noop */ }
                            }
                        }}
                    >
                        <IconFolderOpen size={16} />
                    </ActionIcon>
                </Tooltip>

                <CopyButton value={folderPath} timeout={1200}>
                    {({ copied, copy }) => (
                        <Tooltip label={copied ? '已复制' : '复制文件夹路径'} withArrow>
                            <ActionIcon
                                size="lg"
                                variant={copied ? 'filled' : 'light'}
                                color={copied ? 'teal' : 'gray'}
                                disabled={!canReveal}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    copy();
                                }}
                            >
                                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </Group>
        </Group>
    );
}

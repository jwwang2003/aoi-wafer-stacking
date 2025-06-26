import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { stat, FileInfo } from '@tauri-apps/plugin-fs';
import {
    Box,
    Group,
    Table,
    Checkbox,
    Button,
    Text,
} from '@mantine/core';
import { IconPlus, IconTrash, IconEdit } from '@tabler/icons-react';

interface Entry {
    path: string;
    info?: FileInfo;
    error: boolean;
}

interface DirectorySelectListProps {
    /** Controlled list of directory paths */
    value: string[];
    /** Called with the new list whenever it changes (e.g. add/remove) */
    onChange: (newPaths: string[]) => void;
}

export default function DirectorySelectList({
    value: paths,
    onChange,
}: DirectorySelectListProps) {
    // Internal list with error flag
    const [entries, setEntries] = useState<Entry[]>([]);
    const [selected, setSelected] = useState<string[]>([]);

    // Whenever `paths` changes, re-stat each and mark errors
    useEffect(() => {
        let mounted = true;

        (async () => {
            const updated: Entry[] = [];

            for (const p of paths) {
                try {
                    const info = await stat(p);
                    updated.push({ path: p, info, error: false });
                } catch {
                    updated.push({ path: p, error: true });
                }
            }

            if (!mounted) return;
            setEntries(updated);
        })();

        return () => {
            mounted = false;
        };
    }, [paths]);

    // Open directory picker, stat each, and append only new, valid ones
    const handleAdd = async () => {
        try {
            const result = await open({
                directory: true,
                multiple: true,
                title: '选择目录',
            });
            if (!result) return;

            const picked = Array.isArray(result) ? result : [result];
            const toAdd: string[] = [];

            for (const p of picked) {
                if (paths.includes(p)) continue; // skip duplicates
                try {
                    await stat(p);
                    toAdd.push(p);
                } catch {
                    // skip invalid
                }
            }

            if (toAdd.length > 0) onChange([...paths, ...toAdd]);
        } catch (e: any) {
            console.error('添加目录失败', e);
        }
    };

    // Remove selected paths
    const handleRemoveSelected = () => {
        onChange(paths.filter((p) => !selected.includes(p)));
        setSelected([]);
    };

    // Modify a single path
    const handleModify = async (oldPath: string) => {
        try {
            const result = await open({
                directory: true,
                multiple: false,
                title: '选择新目录',
            });
            if (!result) return;

            const newPath = Array.isArray(result) ? result[0] : result;
            if (newPath === oldPath) return;
            if (paths.includes(newPath)) {
                console.warn('路径已存在:', newPath);
                return;
            }

            // verify new path
            await stat(newPath);
            onChange(paths.map((p) => (p === oldPath ? newPath : p)));
            setSelected((s) => s.filter((x) => x !== oldPath));
        } catch (e: any) {
            console.error('修改目录失败', e);
        }
    };

    return (
        <Box>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th />
                        <Table.Th>操作</Table.Th>
                        <Table.Th>目录名字</Table.Th>
                        <Table.Th>路径</Table.Th>
                        <Table.Th>修改时间</Table.Th>
                    </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                    {entries.map(({ path, info, error }) => {
                        const name = path.split(/[/\\]/).pop() || path;
                        const checked = selected.includes(path);
                        const bg = error
                            ? 'var(--mantine-color-red-light)'
                            : checked
                                ? 'var(--mantine-color-blue-light)'
                                : undefined;

                        return (
                            <Table.Tr key={path} bg={bg}>
                                <Table.Td>
                                    <Checkbox
                                        size="xs"
                                        disabled={error}
                                        checked={checked}
                                        onChange={(e) => {
                                            const isOn = e.currentTarget.checked;
                                            setSelected((s) =>
                                                isOn ? [...s, path] : s.filter((x) => x !== path)
                                            );
                                        }}
                                    />
                                </Table.Td>

                                <Table.Td style={{ display: 'flex', gap: 4 }}>
                                    <Button
                                        size="xs"
                                        variant="light"
                                        onClick={() => handleModify(path)}
                                    >
                                        <IconEdit size={14} />
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="light"
                                        color="red"
                                        onClick={() => {
                                            onChange(paths.filter((p) => p !== path));
                                            setSelected((s) => s.filter((x) => x !== path));
                                        }}
                                    >
                                        <IconTrash size={14} />
                                    </Button>
                                </Table.Td>

                                <Table.Td>
                                    <Text c={error ? 'red' : undefined}>{name}</Text>
                                </Table.Td>

                                <Table.Td>
                                    <Text size="sm" color={error ? 'red' : undefined}>
                                        {path}
                                    </Text>
                                </Table.Td>

                                <Table.Td>
                                    {error
                                        ? 'Not found'
                                        : info?.mtime
                                            ? new Date(info.mtime).toLocaleString()
                                            : '-'}
                                </Table.Td>                                
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>

            <Group mt="md" justify="flex-start">
                <Button leftSection={<IconPlus size={16} />} onClick={handleAdd}>
                    添加
                </Button>
                <Button
                    leftSection={<IconTrash size={16} />}
                    color="red"
                    disabled={selected.length === 0}
                    onClick={handleRemoveSelected}
                >
                    删除所选
                </Button>
            </Group>
        </Box>
    );
}
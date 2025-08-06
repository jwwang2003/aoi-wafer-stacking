import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
    Box,
    Group,
    Table,
    Checkbox,
    Button,
    Text,
} from '@mantine/core';
import { IconPlus, IconTrash, IconEdit } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { addFolder, removeFolder } from '@/slices/dataSourceStateSlice';
import { DataSourceType, FolderResult } from '@/types/DataSource';
import { addDataSourcePath, removeDataSourcePath } from '@/slices/dataSourceConfigSlice';
import { invoke } from '@tauri-apps/api/core';
import { getRelativePath } from '@/utils/fs';

interface DirectorySelectListProps {
    type: DataSourceType;
}

export default function DirectorySelectList({ type }: DirectorySelectListProps) {
    const dispatch = useAppDispatch();
    const rootPath = useAppSelector((state) => state.dataSourceConfig.rootPath);
    const folders = useAppSelector((state) => state.dataSourceState[type]);             // internal (system abs path)
    const paths = useAppSelector((state) => state.dataSourceConfig.paths[type]);   // config file (relative path)
    const [selected, setSelected] = useState<string[]>([]);

    const handleAdd = async () => {
        try {
            const result = await open({
                directory: true,
                multiple: true,
                title: '选择目录',
            });
            if (!result) return;

            const picked = Array.isArray(result) ? result : [result];
            const responses: FolderResult[] = await invoke('get_file_batch_stat', {
                folders: picked.map(f => ({ path: f })),
            });

            for (const folder of responses) {
                if (folder.exists) {
                    const absPath = folder.path;
                    const relPath = getRelativePath(rootPath, folder.path);
                    if (paths.includes(relPath)) continue;
                    dispatch(addDataSourcePath({ type, path: relPath }));
                    dispatch(addFolder({ type, path: absPath }));
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error('添加目录失败', e);
        }
    };

    const handleRemoveSelected = () => {
        for (const path of selected) {
            dispatch(removeDataSourcePath({ type, path }));
            dispatch(removeFolder({ type, path }));
        }
        setSelected([]);
    };

    const handleModify = async (oldPath: string) => {
        try {
            const result = await open({
                directory: true,
                multiple: false,
                title: '选择新目录',
            });
            if (!result) return;

            const newPath = Array.isArray(result) ? result[0] : result;
            const rel = newPath.startsWith(rootPath)
                ? newPath.slice(rootPath.length).replace(/^[/\\]/, '')
                : newPath;

            if (rel === oldPath) return;
            dispatch(removeFolder({ type, path: oldPath }));
            dispatch(addFolder({ type, path: rel }));
            setSelected((s) => s.filter((x) => x !== oldPath));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    {folders.map(({ path, info, error }) => {
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
                                            dispatch(removeDataSourcePath({ type, path }));
                                            dispatch(removeFolder({ type, path }));
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
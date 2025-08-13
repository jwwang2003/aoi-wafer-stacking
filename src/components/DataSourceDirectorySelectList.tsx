import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Box, Group, Table, Checkbox, Button, Text } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { addFolder, removeFolder } from '@/slices/dataSourceStateSlice';
import { DataSourceType, DirResult } from '@/types/DataSource';
import { addDataSourcePath, removeDataSourcePath } from '@/slices/dataSourceConfigSlice';
import { getRelativePath, norm } from '@/utils/fs';
import { deleteFolderIndexByPath } from '@/db/folderIndex';
import { basename } from '@tauri-apps/api/path';
import { invokeReadFileStatBatch } from '@/api/tauri/fs';

interface DirectorySelectListProps {
    type: DataSourceType;
}

export default function DirectorySelectList({ type }: DirectorySelectListProps) {
    const dispatch = useAppDispatch();
    const rootPath = useAppSelector((state) => state.dataSourceConfig.rootPath);
    const folders = useAppSelector((state) => state.dataSourceState[type]);             // internal (system abs path)
    const paths = useAppSelector((state) => state.dataSourceConfig.paths[type]);        // config file (relative path)
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
            const responses: DirResult[] = await invokeReadFileStatBatch(picked);

            for (const folder of responses) {
                if (folder.exists) {
                    const absPath = folder.path;
                    const relPath = getRelativePath(rootPath, folder.path);
                    if (paths.includes(relPath)) continue;
                    dispatch(addDataSourcePath({ type, path: norm(relPath) }));
                    dispatch(addFolder({ type, path: norm(absPath) }));
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error('添加目录失败', e);
        }
    };

    const deleteAction = async (path: string) => {
        // path is abs. path
        const name = await basename(path);
        await dispatch(removeDataSourcePath({ type, path }));
        await dispatch(removeFolder({ type, path }));
        await deleteFolderIndexByPath(name);
    }

    const handleRemoveSelected = async () => {
        for (const path of selected) {
            await deleteAction(norm(path));
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
            <Table
                highlightOnHover
                striped
                style={{ tableLayout: 'fixed', width: '100%' }}
            >
                {/* Percentage-based widths */}
                <colgroup>
                    <col style={{ width: '5%' }} />   {/* checkbox */}
                    <col style={{ width: '10%' }} />  {/* actions */}
                    <col style={{ width: '20%' }} />  {/* folder name */}
                    <col style={{ width: '45%' }} />  {/* path */}
                    <col style={{ width: '20%' }} />  {/* mtime */}
                </colgroup>

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

                                <Table.Td>
                                    <Group gap={4} wrap="nowrap">
                                        <Button size="xs" variant="light" onClick={() => handleModify(path)}>
                                            <IconEdit size={14} />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="light"
                                            color="red"
                                            onClick={async () => {
                                                await deleteAction(norm(path));
                                                setSelected((s) => s.filter((x) => x !== path));
                                            }}
                                        >
                                            <IconTrash size={14} />
                                        </Button>
                                    </Group>
                                </Table.Td>

                                <Table.Td style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                    <Text c={error ? 'red' : undefined}>{name}</Text>
                                </Table.Td>

                                <Table.Td style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                    <Text size="sm" c={error ? 'red' : undefined}>
                                        {path}
                                    </Text>
                                </Table.Td>

                                <Table.Td>
                                    {error
                                        ? 'Not found'
                                        : info?.mtime
                                            ? new Date(info.mtime).toLocaleString('zh-CN', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit',
                                                hour12: false
                                            })
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
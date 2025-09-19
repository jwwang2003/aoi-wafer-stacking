import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Box, Group, Table, Checkbox, Button, Text, ActionIcon } from '@mantine/core';
import { IconPlus, IconTrash, IconEdit } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { addFolder, removeFolder } from '@/slices/dataSourceStateSlice';
import type { DirResult } from '@/types/ipc';
import type { DataSourceType } from '@/types/dataSource';
import { addDataSourcePath, removeDataSourcePath } from '@/slices/dataSourceConfigSlice';
import { norm } from '@/utils/fs';
import { deleteFolderIndexByPath, upsertOneFolderIndex } from '@/db/folderIndex';
import { basename } from '@tauri-apps/api/path';
import { invokeReadFileStatBatch } from '@/api/tauri/fs';
import { stat } from '@tauri-apps/plugin-fs';
import { IS_DEV } from '@/env';
import { AuthRole } from '@/types/auth';
import { errorToast } from '@/components/Toaster';

interface DirectorySelectListProps {
    type: DataSourceType;
}

export default function DirectorySelectList({ type }: DirectorySelectListProps) {
    const dispatch = useAppDispatch();
    const folders = useAppSelector((state) => state.dataSourceState[type]);             // internal (system abs path)
    const paths = useAppSelector((state) => state.dataSourceConfig.paths[type]);        // config file (absolute path)
    const role = useAppSelector(s => s.auth.role);
    const readOnly = !IS_DEV && role !== AuthRole.Admin;
    const [selected, setSelected] = useState<string[]>([]);

    const handleAdd = async () => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下添加目录需要管理员权限。' });
            return;
        }
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
                    const absPath = norm(folder.path);
                    if (paths.includes(absPath)) continue;
                    await dispatch(addDataSourcePath({ type, path: absPath }));
                    await dispatch(addFolder({ type, path: absPath }));
                }
            }
        } catch (e: unknown) {
            console.error('添加目录失败', e);
        }
    };

    const deleteAction = async (path: string) => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下删除目录需要管理员权限。' });
            return;
        }
        // path is abs. path
        const name = await basename(path);
        await dispatch(removeDataSourcePath({ type, path }));
        await dispatch(removeFolder({ type, path }));
        await deleteFolderIndexByPath(path);
        await deleteFolderIndexByPath(name);
    }

    const handleRemoveSelected = async () => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下删除目录需要管理员权限。' });
            return;
        }
        for (const path of selected) {
            await deleteAction(norm(path));
        }
        setSelected([]);
    };

    const handleModify = async (oldPath: string) => {
        if (readOnly) {
            errorToast({ title: '需要管理员权限', message: '生产环境下修改目录需要管理员权限。' });
            return;
        }
        try {
            const result = await open({
                directory: true,
                multiple: false,
                title: '选择新目录',
            });
            if (!result) return;

            const newPath = Array.isArray(result) ? result[0] : result;
            const abs = norm(newPath);
            if (abs === oldPath) return;
            await dispatch(removeFolder({ type, path: oldPath }));
            const { mtime } = await stat(newPath);
            await upsertOneFolderIndex({ folder_path: abs, last_mtime: Number(mtime) });
            await dispatch(addFolder({ type, path: abs }));
            setSelected((s) => s.filter((x) => x !== oldPath));
        } catch (e: unknown) {
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
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '45%' }} />
                    <col style={{ width: '20%' }} />
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
                                        <ActionIcon
                                            variant="light"
                                            size="sm"             // sm, md, lg… consistent square size
                                            onClick={() => handleModify(path)}
                                            disabled={readOnly}
                                        >
                                            <IconEdit size={16} />
                                        </ActionIcon>

                                        <ActionIcon
                                            variant="light"
                                            color="red"
                                            size="sm"
                                            disabled={readOnly}
                                            onClick={async () => {
                                                await deleteAction(norm(path));
                                                setSelected((s) => s.filter((x) => x !== path));
                                            }}
                                        >
                                            <IconTrash size={16} />
                                        </ActionIcon>
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
                <Button leftSection={<IconPlus size={16} />} onClick={handleAdd} disabled={readOnly}>
                    添加
                </Button>
                <Button
                    leftSection={<IconTrash size={16} />}
                    color="red"
                    disabled={selected.length === 0 || readOnly}
                    onClick={handleRemoveSelected}
                >
                    删除所选
                </Button>
            </Group>
        </Box>
    );
}

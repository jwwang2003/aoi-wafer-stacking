import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    ActionIcon,
    Badge,
    Button,
    Card,
    Checkbox,
    Group,
    Loader,
    Modal,
    NumberInput,
    Pagination,
    Paper,
    ScrollArea,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCopy, IconEdit, IconPlus, IconRefresh, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import type { WaferMapRow } from '@/db/types';
import {
    deleteWaferMapByIdx,
    deleteManyWaferMapsByIdx,
    getDistinctWaferStages,
    insertWaferMap,
    queryWaferMaps,
    upsertWaferMap,
} from '@/db/wafermaps';
import { infoToast, errorToast } from '@/components/UI/Toaster';

type FormState = {
    idx?: number;
    product_id: string;
    batch_id: string;
    wafer_id: number | null;
    stage: string;
    sub_stage: string;
    retest_count: number | null;
    time: number | null;
    file_path: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function parseNumber(value: string | number | null | undefined): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

function formatTime(value: number | null | undefined) {
    if (!value || Number.isNaN(value)) return '—';
    try {
        const date = new Date(Number(value));
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString();
    } catch {
        return String(value);
    }
}

function formatPath(path: string, maxLength = 80) {
    if (!path) return '—';
    if (path.length <= maxLength) return path;
    const suffix = path.slice(-Math.floor(maxLength / 2));
    const prefix = path.slice(0, maxLength - suffix.length - 3);
    return `${prefix}...${suffix}`;
}

export default function WaferMapIndex() {
    const [rows, setRows] = useState<WaferMapRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [stageFilter, setStageFilter] = useState<string | null>(null);
    const [stageOptions, setStageOptions] = useState<string[]>([]);

    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchValue.trim(), 400);

    const [modalOpen, setModalOpen] = useState(false);
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
    const [formState, setFormState] = useState<FormState | null>(null);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [saving, setSaving] = useState(false);
    const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [batchDeleting, setBatchDeleting] = useState(false);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(total / pageSize)),
        [total, pageSize]
    );

    const stageSelectData = useMemo(() => {
        const items = stageOptions.map((stage) => ({ value: stage, label: stage }));
        if (stageFilter && !stageOptions.includes(stageFilter)) {
            items.unshift({ value: stageFilter, label: stageFilter });
        }
        return items;
    }, [stageOptions, stageFilter]);

    const loadStages = useCallback(async () => {
        try {
            const stages = await getDistinctWaferStages();
            setStageOptions(stages);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '加载阶段列表失败', message: msg });
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { rows: fetchedRows, total: newTotal } = await queryWaferMaps({
                page,
                pageSize,
                search: debouncedSearch,
                stage: stageFilter ?? undefined,
            });
            setRows(fetchedRows);
            setTotal(newTotal);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            errorToast({ title: '加载失败', message: msg });
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearch, stageFilter]);

    useEffect(() => {
        void loadStages();
    }, [loadStages]);

    useEffect(() => {
        setPage((prev) => (prev > totalPages ? totalPages : prev));
    }, [totalPages]);

    useEffect(() => {
        setPage((prev) => (prev === 1 ? prev : 1));
    }, [debouncedSearch, stageFilter]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const selectableRows = useMemo(
        () => rows.filter((row): row is WaferMapRow & { idx: number } => row.idx != null),
        [rows]
    );

    useEffect(() => {
        setSelectedIds((prev) => {
            if (!prev.size) return prev;
            const valid = new Set(selectableRows.map((row) => row.idx));
            let changed = false;
            const next = new Set<number>();
            prev.forEach((idx) => {
                if (valid.has(idx)) {
                    next.add(idx);
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [selectableRows]);

    const toggleRow = useCallback((idx: number | null | undefined) => {
        if (idx == null) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    }, []);

    const allSelected = useMemo(
        () => selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.idx)),
        [selectableRows, selectedIds]
    );
    const someSelected = selectedIds.size > 0 && !allSelected;

    const handleSelectAllChange = useCallback(() => {
        setSelectedIds((prev) => {
            if (!selectableRows.length) return prev;
            if (allSelected) {
                if (!prev.size) return prev;
                const next = new Set(prev);
                selectableRows.forEach((row) => next.delete(row.idx));
                return next;
            }
            const next = new Set(prev);
            selectableRows.forEach((row) => next.add(row.idx));
            return next;
        });
    }, [allSelected, selectableRows]);

    const resetForm = () => {
        setFormErrors({});
        setFormState(null);
        setModalOpen(false);
        setSaving(false);
    };

    const openCreateModal = () => {
        setFormMode('create');
        setFormErrors({});
        setFormState({
            product_id: '',
            batch_id: '',
            wafer_id: null,
            stage: '',
            sub_stage: '',
            retest_count: 0,
            time: null,
            file_path: '',
        });
        setModalOpen(true);
    };

    const openEditModal = (row: WaferMapRow) => {
        setFormMode('edit');
        setFormErrors({});
        setFormState({
            idx: row.idx,
            product_id: row.product_id ?? '',
            batch_id: row.batch_id ?? '',
            wafer_id: row.wafer_id ?? null,
            stage: row.stage ?? '',
            sub_stage: row.sub_stage ?? '',
            retest_count: row.retest_count ?? 0,
            time: row.time ?? null,
            file_path: row.file_path ?? '',
        });
        setModalOpen(true);
    };

    const handleNumberChange =
        (field: 'wafer_id' | 'retest_count' | 'time') =>
            (value: string | number) => {
                setFormState((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        [field]: parseNumber(value),
                    };
                });
            };

    const validateForm = (state: FormState): FormErrors => {
        const errors: FormErrors = {};
        const productId = state.product_id.trim();
        const batchId = state.batch_id.trim();
        const stage = state.stage.trim();
        const filePath = state.file_path.trim();

        if (!productId) errors.product_id = '请输入产品 ID';
        if (!batchId) errors.batch_id = '请输入批次 ID';
        if (!stage) errors.stage = '请输入阶段';
        if (!filePath) errors.file_path = '请输入文件路径';

        if (state.wafer_id === null || !Number.isInteger(state.wafer_id)) {
            errors.wafer_id = '请输入整数晶圆号';
        }

        if (state.retest_count !== null && !Number.isInteger(state.retest_count)) {
            errors.retest_count = '请输入整数复测次数';
        }

        if (state.time !== null && !Number.isFinite(state.time)) {
            errors.time = '请输入有效的时间戳或留空';
        }

        return errors;
    };

    const buildPayload = (state: FormState): Omit<WaferMapRow, 'idx'> & { idx?: number } => {
        const payload: WaferMapRow = {
            idx: state.idx,
            product_id: state.product_id.trim(),
            batch_id: state.batch_id.trim(),
            wafer_id: state.wafer_id != null ? Math.trunc(state.wafer_id) : 0,
            stage: state.stage.trim(),
            sub_stage: state.sub_stage.trim() || null,
            retest_count: state.retest_count != null ? Math.trunc(state.retest_count) : 0,
            time: state.time != null ? Math.trunc(state.time) : null,
            file_path: state.file_path.trim(),
        };
        return payload;
    };

    const handleSubmit = async () => {
        if (!formState) return;
        const trimmed: FormState = {
            ...formState,
            product_id: formState.product_id.trim(),
            batch_id: formState.batch_id.trim(),
            stage: formState.stage.trim(),
            sub_stage: formState.sub_stage.trim(),
            file_path: formState.file_path.trim(),
        };

        const errors = validateForm(trimmed);
        if (Object.keys(errors).some((key) => errors[key as keyof FormErrors])) {
            setFormErrors(errors);
            return;
        }

        setFormErrors({});
        setSaving(true);
        try {
            if (formMode === 'create') {
                await insertWaferMap(buildPayload(trimmed));
                infoToast({ title: '新增成功', message: '已添加晶圆图记录。' });
                resetForm();
                await loadData();
                await loadStages();
                setPage(1);
            } else if (trimmed.idx != null) {
                await upsertWaferMap(buildPayload(trimmed) as WaferMapRow);
                infoToast({ title: '更新成功', message: '记录已保存。' });
                resetForm();
                await loadData();
                await loadStages();
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('UNIQUE')) {
                setFormErrors((prev) => ({ ...prev, file_path: '文件路径已存在' }));
            }
            errorToast({ title: '保存失败', message: msg });
            setSaving(false);
        }
    };

    const handleDelete = async (row: WaferMapRow) => {
        if (!row.idx) return;
        setDeletingIdx(row.idx);
        try {
            const deleted = await deleteWaferMapByIdx(row.idx);
            if (deleted > 0) {
                infoToast({
                    title: '已删除',
                    message: `已删除记录 #${row.idx}`,
                });
                await loadData();
                await loadStages();
            } else {
                infoToast({ title: '未删除', message: '记录不存在或已删除。' });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '删除失败', message: msg });
        } finally {
            setDeletingIdx(null);
        }
    };

    const handleCopyPath = useCallback(async (path: string) => {
        if (!path) return;
        try {
            if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(path);
            } else if (typeof document !== 'undefined') {
                const textarea = document.createElement('textarea');
                textarea.value = path;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            } else {
                throw new Error('Clipboard API 不可用');
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '复制失败', message: msg });
        }
    }, []);

    const handleBatchDelete = async () => {
        if (!selectedIds.size) return;
        if (!await window.confirm(`确认删除选中的 ${selectedIds.size} 条记录？该操作不可撤销。`)) {
            return;
        }

        setBatchDeleting(true);
        try {
            const ids = Array.from(selectedIds);
            const deleted = await deleteManyWaferMapsByIdx(ids);
            infoToast({
                title: '批量删除完成',
                message: `已删除 ${deleted} 条记录`,
            });
            setSelectedIds(new Set());
            await loadData();
            await loadStages();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '批量删除失败', message: msg });
        } finally {
            setBatchDeleting(false);
        }
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={4}>WaferMap索引</Title>
                <Group gap="xs">
                    <Tooltip label="刷新">
                        <ActionIcon
                            variant="default"
                            onClick={() => void loadData()}
                            aria-label="刷新"
                        >
                            <IconRefresh size={16} />
                        </ActionIcon>
                    </Tooltip>
                    <Button
                        variant="light"
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => void handleBatchDelete()}
                        disabled={!selectedIds.size}
                        loading={batchDeleting}
                    >
                        批量删除
                    </Button>
                    <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
                        新增记录
                    </Button>
                </Group>
            </Group>

            <Card withBorder radius="md" p="sm">
                <Stack gap="md">
                    <Group gap="sm" align="flex-end" wrap="wrap">
                        <TextInput
                            label="搜索"
                            placeholder="产品 / 批次 / 阶段 / 文件路径关键词..."
                            leftSection={<IconSearch size={16} />}
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.currentTarget.value)}
                            rightSection={
                                searchValue ? (
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        aria-label="清除搜索"
                                        onClick={() => setSearchValue('')}
                                    >
                                        <IconX size={14} />
                                    </ActionIcon>
                                ) : undefined
                            }
                            style={{ flex: 1, minWidth: 220 }}
                        />
                        <Select
                            label="阶段"
                            placeholder="全部"
                            allowDeselect
                            value={stageFilter}
                            onChange={(value) => setStageFilter(value)}
                            data={stageSelectData}
                            searchable
                            style={{ width: 200 }}
                        />
                        <Select
                            label="每页数量"
                            value={String(pageSize)}
                            onChange={(value) => {
                                const next = Number(value) || DEFAULT_PAGE_SIZE;
                                setPageSize(next);
                                setPage(1);
                            }}
                            data={PAGE_SIZE_OPTIONS.map((size) => ({
                                value: String(size),
                                label: `${size} 条`,
                            }))}
                            style={{ width: 140 }}
                        />
                    </Group>

                    <Paper withBorder radius="md" p="sm">
                        <ScrollArea h={480}>
                            <Table striped highlightOnHover stickyHeader stickyHeaderOffset={0}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th style={{ width: 48 }}>
                                            <Checkbox
                                                checked={allSelected}
                                                indeterminate={someSelected}
                                                onChange={() => handleSelectAllChange()}
                                                aria-label="全选"
                                            />
                                        </Table.Th>
                                        <Table.Th style={{ width: 70 }}>索引</Table.Th>
                                        <Table.Th style={{ width: 220 }}>产品 / 批次 / 晶圆</Table.Th>
                                        <Table.Th style={{ width: 160 }}>阶段</Table.Th>
                                        <Table.Th style={{ width: 160 }}>复测 / 时间</Table.Th>
                                        <Table.Th>文件路径</Table.Th>
                                        <Table.Th style={{ width: 80 }}>操作</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {loading ? (
                                        <Table.Tr>
                                            <Table.Td colSpan={7}>
                                                <Group justify="center" py="lg">
                                                    <Loader size="sm" />
                                                    <Text size="sm" c="dimmed">
                                                        加载中…
                                                    </Text>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ) : rows.length ? (
                                        rows.map((row) => {
                                            const isSelected = row.idx != null && selectedIds.has(row.idx);
                                            return (
                                                <Table.Tr
                                                    key={row.idx ?? `${row.product_id}-${row.batch_id}-${row.file_path}`}
                                                    style={{
                                                        backgroundColor: isSelected ? 'rgba(255, 72, 66, 0.3)' : undefined,
                                                    }}
                                                >
                                                    <Table.Td width={48}>
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onChange={() => toggleRow(row.idx)}
                                                            aria-label={`选择 ${row.idx ?? row.file_path}`}
                                                            disabled={row.idx == null}
                                                        />
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm" fw={600}>
                                                            {row.idx ?? '—'}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={4} justify="center">
                                                            <Text size="sm" fw={500}>{row.product_id}</Text>
                                                            <Text size="xs" c="dimmed">
                                                                批次：{row.batch_id} · 晶圆：{row.wafer_id}
                                                            </Text>
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={4}>
                                                            <Badge variant="light" color="blue" radius="sm">
                                                                {row.stage}
                                                            </Badge>
                                                            <Text size="xs" c="dimmed">
                                                                {row.sub_stage || '—'}
                                                            </Text>
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={4}>
                                                            <Text size="sm">复测：{row.retest_count ?? 0}</Text>
                                                            <Text size="xs" c="dimmed">
                                                                {formatTime(row.time)}
                                                            </Text>
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group gap={4} justify="space-between" wrap="nowrap">
                                                            <Box style={{ flex: 1, minWidth: 0 }}>
                                                                <Tooltip label={row.file_path} withinPortal>
                                                                    <Text size="sm" style={{ wordBreak: 'break-all' }}>
                                                                        {formatPath(row.file_path)}
                                                                    </Text>
                                                                </Tooltip>
                                                            </Box>
                                                            <ActionIcon
                                                                variant="subtle"
                                                                color="gray"
                                                                aria-label="复制路径"
                                                                onClick={() => void handleCopyPath(row.file_path)}
                                                            >
                                                                <IconCopy size={16} />
                                                            </ActionIcon>
                                                        </Group>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group gap={4} justify="flex-end">
                                                            <ActionIcon
                                                                variant="subtle"
                                                                color="blue"
                                                                aria-label="编辑"
                                                                onClick={() => openEditModal(row)}
                                                            >
                                                                <IconEdit size={16} />
                                                            </ActionIcon>
                                                            <ActionIcon
                                                                variant="subtle"
                                                                color="red"
                                                                aria-label="删除"
                                                                onClick={() => void handleDelete(row)}
                                                                disabled={deletingIdx === row.idx}
                                                            >
                                                                {deletingIdx === row.idx ? <Loader size="xs" /> : <IconTrash size={16} />}
                                                            </ActionIcon>
                                                        </Group>
                                                    </Table.Td>
                                                </Table.Tr>
                                            );
                                        })
                                    ) : (
                                        <Table.Tr>
                                            <Table.Td colSpan={7}>
                                                <Stack align="center" py="xl">
                                                    <Text size="sm" c="dimmed">
                                                        {error ? `加载失败：${error}` : '暂无数据'}
                                                    </Text>
                                                </Stack>
                                            </Table.Td>
                                        </Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Paper>

                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">
                            共 {total} 条记录
                        </Text>
                        <Pagination
                            value={page}
                            onChange={setPage}
                            total={totalPages}
                            disabled={loading || totalPages <= 1}
                        />
                    </Group>
                </Stack>
            </Card>

            <Modal
                opened={modalOpen}
                onClose={() => {
                    if (!saving) resetForm();
                }}
                title={formMode === 'create' ? '新增晶圆图记录' : '编辑晶圆图记录'}
                centered
                size="lg"
                closeOnClickOutside={!saving}
                closeOnEscape={!saving}
                withCloseButton={!saving}
            >
                <Stack gap="md">
                    <Group grow>
                        <TextInput
                            label="产品 ID"
                            value={formState?.product_id ?? ''}
                            onChange={(event) =>
                                setFormState((prev) => (prev ? { ...prev, product_id: event.currentTarget.value } : prev))
                            }
                            error={formErrors.product_id}
                            required
                        />
                        <TextInput
                            label="批次 ID"
                            value={formState?.batch_id ?? ''}
                            onChange={(event) =>
                                setFormState((prev) => (prev ? { ...prev, batch_id: event.currentTarget.value } : prev))
                            }
                            error={formErrors.batch_id}
                            required
                        />
                    </Group>
                    <Group grow>
                        <NumberInput
                            label="晶圆号"
                            value={formState?.wafer_id ?? ''}
                            onChange={handleNumberChange('wafer_id')}
                            error={formErrors.wafer_id}
                            required
                            clampBehavior="strict"
                            step={1}
                        />
                        <NumberInput
                            label="复测次数"
                            value={formState?.retest_count ?? 0}
                            onChange={handleNumberChange('retest_count')}
                            error={formErrors.retest_count}
                            step={1}
                            clampBehavior="strict"
                            min={0}
                        />
                    </Group>
                    <Group grow>
                        <TextInput
                            label="阶段"
                            value={formState?.stage ?? ''}
                            onChange={(event) =>
                                setFormState((prev) => (prev ? { ...prev, stage: event.currentTarget.value } : prev))
                            }
                            error={formErrors.stage}
                            required
                        />
                        <TextInput
                            label="子阶段（可选）"
                            value={formState?.sub_stage ?? ''}
                            onChange={(event) =>
                                setFormState((prev) => (prev ? { ...prev, sub_stage: event.currentTarget.value } : prev))
                            }
                            error={formErrors.sub_stage}
                        />
                    </Group>
                    <NumberInput
                        label="时间戳（毫秒，可选）"
                        value={formState?.time ?? ''}
                        onChange={handleNumberChange('time')}
                        error={formErrors.time}
                    />
                    <TextInput
                        label="文件路径"
                        value={formState?.file_path ?? ''}
                        onChange={(event) =>
                            setFormState((prev) => (prev ? { ...prev, file_path: event.currentTarget.value } : prev))
                        }
                        error={formErrors.file_path}
                        required
                    />

                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={resetForm} disabled={saving}>
                            取消
                        </Button>
                        <Button onClick={() => void handleSubmit()} loading={saving}>
                            保存
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

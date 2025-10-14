import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Checkbox,
    Group,
    Loader,
    Modal,
    NumberInput,
    Paper,
    ScrollArea,
    SimpleGrid,
    Progress,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconDownload, IconEdit, IconPlus, IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { getAllOemOffsets, upsertOemOffset, deleteOemOffset, deleteManyOemOffsets, getOemOffset } from '@/db/offsets';
import { getAllProductSizes, upsertProductSize, deleteProductSize, deleteManyProductSizes, getProductSize } from '@/db/productSize';
import { infoToast, errorToast } from '@/components/UI/Toaster';

type CombinedRow = {
    oem_product_id: string;
    die_x: number | null;
    die_y: number | null;
    x_offset: number | null;
    y_offset: number | null;
    hasOffset: boolean;
    hasSize: boolean;
};

type FormState = {
    oem_product_id: string;
    die_x: number | null;
    die_y: number | null;
    x_offset: number | null;
    y_offset: number | null;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const CSV_HEADERS = ['oem_product_id', 'die_x', 'die_y', 'x_offset', 'y_offset'] as const;
const MAX_FETCH = 10_000;
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });
const signedNumberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6, signDisplay: 'exceptZero' });
type CancelToken = { cancelled: boolean };

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '—';
    return numberFormatter.format(value);
}

function formatSignedNumber(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '—';
    return signedNumberFormatter.format(value);
}

function formatPercent(value: number | null) {
    if (value === null || Number.isNaN(value)) return '—';
    return `${(value * 100).toFixed(1)}%`;
}

type ChartDatum = { label: string; value: number; magnitude: number };

function buildChartData(
    rows: CombinedRow[],
    field: 'x_offset' | 'y_offset' | 'die_x' | 'die_y',
    limit = 6,
    useAbsolute = false
): ChartDatum[] {
    return rows
        .map((row) => {
            const rawValue = row[field];
            if (rawValue === null || !Number.isFinite(rawValue)) return null;
            const magnitude = Math.abs(rawValue);
            const value = useAbsolute ? rawValue : rawValue;
            return { label: row.oem_product_id, value, magnitude };
        })
        .filter((val): val is ChartDatum => Boolean(val))
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, limit);
}

interface ChartCardProps {
    title: string;
    data: ChartDatum[];
    color: string;
    emptyMessage: string;
    formatter?: (value: number) => string;
}

function ChartCard({ title, data, color, emptyMessage, formatter }: ChartCardProps) {
    const max = data.reduce((acc, item) => (item.magnitude > acc ? item.magnitude : acc), 0);
    const formatValue = formatter ?? ((value: number) => numberFormatter.format(value));

    return (
        <Paper withBorder radius="md" p="sm">
            <Stack gap="xs">
                <Text size="sm" fw={600}>
                    {title}
                </Text>
                {data.length ? (
                    data.map((item) => {
                        const percent = max > 0 ? Math.min(100, (item.magnitude / max) * 100) : 0;
                        return (
                            <Stack key={`${title}-${item.label}`} gap={4}>
                                <Group justify="space-between" align="center">
                                    <Text size="xs" fw={500} lineClamp={1}>
                                        {item.label}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {formatValue(item.value)}
                                    </Text>
                                </Group>
                                <Progress value={percent} color={color} radius="sm" />
                            </Stack>
                        );
                    })
                ) : (
                    <Text size="xs" c="dimmed">
                        {emptyMessage}
                    </Text>
                )}
            </Stack>
        </Paper>
    );
}

function toCsvValue(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '';
    return String(value);
}

function escapeCsvField(value: string) {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

async function fetchOffsetsAndSizes(): Promise<CombinedRow[]> {
    const [offsetRows, sizeRows] = await Promise.all([
        getAllOemOffsets(MAX_FETCH, 0),
        getAllProductSizes(MAX_FETCH, 0),
    ]);

    const map = new Map<string, CombinedRow>();

    offsetRows.forEach(({ oem_product_id, x_offset, y_offset }) => {
        map.set(oem_product_id, {
            oem_product_id,
            x_offset,
            y_offset,
            die_x: null,
            die_y: null,
            hasOffset: true,
            hasSize: false,
        });
    });

    sizeRows.forEach(({ oem_product_id, die_x, die_y }) => {
        const existing = map.get(oem_product_id);
        if (existing) {
            existing.die_x = die_x;
            existing.die_y = die_y;
            existing.hasSize = true;
        } else {
            map.set(oem_product_id, {
                oem_product_id,
                x_offset: null,
                y_offset: null,
                die_x,
                die_y,
                hasOffset: false,
                hasSize: true,
            });
        }
    });

    return Array.from(map.values()).sort((a, b) => a.oem_product_id.localeCompare(b.oem_product_id, 'zh-CN'));
}

function buildCsv(rows: CombinedRow[]) {
    const header = CSV_HEADERS.join(',');
    const lines = rows.map((row) => [
        escapeCsvField(row.oem_product_id),
        toCsvValue(row.x_offset),
        toCsvValue(row.y_offset),
        toCsvValue(row.die_x),
        toCsvValue(row.die_y),
    ].join(','));
    return [header, ...lines].join('\n');
}

function parseNumberStrict(value: string | undefined) {
    if (value === undefined) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
}

function parseCsvContent(raw: string): { rows: FormState[]; errors: string[]; total: number } {
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (!lines.length) {
        return { rows: [], errors: [], total: 0 };
    }

    const firstLine = lines[0].replace(/^\uFEFF/, '');
    const maybeHeader = firstLine.split(',').map((segment) => segment.trim().toLowerCase());
    const hasHeader = maybeHeader[0] === CSV_HEADERS[0];
    const dataStart = hasHeader ? 1 : 0;

    const rows: FormState[] = [];
    const errors: string[] = [];

    for (let i = dataStart; i < lines.length; i += 1) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const parts = rawLine.split(',');
        const [idRaw, dxRaw, dyRaw, xRaw, yRaw] = parts;
        const lineNumber = i + 1;

        const oem = (idRaw ?? '').trim();
        if (!oem) {
            errors.push(`第 ${lineNumber} 行缺少 oem_product_id`);
            continue;
        }

        const dx = parseNumberStrict(dxRaw);
        const dy = parseNumberStrict(dyRaw);
        const x = parseNumberStrict(xRaw);
        const y = parseNumberStrict(yRaw);

        if (x === null || y === null || dx === null || dy === null) {
            errors.push(`第 ${lineNumber} 行包含无效数字`);
            continue;
        }

        rows.push({
            oem_product_id: oem,
            die_x: dx,
            die_y: dy,
            x_offset: x,
            y_offset: y,
        });
    }

    const total = Math.max(0, lines.length - dataStart);
    return { rows, errors, total };
}

// =============================================================================
// MAIN
// =============================================================================

export default function OffsetsAndSizes() {
    const [rows, setRows] = useState<CombinedRow[]>([]);
    
    const [loading, setLoading] = useState(true);
    
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    
    const [searchInput, setSearchInput] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<CombinedRow | null>(null);
    const [searchMessage, setSearchMessage] = useState<string | null>('输入 OEM 产品 ID 后按回车或点击搜索。');
    const [searchError, setSearchError] = useState<string | null>(null);
    
    const [modalOpen, setModalOpen] = useState(false);
    const [formState, setFormState] = useState<FormState | null>(null);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
    const [saving, setSaving] = useState(false);
    
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    const [selectAll, setSelectAll] = useState(false);
    
    const [batchDeleting, setBatchDeleting] = useState(false);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================

    const loadRows = useCallback(async (token?: CancelToken) => {
        const cancel = token ?? { cancelled: false };
        setLoading(true);
        try {
            const data = await fetchOffsetsAndSizes();
            if (cancel.cancelled) return;
            setRows(data);
        } catch (e) {
            if (!cancel.cancelled) {
                const msg = e instanceof Error ? e.message : String(e);
                errorToast({ title: '加载失败', message: `无法读取偏移/晶粒尺寸：${msg}` });
            }
        } finally {
            if (!cancel.cancelled) setLoading(false);
        }
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectAll((prev) => {
            const next = !prev;
            if (next) {
                setSelectedIds(new Set(rows.map((row) => row.oem_product_id)));
            } else {
                setSelectedIds(new Set());
            }
            return next;
        });
    }, [rows]);

    const toggleRow = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const stats = useMemo(() => {
        if (!rows.length) {
            return {
                total: 0,
                offsetCount: 0,
                sizeCount: 0,
                avgOffsetX: null,
                avgOffsetY: null,
                avgDieX: null,
                avgDieY: null,
                maxAbsOffset: null,
                offsetCoverage: null,
                sizeCoverage: null,
            };
        }

        let offsetXSum = 0;
        let offsetXCount = 0;
        let offsetYSum = 0;
        let offsetYCount = 0;
        let dieXSum = 0;
        let dieXCount = 0;
        let dieYSum = 0;
        let dieYCount = 0;
        let maxAbsOffset: number | null = null;

        rows.forEach((row) => {
            if (row.x_offset !== null && Number.isFinite(row.x_offset)) {
                offsetXSum += row.x_offset;
                offsetXCount += 1;
                maxAbsOffset = maxAbsOffset === null ? Math.abs(row.x_offset) : Math.max(maxAbsOffset, Math.abs(row.x_offset));
            }
            if (row.y_offset !== null && Number.isFinite(row.y_offset)) {
                offsetYSum += row.y_offset;
                offsetYCount += 1;
                maxAbsOffset = maxAbsOffset === null ? Math.abs(row.y_offset) : Math.max(maxAbsOffset, Math.abs(row.y_offset));
            }
            if (row.die_x !== null && Number.isFinite(row.die_x)) {
                dieXSum += row.die_x;
                dieXCount += 1;
            }
            if (row.die_y !== null && Number.isFinite(row.die_y)) {
                dieYSum += row.die_y;
                dieYCount += 1;
            }
        });

        const sizeCount = rows.filter((row) => row.hasSize).length;
        const offsetCount = rows.filter((row) => row.hasOffset).length;

        return {
            total: rows.length,
            sizeCount,
            offsetCount,
            avgDieX: dieXCount ? dieXSum / dieXCount : null,
            avgDieY: dieYCount ? dieYSum / dieYCount : null,
            avgOffsetX: offsetXCount ? offsetXSum / offsetXCount : null,
            avgOffsetY: offsetYCount ? offsetYSum / offsetYCount : null,
            maxAbsOffset,
            sizeCoverage: rows.length ? sizeCount / rows.length : null,
            offsetCoverage: rows.length ? offsetCount / rows.length : null,
        };
    }, [rows]);

    const chartData = useMemo(() => ({
        topDieX: buildChartData(rows, 'die_x', 6),
        topDieY: buildChartData(rows, 'die_y', 6),
        topOffsetX: buildChartData(rows, 'x_offset', 6, true),
        topOffsetY: buildChartData(rows, 'y_offset', 6, true),
    }), [rows]);

    const handleSearch = useCallback(async () => {
        const trimmed = searchInput.trim();
        if (!trimmed) {
            setSearchResult(null);
            setSearchError(null);
            setSearchMessage('请输入 OEM 产品 ID 后再搜索。');
            return;
        }

        if (trimmed !== searchInput) {
            setSearchInput(trimmed);
        }

        setSearching(true);
        setSearchError(null);
        setSearchMessage(null);

        try {
            const [offsetRow, sizeRow] = await Promise.all([
                getOemOffset(trimmed),
                getProductSize(trimmed),
            ]);

            if (!offsetRow && !sizeRow) {
                setSearchResult(null);
                setSearchMessage(`未找到 ${trimmed} 的记录。`);
                return;
            }

            setSearchResult({
                oem_product_id: trimmed,
                die_x: sizeRow?.die_x ?? null,
                die_y: sizeRow?.die_y ?? null,
                x_offset: offsetRow?.x_offset ?? null,
                y_offset: offsetRow?.y_offset ?? null,
                hasOffset: Boolean(offsetRow),
                hasSize: Boolean(sizeRow),
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setSearchResult(null);
            setSearchError(`搜索失败：${msg}`);
        } finally {
            setSearching(false);
        }
    }, [searchInput]);

    const resetForm = () => {
        setFormErrors({});
        setFormState(null);
        setModalOpen(false);
        setSaving(false);
    };

    const openCreateModal = () => {
        setEditMode('create');
        setFormErrors({});
        setFormState({
            oem_product_id: '',
            die_x: 0,
            die_y: 0,
            x_offset: 0,
            y_offset: 0,
        });
        setModalOpen(true);
    };

    const openEditModal = (row: CombinedRow) => {
        setEditMode('edit');
        setFormErrors({});
        setFormState({
            oem_product_id: row.oem_product_id,
            die_x: row.die_x ?? 0,
            die_y: row.die_y ?? 0,
            x_offset: row.x_offset ?? 0,
            y_offset: row.y_offset ?? 0,
        });
        setModalOpen(true);
    };

    const handleNumberChange = (field: keyof Omit<FormState, 'oem_product_id'>) => (value: string | number) => {
        setFormState((prev) => {
            if (!prev) return prev;
            const parsed = typeof value === 'number' ? value : parseNumberStrict(value ?? '');
            return {
                ...prev,
                [field]: parsed,
            };
        });
    };

    const handleSubmit = async () => {
        if (!formState) return;
        const trimmedId = formState.oem_product_id.trim();
        const errors: FormErrors = {};

        if (!trimmedId) {
            errors.oem_product_id = '请输入 OEM 产品 ID';
        }

        (['die_x', 'die_y', 'x_offset', 'y_offset'] as const).forEach((key) => {
            const value = formState[key];
            if (value === null || !Number.isFinite(value)) {
                errors[key] = '请输入有效数字';
            }
        });

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setSaving(true);
        try {
            await upsertProductSize({
                oem_product_id: trimmedId,
                die_x: formState.die_x ?? 0,
                die_y: formState.die_y ?? 0,
            });
            await upsertOemOffset({
                oem_product_id: trimmedId,
                x_offset: formState.x_offset ?? 0,
                y_offset: formState.y_offset ?? 0,
            });

            infoToast({
                title: '已保存',
                message: `产品 ${trimmedId} 的偏移与晶粒尺寸已更新`,
            });

            resetForm();
            await loadRows();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '保存失败', message: `写入数据库失败：${msg}` });
            setSaving(false);
        }
    };

    const handleDelete = async (row: CombinedRow) => {
        if (!await window.confirm(`确认删除 ${row.oem_product_id} 的偏移与晶粒尺寸记录？该操作不可撤销。`)) {
            return;
        }
        setDeletingId(row.oem_product_id);
        try {
            await Promise.allSettled([
                row.hasSize ? deleteProductSize(row.oem_product_id) : Promise.resolve(null),
                row.hasOffset ? deleteOemOffset(row.oem_product_id) : Promise.resolve(null),
            ]);
            infoToast({
                title: '已删除',
                message: `产品 ${row.oem_product_id} 的偏移与晶粒尺寸已移除`,
            });
            await loadRows();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '删除失败', message: `操作未完成：${msg}` });
        } finally {
            setDeletingId(null);
        }
    };

    const handleBatchDelete = async () => {
        if (!selectedIds.size) return;
        if (!await window.confirm(`确认删除选中的 ${selectedIds.size} 条记录？该操作不可撤销。`)) {
            return;
        }
        setBatchDeleting(true);
        try {
            const ids = Array.from(selectedIds);
            await Promise.all([
                deleteManyProductSizes(ids),
                deleteManyOemOffsets(ids),
            ]);
            infoToast({
                title: '批量删除完成',
                message: `已删除 ${ids.length} 条记录`,
            });
            setSelectedIds(new Set());
            setSelectAll(false);
            await loadRows();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '批量删除失败', message: msg });
        } finally {
            setBatchDeleting(false);
        }
    };

    const handleExport = async () => {
        if (!rows.length) {
            infoToast({ title: '无数据', message: '当前没有可导出的记录' });
            return;
        }
        setExporting(true);
        try {
            const target = await saveDialog({
                title: '导出偏移与晶粒尺寸',
                defaultPath: './offsets_and_sizes.csv',
                filters: [{ name: 'CSV', extensions: ['csv'] }],
            });
            if (!target) return;

            const csv = buildCsv(rows);
            await writeTextFile(target, csv);
            infoToast({
                title: '导出完成',
                message: `已保存到：${target}`,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '导出失败', message: `写入文件失败：${msg}` });
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async () => {
        try {
            const selection = await openDialog({
                title: '选择 CSV 文件',
                multiple: false,
                filters: [{ name: 'CSV', extensions: ['csv'] }],
            });

            if (!selection) return;
            const filePath = Array.isArray(selection) ? selection[0] : selection;
            if (!filePath) return;

            setImporting(true);
            const raw = await readTextFile(filePath);
            const { rows: parsedRows, errors, total } = parseCsvContent(raw);

            if (!parsedRows.length) {
                errorToast({
                    title: '导入失败',
                    message: errors.length ? errors.slice(0, 3).join('\n') : '文件中没有有效记录',
                });
                return;
            }

            for (const record of parsedRows) {
                await upsertProductSize({
                    oem_product_id: record.oem_product_id.trim(),
                    die_x: record.die_x ?? 0,
                    die_y: record.die_y ?? 0,
                });
                await upsertOemOffset({
                    oem_product_id: record.oem_product_id.trim(),
                    x_offset: record.x_offset ?? 0,
                    y_offset: record.y_offset ?? 0,
                });
            }

            infoToast({
                title: '导入完成',
                message: errors.length
                    ? '部分记录已导入，部分行包含错误已跳过'
                    : '全部记录已成功导入',
                lines: [
                    { label: '有效记录', value: parsedRows.length },
                    { label: '跳过', value: errors.length, color: errors.length ? '#e8590c' : undefined },
                    { label: '总行数', value: total },
                ],
            });

            if (errors.length) {
                console.warn('[OffsetsAndSizes] 跳过的行：', errors);
            }

            await loadRows();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorToast({ title: '导入失败', message: msg });
        } finally {
            setImporting(false);
        }
    };

    // =========================================================================
    // NOTE: REACT
    // =========================================================================

    useEffect(() => {
        const cancelToken: CancelToken = { cancelled: false };
        void loadRows(cancelToken);
        return () => {
            cancelToken.cancelled = true;
        };
    }, [loadRows]);

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Group gap="sm" align="center">
                    <Badge color="gray" variant="light">
                        共 {rows.length} 条
                    </Badge>
                    {loading && (
                        <Group gap={4}>
                            <Loader size="xs" />
                            <Text size="xs" c="dimmed">加载中…</Text>
                        </Group>
                    )}
                </Group>
                <Group gap="sm">
                    <Button
                        variant="light"
                        color="gray"
                        leftSection={<IconRefresh size={16} />}
                        onClick={() => loadRows()}
                        disabled={loading}
                    >
                        刷新
                    </Button>
                    <Button
                        variant="light"
                        leftSection={<IconDownload size={16} />}
                        onClick={handleExport}
                        loading={exporting}
                    >
                        导出
                    </Button>
                    <Button
                        variant="light"
                        leftSection={<IconUpload size={16} />}
                        onClick={handleImport}
                        loading={importing}
                    >
                        批量导入
                    </Button>
                    <Button
                        leftSection={<IconPlus size={16} />}
                        onClick={openCreateModal}
                    >
                        新增记录
                    </Button>
                </Group>
            </Group>

            <Paper withBorder radius="md" p="md">
                <Stack gap={4}>
                    <Text size="xs" c="dimmed">
                        支持 CSV 列：
                        <Text component="span" c="gray.7" fw={600}>
                            oem_product_id, die_x, die_y, x_offset, y_offset
                        </Text>
                    </Text>
                    <Text size="xs" c="dimmed">
                        · 需要表头行，可选顺序：oem_product_id,die_x,die_y,x_offset,y_offset
                    </Text>
                    <Text size="xs" c="dimmed">
                        · 偏移与尺寸值使用毫米(mm)，小数采用点号，如：12.3456
                    </Text>
                    <Text size="xs" c="dimmed">
                        · 导入行缺失或包含无效数字会被跳过；导出时将空值写为空单元格
                    </Text>
                </Stack>
            </Paper>

            <Paper withBorder radius="md" p="md">
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={4}>统计概览</Title>
                        <Text size="xs" c="dimmed">
                            汇总当前数据库中的偏移与晶粒尺寸数据
                        </Text>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                        <Paper withBorder radius="md" p="sm">
                            <Stack gap={4}>
                                <Text size="xs" c="dimmed">
                                    记录总数
                                </Text>
                                <Text size="lg" fw={700}>
                                    {stats.total}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    含晶粒尺寸：{stats.sizeCount} ({formatPercent(stats.sizeCoverage)})
                                </Text>
                                <Text size="xs" c="dimmed">
                                    含偏移：{stats.offsetCount} ({formatPercent(stats.offsetCoverage)})
                                </Text>
                            </Stack>
                        </Paper>
                        <Paper withBorder radius="md" p="sm">
                            <Stack gap={4}>
                                <Text size="xs" c="dimmed">
                                    平均晶粒尺寸 (mm)
                                </Text>
                                <Group gap="lg">
                                    <Stack gap={2}>
                                        <Text size="xs" c="dimmed">Die X</Text>
                                        <Text size="sm" fw={600} color="blue.6">{formatNumber(stats.avgDieX)}</Text>
                                    </Stack>
                                    <Stack gap={2}>
                                        <Text size="xs" c="dimmed">Die Y</Text>
                                        <Text size="sm" fw={600} color="blue.6">{formatNumber(stats.avgDieY)}</Text>
                                    </Stack>
                                </Group>
                            </Stack>
                        </Paper>
                        <Paper withBorder radius="md" p="sm">
                            <Stack gap={4}>
                                <Text size="xs" c="dimmed">
                                    平均偏移 (mm)
                                </Text>
                                <Group gap="lg">
                                    <Stack gap={2}>
                                        <Text size="xs" c="dimmed">X</Text>
                                        <Text size="sm" fw={600} color="teal.6">{formatSignedNumber(stats.avgOffsetX)}</Text>
                                    </Stack>
                                    <Stack gap={2}>
                                        <Text size="xs" c="dimmed">Y</Text>
                                        <Text size="sm" fw={600} color="teal.6">{formatSignedNumber(stats.avgOffsetY)}</Text>
                                    </Stack>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    最大绝对偏移：{stats.maxAbsOffset !== null ? formatNumber(stats.maxAbsOffset) : '—'}
                                </Text>
                            </Stack>
                        </Paper>
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        <ChartCard
                            title="Die X 排名"
                            data={chartData.topDieX}
                            color="blue"
                            emptyMessage="暂无晶粒尺寸数据"
                        />
                        <ChartCard
                            title="Die Y 排名"
                            data={chartData.topDieY}
                            color="violet"
                            emptyMessage="暂无晶粒尺寸数据"
                        />
                        <ChartCard
                            title="X 偏移绝对值 Top"
                            data={chartData.topOffsetX}
                            color="teal"
                            emptyMessage="暂无偏移数据"
                            formatter={(value) => formatSignedNumber(value)}
                        />
                        <ChartCard
                            title="Y 偏移绝对值 Top"
                            data={chartData.topOffsetY}
                            color="cyan"
                            emptyMessage="暂无偏移数据"
                            formatter={(value) => formatSignedNumber(value)}
                        />
                    </SimpleGrid>
                </Stack>
            </Paper>
            
            {/* NOTE: QUERY */}
            <Card withBorder radius="md" p="md" shadow="xs">
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={4}>当前选择 / 搜索</Title>
                        {searching && <Loader size="sm" />}
                    </Group>
                    <Group gap="sm" align="flex-end" wrap="nowrap">
                        <TextInput
                            placeholder="输入 OEM 产品 ID…"
                            value={searchInput}
                            onChange={(event) => {
                                setSearchInput(event.currentTarget.value);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleSearch();
                                }
                            }}
                            style={{ flex: 1 }}
                            w={{ base: '100%', sm: 320 }}
                        />
                        <Button onClick={() => void handleSearch()} loading={searching} disabled={searching}>
                            搜索
                        </Button>
                        <Button
                            variant="subtle"
                            color="gray"
                            onClick={() => {
                                setSearchResult(null);
                                setSearchError(null);
                                setSearchMessage('输入 OEM 产品 ID 后按回车或点击搜索。');
                            }}
                        >
                            清除
                        </Button>
                    </Group>

                    {searchError ? (
                        <Text size="sm" c="red">
                            {searchError}
                        </Text>
                    ) : searchResult ? (
                        <Stack gap="sm">
                            <Group gap="sm" align="center">
                                <Text fw={600} color="blue.6">OEM 产品 ID</Text>
                                <Text c="gray.7">{searchResult.oem_product_id}</Text>
                                <Badge color={searchResult.hasOffset ? 'teal' : 'orange'} variant="light">
                                    {searchResult.hasOffset ? '偏移记录' : '无偏移'}
                                </Badge>
                                <Badge color={searchResult.hasSize ? 'teal' : 'orange'} variant="light">
                                    {searchResult.hasSize ? '晶粒尺寸' : '无尺寸'}
                                </Badge>
                            </Group>
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                                <Paper withBorder radius="md" p="sm">
                                    <Stack gap={4}>
                                        <Text size="xs" c="dimmed">
                                            晶粒尺寸 (mm)
                                        </Text>
                                        {searchResult.hasSize ? (
                                            <Group gap="lg">
                                                <Stack gap={2}>
                                                    <Text size="xs" c="dimmed">
                                                        Die X
                                                    </Text>
                                                    <Text size="sm" fw={600} c="blue.6">
                                                        {formatNumber(searchResult.die_x)}
                                                    </Text>
                                                </Stack>
                                                <Stack gap={2}>
                                                    <Text size="xs" c="dimmed">
                                                        Die Y
                                                    </Text>
                                                    <Text size="sm" fw={600} c="blue.6">
                                                        {formatNumber(searchResult.die_y)}
                                                    </Text>
                                                </Stack>
                                            </Group>
                                        ) : (
                                            <Text size="sm" c="dimmed">
                                                未保存晶粒尺寸
                                            </Text>
                                        )}
                                    </Stack>
                                </Paper>
                                <Paper withBorder radius="md" p="sm">
                                    <Stack gap={4}>
                                        <Text size="xs" c="dimmed">
                                            偏移 (mm)
                                        </Text>
                                        {searchResult.hasOffset ? (
                                            <Group gap="lg">
                                                <Stack gap={2}>
                                                    <Text size="xs" c="dimmed">
                                                        X 偏移
                                                    </Text>
                                                    <Text size="sm" fw={600} c="teal.6">
                                                        {formatSignedNumber(searchResult.x_offset)}
                                                    </Text>
                                                </Stack>
                                                <Stack gap={2}>
                                                    <Text size="xs" c="dimmed">
                                                        Y 偏移
                                                    </Text>
                                                    <Text size="sm" fw={600} c="teal.6">
                                                        {formatSignedNumber(searchResult.y_offset)}
                                                    </Text>
                                                </Stack>
                                            </Group>
                                        ) : (
                                            <Text size="sm" c="dimmed">
                                                未保存偏移数据
                                            </Text>
                                        )}
                                    </Stack>
                                </Paper>
                            </SimpleGrid>
                        </Stack>
                    ) : (
                        <Text size="sm" c="dimmed">
                            {searchMessage ?? '输入 OEM 产品 ID 后按回车或点击搜索。'}
                        </Text>
                    )}
                </Stack>
            </Card>
            
            {/* NOTE: ALL DATA TABLE */}
            <Paper withBorder radius="md" p="xs" style={{ display: 'flex', flexDirection: 'column' }}>
                <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
                    <Table highlightOnHover striped withColumnBorders style={{ minHeight: '100%' }}>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th style={{ width: '4%' }}>
                                    <Checkbox
                                        checked={selectAll}
                                        onChange={toggleSelectAll}
                                        aria-label="全选"
                                    />
                                </Table.Th>
                                <Table.Th style={{ width: '22%' }}>OEM 产品 ID</Table.Th>
                                <Table.Th style={{ width: '18%' }}>Die X (mm)</Table.Th>
                                <Table.Th style={{ width: '18%' }}>Die Y (mm)</Table.Th>
                                <Table.Th style={{ width: '18%' }}>X 偏移 (mm)</Table.Th>
                                <Table.Th style={{ width: '18%' }}>Y 偏移 (mm)</Table.Th>
                                <Table.Th style={{ width: '6%' }}>操作</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {loading ? (
                                <Table.Tr>
                                    <Table.Td colSpan={7}>
                                        <Group justify="center" gap="xs">
                                            <Loader size="sm" />
                                            <Text size="sm" c="dimmed">数据加载中…</Text>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ) : rows.length ? (
                                rows.map((row) => {
                                    const isSelected = searchResult?.oem_product_id === row.oem_product_id;
                                    const checked = selectedIds.has(row.oem_product_id);
                                    return (
                                        <Table.Tr
                                            key={row.oem_product_id}
                                            onClick={() => {
                                                setSearchResult(row);
                                                setSearchError(null);
                                                setSearchMessage(null);
                                                setSearchInput(row.oem_product_id);
                                                toggleRow(row.oem_product_id);
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.18)' : undefined,
                                            }}
                                        >
                                            <Table.Td width="4%" onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={checked}
                                                    onChange={() => toggleRow(row.oem_product_id)}
                                                    aria-label={`选择 ${row.oem_product_id}`}
                                                />
                                            </Table.Td>
                                            <Table.Td>
                                                <Stack gap={2} justify="center">
                                                    <Text fw={600}>{row.oem_product_id}</Text>
                                                    <Group gap={6}>
                                                        <Badge color={row.hasOffset ? 'teal' : 'orange'} variant="light" size="xs">
                                                            {row.hasOffset ? '偏移' : '缺偏移'}
                                                        </Badge>
                                                        <Badge color={row.hasSize ? 'teal' : 'orange'} variant="light" size="xs">
                                                            {row.hasSize ? '晶粒' : '缺晶粒'}
                                                        </Badge>
                                                    </Group>
                                                </Stack>
                                            </Table.Td>
                                            <Table.Td>{formatNumber(row.die_x)}</Table.Td>
                                            <Table.Td>{formatNumber(row.die_y)}</Table.Td>
                                            <Table.Td>{formatSignedNumber(row.x_offset)}</Table.Td>
                                            <Table.Td>{formatSignedNumber(row.y_offset)}</Table.Td>
                                            <Table.Td>
                                                <Group gap={4} justify="flex-end">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="blue"
                                                        aria-label="编辑"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openEditModal(row);
                                                        }}
                                                    >
                                                        <IconEdit size={16} />
                                                    </ActionIcon>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="red"
                                                        aria-label="删除"
                                                        onClick={async (event) => {
                                                            event.stopPropagation();
                                                            await handleDelete(row);
                                                        }}
                                                        disabled={deletingId === row.oem_product_id}
                                                    >
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })
                            ) : (
                                <Table.Tr>
                                    <Table.Td colSpan={7}>
                                        <Text size="sm" c="dimmed" ta="center" py="sm">
                                            暂无匹配记录
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            )}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
                <Stack>
                    <Group>
                        {/* NOTE: BATCH DELETE BUTTON */}
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
                    </Group>

                </Stack>
            </Paper>
            
            {/* NOTE: MODAL */}
            <Modal
                opened={modalOpen}
                onClose={() => {
                    if (!saving) resetForm();
                }}
                title={editMode === 'edit' ? '编辑记录' : '新增记录'}
                centered
                size="lg"
                closeOnClickOutside={!saving}
                closeOnEscape={!saving}
                withCloseButton={!saving}
            >
                <Stack gap="md">
                    <TextInput
                        label="OEM 产品 ID"
                        placeholder="例如：OEM-12345"
                        value={formState?.oem_product_id ?? ''}
                        onChange={(event) => setFormState((prev) => (prev ? { ...prev, oem_product_id: event.currentTarget.value } : prev))}
                        disabled={editMode === 'edit'}
                        error={formErrors.oem_product_id}
                        required
                    />
                    <Group grow>
                        <NumberInput
                            label="X 偏移 (mm)"
                            value={formState?.x_offset ?? ''}
                            decimalScale={6}
                            onChange={handleNumberChange('x_offset')}
                            error={formErrors.x_offset}
                            required
                        />
                        <NumberInput
                            label="Y 偏移 (mm)"
                            value={formState?.y_offset ?? ''}
                            decimalScale={6}
                            onChange={handleNumberChange('y_offset')}
                            error={formErrors.y_offset}
                            required
                        />
                    </Group>
                    <Group grow>
                        <NumberInput
                            label="Die X (mm)"
                            value={formState?.die_x ?? ''}
                            decimalScale={6}
                            onChange={handleNumberChange('die_x')}
                            error={formErrors.die_x}
                            required
                        />
                        <NumberInput
                            label="Die Y (mm)"
                            value={formState?.die_y ?? ''}
                            decimalScale={6}
                            onChange={handleNumberChange('die_y')}
                            error={formErrors.die_y}
                            required
                        />
                    </Group>

                    <Group justify="flex-end">
                        <Button variant="default" onClick={resetForm} disabled={saving}>
                            取消
                        </Button>
                        <Button onClick={handleSubmit} loading={saving}>
                            保存
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Card, Group, Stack, Table, Text, ScrollArea, Loader, Title, Badge,
    TextInput, ActionIcon, Tooltip, Alert, SimpleGrid
} from '@mantine/core';
import { IconRefresh, IconSearch, IconX, IconAlertCircle } from '@tabler/icons-react';

import type { OemProductMapRow, WaferMapRow } from '@/db/types';
import type { WaferFileMetadata } from '@/types/Wafer';
import { WaferFileMetadataCard } from '@/components/MetadataCard';

// ---------------- 中文 UI 文案 ----------------
const zh = {
    searchPlaceholder: '搜索…',
    reload: '刷新',
    none: '无数据',
    selectProduct: '请选择产品',
    selectBatch: '请选择批次',
    selectWafer: '请选择晶圆',
    noBatches: '没有批次',
    noWafers: '没有晶圆',
    noSubs: '没有子编号',
    mapped: (n: number) => `已映射 ${n} 条`,
    batchesCount: (n: number) => `共 ${n} 个批次`,
    wafersCount: (n: number) => `共 ${n} 片晶圆`,
    subsCount: (n: number) => `共 ${n} 个子编号`,
    oemProduct: 'OEM ↔ 产品',
    batches: '批次',
    wafers: '晶圆',
    subs: '子编号',
    waferMaps: '晶圆叠图',
    selected: '当前选择',
    product: '产品',
    batch: '批次',
    wafer: '晶圆',
    subId: '子编号',
    oemIdCol: 'OEM 编号',
    productIdCol: '产品编号',
    lotIdCol: '批次号',
    waferIdCol: '晶圆号',
    filePathCol: '文件路径',
    clickToLoad: '点击加载晶圆叠图',
    selectSubTip: '请选择子编号以加载叠图。',
    noMaps: '当前选择没有叠图数据。',
};

// ---------------- Sticky 表头样式 ----------------
const stickyHeadProps = {
    style: {
        position: 'sticky' as const,
        top: 0,
        zIndex: 2,
        background: 'var(--mantine-color-body)',
        boxShadow: 'inset 0 -1px 0 var(--mantine-color-gray-3)',
    },
};

// 小清除按钮
function ClearableInput(props: React.ComponentProps<typeof TextInput> & { onClear?: () => void }) {
    const { onClear, value, ...rest } = props;
    const hasValue = typeof value === 'string' && value.length > 0;
    return (
        <TextInput
            value={value}
            leftSection={<IconSearch size={14} />}
            rightSection={
                hasValue ? (
                    <ActionIcon size="sm" variant="subtle" aria-label="清除" onClick={onClear}>
                        <IconX size={14} />
                    </ActionIcon>
                ) : null
            }
            size="xs"
            {...rest}
        />
    );
}

// ---------------- 默认 DB helpers（可被 props 覆盖） ----------------
async function defaultGetAllOemProductMappings(): Promise<OemProductMapRow[]> {
    const { getAllOemProductMappings } = await import('@/db/spreadSheet');
    return getAllOemProductMappings();
}
async function defaultGetBatchesByProductId(product_id: string): Promise<{ lot_id: string }[]> {
    const { getBatchesByProductId } = await import('@/db/spreadSheet');
    return getBatchesByProductId(product_id);
}
async function defaultGetWafersByProductAndBatch(
    product_id: string, lot_id: string
): Promise<{ wafer_id: string }[]> {
    const { getWafersByProductAndBatch } = await import('@/db/spreadSheet');
    return getWafersByProductAndBatch(product_id, lot_id);
}
async function defaultGetSubIdsByProductLotWafer(
    product_id: string, lot_id: string, wafer_id: string
): Promise<{ sub_id: string; file_path: string }[]> {
    const { getSubIdsByProductBatchWafer } = await import('@/db/spreadSheet');
    return getSubIdsByProductBatchWafer(product_id, lot_id, wafer_id);
}
async function defaultGetWaferMapsByTriple(
    product_id: string, batch_id: string, wafer_id: number
): Promise<WaferMapRow[]> {
    const { getWaferMapsByTriple } = await import('@/db/wafermaps');
    return getWaferMapsByTriple(product_id, batch_id, wafer_id);
}

// ---------------- 通用获取 Hook ----------------
type FetchState<T> = {
    data: T;
    loading: boolean;
    error: string | null;
    reload: () => void;
    setData: React.Dispatch<React.SetStateAction<T>>;
};

function useFetchList<T>(
    enabled: boolean,
    fetcher: () => Promise<T>,
    deps: any[] = [],
    initial: T,
    transform?: (v: T) => T
): FetchState<T> {
    const [data, setData] = useState<T>(initial);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const bump = useRef(0);
    const cancelRef = useRef(false);

    const doLoad = async () => {
        if (!enabled) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetcher();
            if (!cancelRef.current) setData(transform ? transform(res) : res);
        } catch (e: any) {
            if (!cancelRef.current) setError(e?.message ?? 'Failed to load');
        } finally {
            if (!cancelRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        cancelRef.current = false;
        void doLoad();
        return () => { cancelRef.current = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, bump.current, ...deps]);

    return {
        data, loading, error,
        setData,
        reload: () => { bump.current++; }
    };
}

// ---------------- 组件 Props ----------------
type Props = {
    initialProductId?: string;
    searchable?: boolean;

    getAllOemProductMappings?: () => Promise<OemProductMapRow[]>;
    getBatchesByProductId?: (product_id: string) => Promise<{ lot_id: string }[]>;
    getWafersByProductAndBatch?: (product_id: string, lot_id: string) => Promise<{ wafer_id: string }[]>;
    getSubIdsByProductLotWafer?: (product_id: string, lot_id: string, wafer_id: string) => Promise<{ sub_id: string; file_path: string }[]>;
    getWaferMapsByTriple?: (product_id: string, batch_id: string, wafer_id: number) => Promise<WaferMapRow[]>;
};

export default function ProductBatchNavigator({
    initialProductId,
    searchable = true,

    getAllOemProductMappings = defaultGetAllOemProductMappings,
    getBatchesByProductId = defaultGetBatchesByProductId,
    getWafersByProductAndBatch = defaultGetWafersByProductAndBatch,
    getSubIdsByProductLotWafer = defaultGetSubIdsByProductLotWafer,
    getWaferMapsByTriple = defaultGetWaferMapsByTriple,
}: Props) {
    // 选择状态
    const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId ?? null);
    const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
    const [selectedWaferId, setSelectedWaferId] = useState<string | null>(null);
    const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
    const [selectedOemId, setSelectedOemId] = useState<string | null>(null);

    // ▼ NEW: 每列独立搜索
    const [oemFilter, setOemFilter] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [lotFilter, setLotFilter] = useState('');
    const [waferFilter, setWaferFilter] = useState('');
    const [subIdFilter, setSubIdFilter] = useState('');
    const [pathFilter, setPathFilter] = useState('');

    // 重置级联
    const resetAfterProduct = () => {
        setSelectedLotId(null);
        resetAfterBatch();
    };
    const resetAfterBatch = () => {
        setSelectedWaferId(null);
        resetAfterWafer();
    };
    const resetAfterWafer = () => {
        setSelectedSubId(null);
    };

    // 1) OEM↔产品 映射
    const mappingsState = useFetchList<OemProductMapRow[]>(
        true,
        getAllOemProductMappings,
        [],
        [],
    );

    // 初始 productId → 自动选中 OEM
    useEffect(() => {
        if (!initialProductId || !mappingsState.data.length) return;
        if (selectedOemId) return;
        const found = mappingsState.data.find(x => x.product_id === initialProductId);
        if (found) {
            setSelectedOemId(found.oem_product_id);
            setSelectedProductId(found.product_id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialProductId, mappingsState.data]);

    // 过滤映射（按两列分别过滤）
    const filteredMappings = useMemo(() => {
        const qO = oemFilter.trim().toLowerCase();
        const qP = productFilter.trim().toLowerCase();
        return mappingsState.data.filter(r =>
            (!qO || r.oem_product_id.toLowerCase().includes(qO)) &&
            (!qP || r.product_id.toLowerCase().includes(qP))
        );
    }, [mappingsState.data, oemFilter, productFilter]);

    // 2) 批次（依赖 OEM）
    const batchesState = useFetchList<{ lot_id: string }[]>(
        !!selectedOemId,
        () => getBatchesByProductId(selectedOemId!),
        [selectedOemId],
        [],
    );
    useEffect(() => { resetAfterProduct(); }, [selectedOemId]); // eslint-disable-line

    const filteredBatches = useMemo(() => {
        const q = lotFilter.trim().toLowerCase();
        return q ? batchesState.data.filter(b => b.lot_id.toLowerCase().includes(q)) : batchesState.data;
    }, [batchesState.data, lotFilter]);

    // 3) 晶圆（依赖 OEM + 批次）
    const wafersState = useFetchList<{ wafer_id: string }[]>(
        !!selectedOemId && !!selectedLotId,
        () => getWafersByProductAndBatch(selectedOemId!, selectedLotId!),
        [selectedOemId, selectedLotId],
        [],
        // 数字升序
        (arr) => [...arr].sort((a, b) => Number(a.wafer_id) - Number(b.wafer_id))
    );
    useEffect(() => { resetAfterBatch(); }, [selectedLotId]); // eslint-disable-line

    const filteredWafers = useMemo(() => {
        const q = waferFilter.trim().toLowerCase();
        return q ? wafersState.data.filter(w => w.wafer_id.toLowerCase().includes(q)) : wafersState.data;
    }, [wafersState.data, waferFilter]);

    // 4) 子编号（依赖 OEM + 批次 + 晶圆）
    const subsState = useFetchList<{ sub_id: string; file_path: string }[]>(
        !!selectedOemId && !!selectedLotId && !!selectedWaferId,
        () => getSubIdsByProductLotWafer(selectedOemId!, selectedLotId!, selectedWaferId!),
        [selectedOemId, selectedLotId, selectedWaferId],
        [],
    );
    useEffect(() => { resetAfterWafer(); }, [selectedWaferId]); // eslint-disable-line

    const filteredSubs = useMemo(() => {
        const qs = subIdFilter.trim().toLowerCase();
        const qp = pathFilter.trim().toLowerCase();
        return subsState.data.filter(s =>
            (!qs || s.sub_id.toLowerCase().includes(qs)) &&
            (!qp || s.file_path.toLowerCase().includes(qp))
        );
    }, [subsState.data, subIdFilter, pathFilter]);

    // 5) 叠图面板（点击子编号后加载）
    const [mapsLoading, setMapsLoading] = useState(false);
    const [mapsError, setMapsError] = useState<string | null>(null);
    const [waferMaps, setWaferMaps] = useState<any[]>([]);

    async function loadWaferMaps(sub_id: string) {
        setSelectedSubId(sub_id);
        setWaferMaps([]);
        setMapsError(null);

        if (!selectedProductId || !selectedLotId || !selectedWaferId) return;

        const waferNum = Number(selectedWaferId);
        if (!Number.isFinite(waferNum)) {
            setMapsError('wafer_id 不是数值');
            return;
        }

        setMapsLoading(true);
        try {
            const res = await getWaferMapsByTriple(selectedProductId, selectedLotId, waferNum);
            setWaferMaps(res ?? []);
        } catch (e: any) {
            setMapsError(e?.message ?? '加载叠图失败');
        } finally {
            setMapsLoading(false);
        }
    }

    function pickOemProduct(row: OemProductMapRow) {
        setSelectedOemId(row.oem_product_id);
        setSelectedProductId(row.product_id);
    }

    // wafer_maps → 卡片数据
    function toWaferFileMetadata(r: any): WaferFileMetadata {
        return {
            filePath: r.file_path,
            productModel: r.product_id,
            batch: r.batch_id,
            waferId: String(r.wafer_id),
            processSubStage: typeof r.sub_stage === 'number' ? r.sub_stage : undefined,
            retestCount: typeof r.retest_count === 'number' ? r.retest_count : undefined,
            time: r.time ?? undefined,
            stage: r.stage ?? undefined,
            lastModified: 0,
        };
    }

    return (
        <Stack gap="md">
            <Group align="start" gap="md" wrap="nowrap">
                {/* 列 1：OEM ↔ 产品 */}
                <Card withBorder radius="lg" w={360} p="sm" style={{ flexShrink: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.oemProduct}</Title>
                        <Tooltip label={zh.reload} withArrow>
                            <ActionIcon variant="light" onClick={mappingsState.reload} aria-label={zh.reload}>
                                <IconRefresh size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    {mappingsState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{mappingsState.error}</Alert>}

                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false} horizontalSpacing="sm" verticalSpacing="xs">
                            <Table.Thead {...stickyHeadProps}>
                                <Table.Tr>
                                    <Table.Th>{zh.oemIdCol}</Table.Th>
                                    <Table.Th>{zh.productIdCol}</Table.Th>
                                </Table.Tr>
                                {/* ▼ NEW: 每列表头下的筛选行 */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={oemFilter}
                                            onChange={(e) => setOemFilter(e.currentTarget.value)}
                                            onClear={() => setOemFilter('')}
                                            placeholder={`${zh.oemIdCol} ${zh.searchPlaceholder}`}
                                        />
                                    </Table.Th>
                                    <Table.Th>
                                        <ClearableInput
                                            value={productFilter}
                                            onChange={(e) => setProductFilter(e.currentTarget.value)}
                                            onClear={() => setProductFilter('')}
                                            placeholder={`${zh.productIdCol} ${zh.searchPlaceholder}`}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {mappingsState.loading ? (
                                    <Table.Tr><Table.Td colSpan={2}><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : filteredMappings.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">{zh.none}</Text></Table.Td></Table.Tr>
                                ) : filteredMappings.map((row) => {
                                    const active = row.product_id === selectedProductId || row.oem_product_id === selectedOemId;
                                    return (
                                        <Table.Tr
                                            key={`${row.oem_product_id}|${row.product_id}`}
                                            onClick={() => pickOemProduct(row)}
                                            style={{ cursor: 'pointer', background: active ? 'var(--mantine-color-blue-0)' : undefined }}
                                        >
                                            <Table.Td><Text fw={active ? 700 : 400}>{row.oem_product_id}</Text></Table.Td>
                                            <Table.Td><Text fw={active ? 700 : 400}>{row.product_id}</Text></Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>

                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">{zh.mapped(filteredMappings.length)}</Text>
                        {selectedProductId && <Badge radius="sm" variant="light">{zh.product}: {selectedProductId}</Badge>}
                    </Group>
                </Card>

                {/* 列 2：批次 */}
                <Card withBorder radius="lg" w={220} p="sm" style={{ flexShrink: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.batches}</Title>
                        <Group gap={1} align="end" style={{ alignItems: 'center' }}>
                            <Text size="xs" c="dimmed">{zh.oemIdCol}</Text>
                            <Text size="sm" fw={600}>{selectedOemId ?? '—'}</Text>
                        </Group>
                    </Group>
                    {batchesState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{batchesState.error}</Alert>}
                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead {...stickyHeadProps}>
                                <Table.Tr><Table.Th>{zh.lotIdCol}</Table.Th></Table.Tr>
                                {/* ▼ NEW: 批次筛选 */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={lotFilter}
                                            onChange={(e) => setLotFilter(e.currentTarget.value)}
                                            onClear={() => setLotFilter('')}
                                            placeholder={`${zh.lotIdCol} ${zh.searchPlaceholder}`}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {batchesState.loading ? (
                                    <Table.Tr><Table.Td><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedProductId ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{zh.selectProduct}</Text></Table.Td></Table.Tr>
                                ) : filteredBatches.length === 0 ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{zh.noBatches}</Text></Table.Td></Table.Tr>
                                ) : filteredBatches.map(b => {
                                    const active = b.lot_id === selectedLotId;
                                    return (
                                        <Table.Tr
                                            key={b.lot_id}
                                            onClick={() => setSelectedLotId(b.lot_id)}
                                            style={{ cursor: 'pointer', background: active ? 'var(--mantine-color-blue-0)' : undefined }}
                                        >
                                            <Table.Td><Text fw={active ? 700 : 400}>{b.lot_id}</Text></Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">{selectedProductId ? zh.batchesCount(filteredBatches.length) : '—'}</Text>
                    </Group>
                </Card>

                {/* 列 3：晶圆 */}
                <Card withBorder radius="lg" w={220} p="sm" style={{ flexShrink: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.wafers}</Title>
                        <Group gap={1} align="end" style={{ alignItems: 'center' }}>
                            <Text size="xs" c="dimmed">{zh.batch}</Text>
                            <Text size="sm" fw={600}>{selectedLotId ?? '—'}</Text>
                        </Group>
                    </Group>
                    {wafersState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{wafersState.error}</Alert>}
                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead {...stickyHeadProps}>
                                <Table.Tr><Table.Th>{zh.waferIdCol}</Table.Th></Table.Tr>
                                {/* ▼ NEW: 晶圆筛选 */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={waferFilter}
                                            onChange={(e) => setWaferFilter(e.currentTarget.value)}
                                            onClear={() => setWaferFilter('')}
                                            placeholder={`${zh.waferIdCol} ${zh.searchPlaceholder}`}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {wafersState.loading ? (
                                    <Table.Tr><Table.Td><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedLotId ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{zh.selectBatch}</Text></Table.Td></Table.Tr>
                                ) : filteredWafers.length === 0 ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{zh.noWafers}</Text></Table.Td></Table.Tr>
                                ) : filteredWafers.map(w => {
                                    const active = w.wafer_id === selectedWaferId;
                                    return (
                                        <Table.Tr
                                            key={w.wafer_id}
                                            onClick={() => setSelectedWaferId(w.wafer_id)}
                                            style={{ cursor: 'pointer', background: active ? 'var(--mantine-color-blue-0)' : undefined }}
                                        >
                                            <Table.Td><Text fw={active ? 700 : 400}>{w.wafer_id}</Text></Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">{selectedLotId ? zh.wafersCount(filteredWafers.length) : '—'}</Text>
                    </Group>
                </Card>

                {/* 列 4：子编号 */}
                <Card withBorder radius="lg" p="sm" style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.subs}</Title>
                        <Stack gap={0} align="end">
                            <Text size="xs" c="dimmed">{zh.wafer}</Text>
                            <Text size="sm" fw={600}>{selectedWaferId ?? '—'}</Text>
                        </Stack>
                    </Group>
                    {subsState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{subsState.error}</Alert>}
                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead {...stickyHeadProps}>
                                <Table.Tr>
                                    <Table.Th>{zh.subId}</Table.Th>
                                    <Table.Th>{zh.filePathCol}</Table.Th>
                                </Table.Tr>
                                {/* ▼ NEW: 双列筛选（子编号 / 路径） */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={subIdFilter}
                                            onChange={(e) => setSubIdFilter(e.currentTarget.value)}
                                            onClear={() => setSubIdFilter('')}
                                            placeholder={`${zh.subId} ${zh.searchPlaceholder}`}
                                        />
                                    </Table.Th>
                                    <Table.Th>
                                        <ClearableInput
                                            value={pathFilter}
                                            onChange={(e) => setPathFilter(e.currentTarget.value)}
                                            onClear={() => setPathFilter('')}
                                            placeholder={`${zh.filePathCol} ${zh.searchPlaceholder}`}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {subsState.loading ? (
                                    <Table.Tr><Table.Td colSpan={2}><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedWaferId ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">{zh.selectWafer}</Text></Table.Td></Table.Tr>
                                ) : filteredSubs.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">{zh.noSubs}</Text></Table.Td></Table.Tr>
                                ) : filteredSubs.map(s => {
                                    const active = s.sub_id === selectedSubId;
                                    return (
                                        <Table.Tr
                                            key={s.sub_id}
                                            onClick={() => loadWaferMaps(s.sub_id)}
                                            style={{ cursor: 'pointer', background: active ? 'var(--mantine-color-blue-0)' : undefined }}
                                            title={zh.clickToLoad}
                                        >
                                            <Table.Td><Text fw={active ? 700 : 400}>{s.sub_id}</Text></Table.Td>
                                            <Table.Td><Text title={s.file_path} lineClamp={1}>{s.file_path}</Text></Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">
                            {selectedWaferId ? zh.subsCount(filteredSubs.length) : '—'}
                        </Text>
                    </Group>
                </Card>
            </Group>

            {/* 晶圆叠图面板 */}
            <Card withBorder radius="lg" p="sm">
                <Group justify="space-between" mb="xs">
                    <Title order={4}>{zh.waferMaps}</Title>
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">{zh.selected}</Text>
                        <Text size="sm" fw={600}>
                            {selectedProductId ? `${selectedOemId} (${selectedProductId})` : '—'} / {selectedLotId ?? '—'} / {selectedWaferId ?? '—'} {selectedSubId ? ` / ${selectedSubId}` : ''}
                        </Text>
                    </Stack>
                </Group>

                {mapsError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{mapsError}</Alert>}

                {mapsLoading ? (
                    <Group justify="center" p="md"><Loader size="sm" /></Group>
                ) : !selectedProductId || !selectedLotId || !selectedWaferId || !selectedSubId ? (
                    <Text c="dimmed" ta="center">{zh.selectSubTip}</Text>
                ) : waferMaps.length === 0 ? (
                    <Text c="dimmed" ta="center">{zh.noMaps}</Text>
                ) : (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                        {waferMaps.map((r, i) => (
                            <WaferFileMetadataCard key={`${r.idx}-${i}`} data={toWaferFileMetadata(r)} />
                        ))}
                    </SimpleGrid>
                )}
            </Card>
        </Stack>
    );
}

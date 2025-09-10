import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Card, Group, Stack, Table, Text, ScrollArea, Loader, Title, Badge,
    TextInput, ActionIcon, Tooltip, Alert, SimpleGrid
} from '@mantine/core';
import { IconRefresh, IconSearch, IconX, IconAlertCircle } from '@tabler/icons-react';

import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/hooks';
import { AppDispatch } from '@/store';
import { clearJob, setJob } from '@/slices/job';
import type { OemProductMapRow, WaferMapRow } from '@/db/types';

import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/MetadataCard';
import SubstratePane from '@/components/Substrate';

import { ExcelType } from '@/types/wafer';
import { DataSourceType } from '@/types/dataSource';
import { toWaferFileMetadata } from '@/types/helpers';

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

    oemProduct: 'OEM产品',
    batches: '批次',
    wafers: '晶圆',
    subs: '子编号',

    waferMaps: '晶圆叠图',
    selected: '当前选择',

    oem: 'OEM',
    product: '产品',
    batch: '批次号',
    wafer: '晶圆号',
    subId: '子编号',

    oemIdCol: 'OEM编号',
    productIdCol: '产品编号',
    lotIdCol: '批次号',
    waferIdCol: '晶圆号',
    filePathCol: '文件路径',

    clickToLoad: '点击加载晶圆叠图',
    selectSubTip: '请选择子编号以加载叠图。',

    noMaps: '当前选择没有叠图数据。',
};

// UI spacing for the columns
const LIST_MAH = { base: 300 } as const;

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
async function defaultGetBatchesByOemId(oem_product_id: string): Promise<{ lot_id: string }[]> {
    const { getBatchesByOemId } = await import('@/db/spreadSheet');
    return getBatchesByOemId(oem_product_id);
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
    deps: ReadonlyArray<unknown> = [],
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
        } catch (e: unknown) {
            console.error(e);
            const msg = e instanceof Error ? e.message : String(e);
            if (!cancelRef.current) setError(msg || 'Failed to load');
        } finally {
            if (!cancelRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        cancelRef.current = false;
        void doLoad();
        return () => { cancelRef.current = true; };

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
    getBatchesByOemId?: (oem_product_id: string) => Promise<{ lot_id: string }[]>;
    getWafersByProductAndBatch?: (product_id: string, lot_id: string) => Promise<{ wafer_id: string }[]>;
    getSubIdsByProductLotWafer?: (product_id: string, lot_id: string, wafer_id: string) => Promise<{ sub_id: string; file_path: string }[]>;
    getWaferMapsByTriple?: (product_id: string, batch_id: string, wafer_id: number) => Promise<WaferMapRow[]>;
};

export default function ProductBatchNavigator({
    initialProductId,
    // searchable = true,

    getAllOemProductMappings = defaultGetAllOemProductMappings,
    getBatchesByOemId = defaultGetBatchesByOemId,
    getWafersByProductAndBatch = defaultGetWafersByProductAndBatch,
    getSubIdsByProductLotWafer = defaultGetSubIdsByProductLotWafer,
    getWaferMapsByTriple = defaultGetWaferMapsByTriple,
}: Props) {
    const dispatch = useDispatch<AppDispatch>();

    const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId ?? null);
    const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
    const [selectedWaferId, setSelectedWaferId] = useState<string | null>(null);
    const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
    const [selectedOemId, setSelectedOemId] = useState<string | null>(null);

    const [oemFilter, setOemFilter] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [lotFilter, setLotFilter] = useState('');
    const [waferFilter, setWaferFilter] = useState('');

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
        () => getBatchesByOemId(selectedOemId!),
        [selectedOemId],
        [],
    );
    useEffect(() => { resetAfterProduct(); }, [selectedOemId]);

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
    useEffect(() => { resetAfterBatch(); }, [selectedLotId]);

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
    useEffect(() => { resetAfterWafer(); }, [selectedWaferId]);

    // 自动选择逻辑：当选中晶圆且子编号列表加载完成后，自动选择第一个子编号
    useEffect(() => {
        if (!selectedWaferId) return;
        if (selectedSubId) return; // 已有选择则不重复
        if (subsState.loading) return; // 等待加载完成
        if (!subsState.data?.length) return; // 无可用子编号
        void loadWaferMaps(subsState.data[0].sub_id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWaferId, selectedSubId, subsState.loading, subsState.data]);

    // 5) 叠图面板（点击子编号后加载）
    const [mapsError, setMapsError] = useState<string | null>(null);

    const job = useAppSelector(s => s.stackingJob);
    const {
        oemProductId: jobOemId,
        productId: jobProductId,
        batchId: jobBatchId,
        waferId: jobWaferId,
        subId: jobSubId,
        waferSubstrate: jobSubstrate,
        waferMaps: jobWaferMaps,
    } = job;

    async function loadWaferMaps(sub_id: string) {
        setSelectedSubId(sub_id);
        await dispatch(clearJob());
        setMapsError(null);

        if (!selectedProductId || !selectedLotId || !selectedWaferId) return;

        const waferNum = Number(selectedWaferId);
        if (!Number.isFinite(waferNum)) {
            setMapsError('wafer_id 不是数值');
            return;
        }

        try {
            const { getSubstrateDefectBySubId } = await import('@/db/spreadSheet');
            const substrate = await getSubstrateDefectBySubId(sub_id);
            const maps = await getWaferMapsByTriple(selectedProductId, selectedLotId, waferNum);
            await dispatch(
                setJob({
                    oemProductId: selectedOemId!,
                    productId: selectedProductId!,
                    batchId: selectedLotId!,
                    waferId: waferNum!,
                    subId: selectedSubId!,
                    substrate, maps
                })
            );

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setMapsError(msg || '加载叠图失败');
        }
    }

    function pickOemProduct(row: OemProductMapRow) {
        setSelectedOemId(row.oem_product_id);
        setSelectedProductId(row.product_id);
    }

    return (
        <Stack gap="md">
            <Group align="start" gap="md">
                {/* 列 1：OEM ↔ 产品 */}
                <Card
                    withBorder
                    radius="lg"
                    p="sm"
                    style={{ flex: '1 1 0', minWidth: 260, display: 'flex', flexDirection: 'column' }}
                >
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.oemProduct}</Title>
                        <Tooltip label={zh.reload} withArrow>
                            <ActionIcon variant="light" onClick={mappingsState.reload} aria-label={zh.reload}>
                                <IconRefresh size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    {mappingsState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{mappingsState.error}</Alert>}

                    <ScrollArea.Autosize mah={LIST_MAH} offsetScrollbars type="hover" scrollbarSize={8} style={{ flex: 1 }}>
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
                    </ScrollArea.Autosize>

                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">{zh.mapped(filteredMappings.length)}</Text>
                        {selectedProductId && <Badge radius="sm" variant="light">{zh.product}: {selectedProductId}</Badge>}
                    </Group>
                </Card>

                {/* 列 2：批次 */}
                <Card
                    withBorder
                    radius="lg"
                    p="sm"
                    style={{ flex: '1 1 0', minWidth: 260, display: 'flex', flexDirection: 'column' }}
                >
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.batches}</Title>
                        <Group gap={1} align="end" style={{ alignItems: 'center' }}>
                            <Text size="xs" c="dimmed">{zh.oem}</Text>
                            <Text size="sm" fw={600}>{selectedOemId ?? '—'}</Text>
                        </Group>
                    </Group>
                    {batchesState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{batchesState.error}</Alert>}
                    <ScrollArea.Autosize mah={LIST_MAH} offsetScrollbars type="hover" scrollbarSize={8} style={{ flex: 1 }}>
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
                    </ScrollArea.Autosize>
                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">{selectedProductId ? zh.batchesCount(filteredBatches.length) : '—'}</Text>
                    </Group>
                </Card>

                {/* 列 3：晶圆（填充剩余空间） */}
                <Card
                    withBorder
                    radius="lg"
                    p="sm"
                    style={{ flex: '1 1 0', minWidth: 260, display: 'flex', flexDirection: 'column' }}
                >
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>{zh.wafers}</Title>
                        <Group gap={1} align="end" style={{ alignItems: 'center' }}>
                            <Text size="xs" c="dimmed">{zh.batch}</Text>
                            <Text size="sm" fw={600}>{selectedLotId ?? '—'}</Text>
                        </Group>
                    </Group>
                    {wafersState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{wafersState.error}</Alert>}
                    <ScrollArea.Autosize mah={LIST_MAH} offsetScrollbars type="hover" scrollbarSize={8} style={{ flex: 1 }}>
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
                    </ScrollArea.Autosize>
                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">{selectedLotId ? zh.wafersCount(filteredWafers.length) : '—'}</Text>
                    </Group>
                </Card>

                {/* 已移除子编号列：选择晶圆后自动选择第一个子编号并加载叠图 */}
            </Group>

            {/* 晶圆叠图面板 */}
            <Card withBorder radius="lg" p="sm" style={{ display: 'flex', flexDirection: 'column' }}>
                <Group justify="space-between" mb="xs">
                    <Title order={4}>{zh.waferMaps + ' (active)'}</Title>
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">{zh.selected}</Text>
                        <Text size="sm" fw={600}>
                            {/* OEM/Product */}
                            {jobProductId
                                ? `${jobOemId || '—'} (${jobProductId})`
                                : (jobOemId || '—')}
                            {' / '}
                            {/* Batch */}
                            {jobBatchId || '—'}
                            {' / '}
                            {/* Wafer */}
                            {jobWaferId ?? '—'}
                            {/* Optional sub_id */}
                            {jobSubId ? ` / ${jobSubId}` : ''}
                        </Text>
                    </Stack>
                </Group>

                {mapsError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{mapsError}</Alert>}

                {job && jobSubstrate && <>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">

                        {jobWaferMaps.map((r, i) => (
                            <WaferFileMetadataCard key={`${r.idx}-${i}`} data={toWaferFileMetadata(r)} />
                        ))}
                        {jobSubstrate &&
                            <ExcelMetadataCard
                                data={{
                                    ...jobSubstrate,
                                    type: ExcelType.DefectList,
                                    stage: DataSourceType.Substrate,
                                    filePath: jobSubstrate.file_path,
                                    lastModified: 0
                                }} />
                        }
                    </SimpleGrid>
                </>}
            </Card>

            {job &&
                <SubstratePane
                    showParameters
                    oemProductId={jobOemId}
                    waferSubstrate={jobSubstrate}
                    waferMaps={jobWaferMaps}
                />}
        </Stack>
    );
}

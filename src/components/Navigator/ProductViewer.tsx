import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Card, Group, Stack, Table, Text, ScrollArea, Loader, Title, Badge,
    TextInput, ActionIcon, Tooltip, Alert, SimpleGrid,
    Checkbox,
    Button
} from '@mantine/core';
import { IconRefresh, IconSearch, IconX, IconAlertCircle, IconPlus } from '@tabler/icons-react';
import { infoToast, errorToast } from '@/components/UI/Toaster';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/hooks';
import { AppDispatch } from '@/store';
import { clearJob, setJob, queueAddJob } from '@/slices/job';
import type { OemProductMapRow, WaferMapRow } from '@/db/types';

import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/Card/MetadataCard';
import SubstratePane from '@/components/Substrate';
import { ExcelType } from '@/types/wafer';
import { DataSourceType } from '@/types/dataSource';
import { toWaferFileMetadata } from '@/types/helpers';

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
    const [selectAllWafers, setSelectAllWafers] = useState(false);
    const [selectAllBatches, setSelectAllBatches] = useState(false);
    const [isAddingAllBatches, setIsAddingAllBatches] = useState(false);

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

    const handleAddAllBatchesToQueue = async () => {
        if (!selectedOemId || !selectedProductId) {
            errorToast({ title: '操作失败', message: '请先选择产品' });
            return;
        }
        if (batchesState.data.length === 0) {
            errorToast({ title: '操作失败', message: '当前产品无批次数据' });
            return;
        }
        setIsAddingAllBatches(true);

        let totalWafers = 0;
        let addedCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        try {
            const allBatches = batchesState.data;
            for (const batch of allBatches) {
                const wafers = await getWafersByProductAndBatch(
                    selectedOemId,
                    batch.lot_id
                );
                totalWafers += wafers.length;
            }
            if (totalWafers === 0) {
                errorToast({ title: '未找到数据', message: '请确认产品与批次关联正确' });
                setIsAddingAllBatches(false);
                setSelectAllBatches(false);
                return;
            }

            for (const batch of allBatches) {
                console.log('处理批次:', batch.lot_id);

                try {
                    const wafers = await getWafersByProductAndBatch(
                        selectedOemId,
                        batch.lot_id
                    );

                    if (!wafers.length) continue;

                    for (const wafer of wafers) {
                        const waferNum = Number(wafer.wafer_id);
                        if (!Number.isFinite(waferNum)) {
                            skippedCount++;
                            continue;
                        }

                        try {
                            const subs = await getSubIdsByProductLotWafer(
                                selectedOemId,
                                batch.lot_id,
                                wafer.wafer_id
                            );

                            if (!subs.length) {
                                skippedCount++;
                                continue;
                            }

                            const subId = subs[0].sub_id;

                            const { getSubstrateDefectBySubId } = await import('@/db/spreadSheet');
                            const substrate = await getSubstrateDefectBySubId(subId);
                            const maps = await getWaferMapsByTriple(
                                selectedProductId,
                                batch.lot_id,
                                waferNum
                            );

                            dispatch(queueAddJob({
                                oemProductId: selectedOemId,
                                productId: selectedProductId,
                                batchId: batch.lot_id,
                                waferId: waferNum,
                                subId: subId,
                                waferSubstrate: substrate,
                                waferMaps: maps,
                                includeSubstrateSelected: !!substrate,
                                selectedLayerKeys: [],
                                name: `${selectedProductId}/${batch.lot_id}/Wafer${wafer.wafer_id}`,
                                note: `全选批次批量添加`
                            }));
                            addedCount++;
                        } catch (er) {
                            errorCount++;
                        }
                    }
                } catch (er) {
                    errorCount++;
                }
            }
            infoToast({
                title: '批量添加完成',
                message: `成功：${addedCount} 个 | 失败：${errorCount} 个 | 跳过：${skippedCount} 个`
            });

        } catch (err) {
            console.error('批量添加失败', err);
            errorToast({ title: '批量添加失败', message: String(err) });
        } finally {
            setIsAddingAllBatches(false);
            setSelectAllBatches(false);
        }
    };
    const handleAddAllWafersToQueue = async () => {
        if (!selectedLotId || !selectedProductId || !selectedOemId) {
            console.warn('缺少必要参数');
            return;
        }
        const wafersToAdd = filteredWafers;

        let addedCount = 0;
        let errorCount = 0;

        for (const wafer of wafersToAdd) {
            const waferNum = Number(wafer.wafer_id);
            if (!Number.isFinite(waferNum)) continue;

            try {
                const subs = await getSubIdsByProductLotWafer(selectedOemId, selectedLotId, wafer.wafer_id);
                if (!subs.length) continue;

                const subId = subs[0].sub_id;

                const { getSubstrateDefectBySubId } = await import('@/db/spreadSheet');
                const substrate = await getSubstrateDefectBySubId(subId);
                const maps = await getWaferMapsByTriple(selectedProductId, selectedLotId, waferNum);

                dispatch(queueAddJob({
                    oemProductId: selectedOemId,
                    productId: selectedProductId,
                    batchId: selectedLotId,
                    waferId: waferNum,
                    subId: subId,
                    waferSubstrate: substrate,
                    waferMaps: maps,
                    includeSubstrateSelected: !!substrate,
                    selectedLayerKeys: [],
                    name: `${selectedProductId}/${selectedLotId}/${wafer.wafer_id}`,
                    note: `从批次 ${selectedLotId} 批量添加`
                }));
                addedCount++;

            } catch (error) {
                console.error(`添加晶圆 ${wafer.wafer_id} 失败:`, error);
                errorCount++;
            }
        }
        infoToast({
            title: `批次 ${selectedLotId} 添加完成`,
            message: `成功：${addedCount} 个晶圆 | 失败：${errorCount} 个`
        });
        setSelectAllWafers(false);
    };

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
    const waferSelected = jobWaferId !== null && jobWaferId !== undefined;

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
                        <Title order={4}>{'OEM产品'}</Title>
                        <Tooltip label={'刷新'} withArrow>
                            <ActionIcon variant="light" onClick={mappingsState.reload} aria-label={'刷新'}>
                                <IconRefresh size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    {mappingsState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{mappingsState.error}</Alert>}

                    <ScrollArea.Autosize mah={LIST_MAH} offsetScrollbars type="hover" scrollbarSize={8} style={{ flex: 1 }}>
                        <Table striped highlightOnHover withRowBorders={false} horizontalSpacing="sm" verticalSpacing="xs">
                            <Table.Thead {...stickyHeadProps}>
                                <Table.Tr>
                                    <Table.Th>{'OEM编号'}</Table.Th>
                                    <Table.Th>{'产品编号'}</Table.Th>
                                </Table.Tr>
                                {/* ▼ NEW: 每列表头下的筛选行 */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={oemFilter}
                                            onChange={(e) => setOemFilter(e.currentTarget.value)}
                                            onClear={() => setOemFilter('')}
                                            placeholder={'OEM编号 搜索…'}
                                        />
                                    </Table.Th>
                                    <Table.Th>
                                        <ClearableInput
                                            value={productFilter}
                                            onChange={(e) => setProductFilter(e.currentTarget.value)}
                                            onClear={() => setProductFilter('')}
                                            placeholder={'产品编号 搜索…'}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {mappingsState.loading ? (
                                    <Table.Tr><Table.Td colSpan={2}><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : filteredMappings.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">{'无数据'}</Text></Table.Td></Table.Tr>
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
                        <Text size="xs" c="dimmed">{`已映射 ${filteredMappings.length} 条`}</Text>
                        {selectedProductId && <Badge radius="sm" variant="light">{'产品'}: {selectedProductId}</Badge>}
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
                        <Title order={4}>{'批次'}</Title>
                        <Group gap={1} align="end" style={{ alignItems: 'center' }}>
                            <Text size="xs" c="dimmed">{'OEM'}</Text>
                            <Text size="sm" fw={600}>{selectedOemId ?? '—'}</Text>
                        </Group>
                    </Group>
                    {batchesState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{batchesState.error}</Alert>}
                    <ScrollArea.Autosize mah={LIST_MAH} offsetScrollbars type="hover" scrollbarSize={8} style={{ flex: 1 }}>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead {...stickyHeadProps}>
                                {/* <Table.Tr><Table.Th>{zh.lotIdCol}</Table.Th></Table.Tr> */}
                                {/* ▼ NEW: 批次筛选 */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={lotFilter}
                                            onChange={(e) => setLotFilter(e.currentTarget.value)}
                                            onClear={() => setLotFilter('')}
                                            placeholder={'批次号 搜索…'}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {batchesState.loading ? (
                                    <Table.Tr><Table.Td><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedProductId ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{'请选择产品'}</Text></Table.Td></Table.Tr>
                                ) : filteredBatches.length === 0 ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{'没有批次'}</Text></Table.Td></Table.Tr>
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
                        <Text size="xs" c="dimmed">{selectedProductId ? `共 ${filteredBatches.length} 个批次` : '—'}</Text>
                        {selectedProductId && batchesState.data.length > 0 && (
                            <Checkbox
                                size="xs"
                                label={`全选所有批次 (${batchesState.data.length}个)`}
                                checked={selectAllBatches}
                                onChange={(e) => setSelectAllBatches(e.currentTarget.checked)}
                                disabled={isAddingAllBatches}
                                style={{ cursor: 'pointer' }}
                            />
                        )}
                        {selectAllBatches && (
                            <Button
                                size="xs"
                                variant="light"
                                color="blue"
                                onClick={handleAddAllBatchesToQueue}
                                loading={isAddingAllBatches}
                                leftSection={<IconPlus size={14} />}
                            >
                                加入队列 ({batchesState.data.length}个批次)
                            </Button>
                        )}
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
                        <Title order={4}>{'晶圆'}</Title>
                        <Group gap={1} align="end" style={{ alignItems: 'center' }}>
                            <Text size="xs" c="dimmed">{'批次号'}</Text>
                            <Text size="sm" fw={600}>{selectedLotId ?? '—'}</Text>
                        </Group>
                    </Group>
                    {wafersState.error && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{wafersState.error}</Alert>}
                    <ScrollArea.Autosize mah={LIST_MAH} offsetScrollbars type="hover" scrollbarSize={8} style={{ flex: 1 }}>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead {...stickyHeadProps}>
                                {/* <Table.Tr><Table.Th>{zh.waferIdCol}</Table.Th></Table.Tr> */}
                                {/* ▼ NEW: 晶圆筛选 */}
                                <Table.Tr>
                                    <Table.Th>
                                        <ClearableInput
                                            value={waferFilter}
                                            onChange={(e) => setWaferFilter(e.currentTarget.value)}
                                            onClear={() => setWaferFilter('')}
                                            placeholder={'晶圆号 搜索…'}
                                        />
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {wafersState.loading ? (
                                    <Table.Tr><Table.Td><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedLotId ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{'请选择批次'}</Text></Table.Td></Table.Tr>
                                ) : filteredWafers.length === 0 ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">{'没有晶圆'}</Text></Table.Td></Table.Tr>
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
                        <Text size="xs" c="dimmed">
                            {selectedLotId ? `共 ${filteredWafers.length} 片晶圆` : '—'}
                        </Text>
                        {/* 全选勾选框 */}
                        {selectedLotId && filteredWafers.length > 0 && (
                            <Checkbox
                                size="xs"
                                label="全选本批次"
                                checked={selectAllWafers}
                                onChange={(e) => setSelectAllWafers(e.currentTarget.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                        )}
                        {/* 添加全部到队列按钮 */}
                        {selectAllWafers && (
                            <Button
                                size="xs"
                                variant="light"
                                color="blue"
                                onClick={handleAddAllWafersToQueue}
                                leftSection={<IconPlus size={14} />}
                            >
                                加入队列 ({filteredWafers.length}片)
                            </Button>
                        )}
                    </Group>
                </Card>
                {/* 已移除子编号列：选择晶圆后自动选择第一个子编号并加载叠图 */}
            </Group>

            {/* 晶圆叠图面板 */}
            <Card
                withBorder
                radius="lg"
                p="sm"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    ...(waferSelected ? {
                        borderColor: 'var(--mantine-color-blue-5)',
                        boxShadow: '0 0 0 1px var(--mantine-color-blue-1) inset',
                    } : {}),
                }}
            >
                <Group justify="space-between" mb="xs">
                    <Title order={4}>{''}</Title>
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">{'当前选择'}</Text>
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
                    productId={jobProductId}
                    oemProductId={jobOemId}
                    batchId={jobBatchId}
                    waferId={jobWaferId}
                    subId={jobSubId}
                    waferSubstrate={jobSubstrate}
                    waferMaps={jobWaferMaps}
                />}
        </Stack>
    );
}

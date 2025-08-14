import { useEffect, useMemo, useState } from 'react';
import {
    Card, Group, Stack, Table, Text, ScrollArea, Loader, Title, Badge,
    TextInput, ActionIcon, Tooltip, Alert, SimpleGrid
} from '@mantine/core';
import { IconRefresh, IconSearch, IconAlertCircle } from '@tabler/icons-react';

import type { OemProductMapRow, WaferMapRow } from '@/db/types';
import type { WaferFileMetadata } from '@/types/Wafer';

// Card UI you provided
import { WaferFileMetadataCard } from '@/components/MetadataCard'; // <-- export your card file under this path or adjust

// ---------------- Default DB helpers (overridable via props) ----------------
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

// Your wafer_maps fetcher
async function defaultGetWaferMapsByTriple(
    product_id: string, batch_id: string, wafer_id: number
): Promise<WaferMapRow[]> {
    const { getWaferMapsByTriple } = await import('@/db/wafermaps');
    return getWaferMapsByTriple(product_id, batch_id, wafer_id);
}

// ---------------- Props ----------------
type Props = {
    initialProductId?: string;
    searchable?: boolean;
    // onSelectMapping?: (row: ProductDefectMapRow) => void;

    getAllOemProductMappings?: () => Promise<OemProductMapRow[]>;
    getBatchesByProductId?: (product_id: string) => Promise<{ lot_id: string }[]>;
    getWafersByProductAndBatch?: (product_id: string, lot_id: string) => Promise<{ wafer_id: string }[]>;
    getSubIdsByProductLotWafer?: (product_id: string, lot_id: string, wafer_id: string) => Promise<{ sub_id: string; file_path: string }[]>;
    getWaferMapsByTriple?: (product_id: string, batch_id: string, wafer_id: number) => Promise<any[]>;
};

export default function ProductBatchNavigator({
    initialProductId,
    searchable = true,
    // onSelectMapping,

    getAllOemProductMappings = defaultGetAllOemProductMappings,
    getBatchesByProductId = defaultGetBatchesByProductId,
    getWafersByProductAndBatch = defaultGetWafersByProductAndBatch,
    getSubIdsByProductLotWafer = defaultGetSubIdsByProductLotWafer,
    getWaferMapsByTriple = defaultGetWaferMapsByTriple,
}: Props) {
    // Selections
    const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId ?? null);
    const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
    const [selectedWaferId, setSelectedWaferId] = useState<string | null>(null);
    const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
    const [selectedOemId, setSelectedOemId] = useState<string | null>(null);

    // Column 1 state
    const [leftLoading, setLeftLoading] = useState(true);
    const [leftError, setLeftError] = useState<string | null>(null);
    const [mappings, setMappings] = useState<OemProductMapRow[]>([]);
    const [query, setQuery] = useState('');

    // Column 2 state
    const [batchesLoading, setBatchesLoading] = useState(false);
    const [batchesError, setBatchesError] = useState<string | null>(null);
    const [batches, setBatches] = useState<{ lot_id: string }[]>([]);

    // Column 3 state
    const [wafersLoading, setWafersLoading] = useState(false);
    const [wafersError, setWafersError] = useState<string | null>(null);
    const [wafers, setWafers] = useState<{ wafer_id: string }[]>([]);

    // Column 4 state
    const [subsLoading, setSubsLoading] = useState(false);
    const [subsError, setSubsError] = useState<string | null>(null);
    const [subRows, setSubRows] = useState<{ sub_id: string; file_path: string }[]>([]);

    // Wafer maps panel
    const [mapsLoading, setMapsLoading] = useState(false);
    const [mapsError, setMapsError] = useState<string | null>(null);
    const [waferMaps, setWaferMaps] = useState<any[]>([]);

    // ----- Load Column 1 once -----
    async function loadMappings() {
        setLeftLoading(true);
        setLeftError(null);
        try {
            const m = await getAllOemProductMappings();
            setMappings(m);
            // Fill OEM if initial product provided
            if (initialProductId && !selectedOemId) {
                const found = m.find(x => x.product_id === initialProductId);
                if (found) {
                    setSelectedOemId(found.oem_product_id);
                    setSelectedProductId
                    (found.product_id);
                }
            }
        } catch (e: any) {
            setLeftError(e?.message ?? 'Failed to load mappings');
        } finally {
            setLeftLoading(false);
        }
    }
    useEffect(() => { loadMappings(); /* eslint-disable-line */ }, []);

    // Search filter
    const filteredMappings = useMemo(() => {
        if (!query.trim()) return mappings;
        const q = query.toLowerCase();
        return mappings.filter(
            r =>
                r.oem_product_id.toLowerCase().includes(q) ||
                r.product_id.toLowerCase().includes(q)
        );
    }, [mappings, query]);

    // Product change → load batches, reset deeper
    useEffect(() => {
        setSelectedLotId(null);
        setSelectedWaferId(null);
        setSelectedSubId(null);
        setBatches([]);
        setWafers([]);
        setSubRows([]);
        setWaferMaps([]);
        setBatchesError(null);
        setWafersError(null);
        setSubsError(null);
        setMapsError(null);

        if (!selectedOemId) return;

        let cancel = false;
        setBatchesLoading(true);
        getBatchesByProductId(selectedOemId ?? '')
            .then(res => { if (!cancel) setBatches(res ?? []); })
            .catch(e => { if (!cancel) setBatchesError(e?.message ?? 'Failed to load batches'); })
            .finally(() => { if (!cancel) setBatchesLoading(false); });

        return () => { cancel = true; };
    }, [selectedOemId, getBatchesByProductId]);

    // (product, batch) change → load wafers, reset deeper
    useEffect(() => {
        setSelectedWaferId(null);
        setSelectedSubId(null);
        setWafers([]);
        setSubRows([]);
        setWaferMaps([]);
        setWafersError(null);
        setSubsError(null);
        setMapsError(null);

        if (!selectedOemId || !selectedLotId) return;

        let cancel = false;
        setWafersLoading(true);
        getWafersByProductAndBatch(selectedOemId, selectedLotId)
            .then(res => { if (!cancel) setWafers(res ?? []); })
            .catch(e => { if (!cancel) setWafersError(e?.message ?? 'Failed to load wafers'); })
            .finally(() => { if (!cancel) setWafersLoading(false); });

        return () => { cancel = true; };
    }, [selectedOemId, selectedLotId, getWafersByProductAndBatch]);

    // (product, batch, wafer) change → load sub_ids, reset maps
    useEffect(() => {
        setSelectedSubId(null);
        setSubRows([]);
        setWaferMaps([]);
        setSubsError(null);
        setMapsError(null);

        if (!selectedOemId || !selectedLotId || !selectedWaferId) return;

        let cancel = false;
        setSubsLoading(true);
        getSubIdsByProductLotWafer(selectedOemId, selectedLotId, selectedWaferId)
            .then(res => { if (!cancel) setSubRows(res ?? []); })
            .catch(e => { if (!cancel) setSubsError(e?.message ?? 'Failed to load sub IDs'); })
            .finally(() => { if (!cancel) setSubsLoading(false); });

        return () => { cancel = true; };
    }, [selectedOemId, selectedLotId, selectedWaferId, getSubIdsByProductLotWafer]);

    // sub_id pick → load wafer maps with your method
    async function loadWaferMaps(sub_id: string) {
        setSelectedSubId(sub_id);
        setWaferMaps([]);
        setMapsError(null);

        if (!selectedProductId || !selectedLotId || !selectedWaferId) return;

        const waferNum = Number(selectedWaferId);
        if (!Number.isFinite(waferNum)) {
            setMapsError('wafer_id is not numeric');
            return;
        }

        setMapsLoading(true);
        try {
            const res = await getWaferMapsByTriple(selectedProductId, selectedLotId, waferNum);
            setWaferMaps(res ?? []);
        } catch (e: any) {
            setMapsError(e?.message ?? 'Failed to load wafer maps');
        } finally {
            setMapsLoading(false);
        }
    }

    function pickOemProduct(row: OemProductMapRow) {
        setSelectedOemId(row.oem_product_id);
        setSelectedProductId
        (row.product_id);
    }

    // Map wafer_maps row -> WaferFileMetadata for your card
    function toWaferFileMetadata(r: any): WaferFileMetadata {
        return {
            filePath: r.file_path,
            productModel: r.product_id,
            batch: r.batch_id,            // your wafer_maps uses "batch_id"
            waferId: String(r.wafer_id),
            processSubStage: typeof r.sub_stage === 'number' ? r.sub_stage : undefined,
            retestCount: typeof r.retest_count === 'number' ? r.retest_count : undefined,
            time: r.time ?? undefined,
            stage: r.stage ?? undefined,
            lastModified: 0,      // unknown here; fill if you can join file_index
        };
    }

    return (
        <Stack gap="md">
            <Group align="start" gap="md" wrap="nowrap">
                {/* Column 1: OEM ↔ Product */}
                <Card withBorder radius="lg" w={360} p="sm" style={{ flexShrink: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>OEM ↔ Product</Title>
                        <Group gap={6}>
                            {searchable && (
                                <TextInput
                                    value={query}
                                    onChange={(e) => setQuery(e.currentTarget.value)}
                                    placeholder="Search OEM/Product..."
                                    leftSection={<IconSearch size={16} />}
                                    size="xs"
                                    w={200}
                                />
                            )}
                            <Tooltip label="Reload" withArrow>
                                <ActionIcon variant="light" onClick={loadMappings} aria-label="Reload">
                                    <IconRefresh size={16} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>

                    {leftError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{leftError}</Alert>}

                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false} horizontalSpacing="sm" verticalSpacing="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>OEM ID</Table.Th>
                                    <Table.Th>Product ID</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {leftLoading ? (
                                    <Table.Tr><Table.Td colSpan={2}><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : filteredMappings.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">No mappings</Text></Table.Td></Table.Tr>
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
                        <Text size="xs" c="dimmed">{filteredMappings.length} mapped</Text>
                        {selectedProductId && <Badge radius="sm" variant="light">Product: {selectedProductId}</Badge>}
                    </Group>
                </Card>

                {/* Column 2: Batches */}
                <Card withBorder radius="lg" w={240} p="sm" style={{ flexShrink: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>Batches</Title>
                        <Stack gap={0} align="end">
                            <Text size="xs" c="dimmed">Product</Text>
                            <Text size="sm" fw={600}>{selectedProductId ?? '—'}</Text>
                        </Stack>
                    </Group>
                    {batchesError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{batchesError}</Alert>}
                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead><Table.Tr><Table.Th>lot_id</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {batchesLoading ? (
                                    <Table.Tr><Table.Td><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedProductId ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">Select a product</Text></Table.Td></Table.Tr>
                                ) : batches.length === 0 ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">No batches</Text></Table.Td></Table.Tr>
                                ) : batches.map(b => {
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
                        <Text size="xs" c="dimmed">{selectedProductId ? `${batches.length} batch(es)` : '—'}</Text>
                    </Group>
                </Card>

                {/* Column 3: Wafers */}
                <Card withBorder radius="lg" w={220} p="sm" style={{ flexShrink: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>Wafers</Title>
                        <Stack gap={0} align="end">
                            <Text size="xs" c="dimmed">Batch</Text>
                            <Text size="sm" fw={600}>{selectedLotId ?? '—'}</Text>
                        </Stack>
                    </Group>
                    {wafersError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{wafersError}</Alert>}
                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead><Table.Tr><Table.Th>wafer_id</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {wafersLoading ? (
                                    <Table.Tr><Table.Td><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedLotId ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">Select a batch</Text></Table.Td></Table.Tr>
                                ) : wafers.length === 0 ? (
                                    <Table.Tr><Table.Td><Text c="dimmed" ta="center">No wafers</Text></Table.Td></Table.Tr>
                                ) : wafers.map(w => {
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
                        <Text size="xs" c="dimmed">{selectedLotId ? `${wafers.length} wafer(s)` : '—'}</Text>
                    </Group>
                </Card>

                {/* Column 4: Sub IDs */}
                <Card withBorder radius="lg" p="sm" style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" mb="xs">
                        <Title order={4}>Sub IDs</Title>
                        <Stack gap={0} align="end">
                            <Text size="xs" c="dimmed">Wafer</Text>
                            <Text size="sm" fw={600}>{selectedWaferId ?? '—'}</Text>
                        </Stack>
                    </Group>
                    {subsError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{subsError}</Alert>}
                    <ScrollArea h={480} offsetScrollbars>
                        <Table striped highlightOnHover withRowBorders={false}>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>sub_id</Table.Th>
                                    <Table.Th>file_path</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {subsLoading ? (
                                    <Table.Tr><Table.Td colSpan={2}><Group justify="center" p="md"><Loader size="sm" /></Group></Table.Td></Table.Tr>
                                ) : !selectedWaferId ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">Select a wafer</Text></Table.Td></Table.Tr>
                                ) : subRows.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" ta="center">No sub IDs</Text></Table.Td></Table.Tr>
                                ) : subRows.map(s => {
                                    const active = s.sub_id === selectedSubId;
                                    return (
                                        <Table.Tr
                                            key={s.sub_id}
                                            onClick={() => loadWaferMaps(s.sub_id)}
                                            style={{ cursor: 'pointer', background: active ? 'var(--mantine-color-blue-0)' : undefined }}
                                            title="Click to load wafer maps"
                                        >
                                            <Table.Td><Text fw={active ? 700 : 400}>{s.sub_id}</Text></Table.Td>
                                            <Table.Td><Text title={s.file_path}>{s.file_path}</Text></Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                    <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">
                            {selectedWaferId ? `${subRows.length} sub ID(s)` : '—'}
                        </Text>
                    </Group>
                </Card>
            </Group>

            {/* Wafer Maps panel (cards) */}
            <Card withBorder radius="lg" p="sm">
                <Group justify="space-between" mb="xs">
                    <Title order={4}>Wafer Maps</Title>
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">Selected</Text>
                        <Text size="sm" fw={600}>
                            {selectedProductId ?? '—'} / {selectedLotId ?? '—'} / {selectedWaferId ?? '—'} {selectedSubId ? ` / ${selectedSubId}` : ''}
                        </Text>
                    </Stack>
                </Group>

                {mapsError && <Alert color="red" icon={<IconAlertCircle size={16} />} mb="xs">{mapsError}</Alert>}

                {mapsLoading ? (
                    <Group justify="center" p="md"><Loader size="sm" /></Group>
                ) : !selectedProductId || !selectedLotId || !selectedWaferId || !selectedSubId ? (
                    <Text c="dimmed" ta="center">Select a sub_id to load wafer maps.</Text>
                ) : waferMaps.length === 0 ? (
                    <Text c="dimmed" ta="center">No wafer maps found for this selection.</Text>
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

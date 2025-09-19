import { useEffect, useMemo, useState } from 'react';
import {
    Title, Stack, Button, Group, Tooltip, Divider, Indicator, SegmentedControl,
    Text, Checkbox, Pagination, Select, Modal, ScrollArea, Table
} from '@mantine/core';
import { IconLoader, IconReload } from '@tabler/icons-react';

import Database from '@tauri-apps/plugin-sql';
import { useDispatch } from 'react-redux';

// Store
import { AppDispatch } from '@/store';
import { useAppSelector } from '@/hooks';
import { fetchWaferMetadata } from '@/slices/waferMetadataSlice';
import { advanceStepper } from '@/slices/preferencesSlice';
// DB
import { getDb } from '@/db';
import { getTriplesBySubIds } from '@/db/spreadSheet';
import { deleteAllFileIndexes } from '@/db/fileIndex';
import { deleteAllFolderIndexes } from '@/db/folderIndex';
// Cache
import { resetSessionFileIndexCache, resetSessionFolderIndexCache } from '@/utils/fs';
// Components
import RawWaferSummary from '@/components/RawWaferSummary';
// Utils
import { processNSyncExcelDataWithStats, processNSyncWaferDataWithStats } from '@/utils/wafer';
// Types
import { ExcelMetadata, WaferFileMetadata } from '@/types/wafer';
import { ConfigStepperState } from '@/types/stepper';
import { ExcelMetadataCard, WaferFileMetadataCard } from '@/components/MetadataCard';
import { AutoTriggers } from '@/types/preferences';
import AutoTrigger from '@/components/AutoTriggerSwitch';
import { infoToast } from '@/components/Toaster';
import { IngestReport } from '@/types/ingest';

export default function Preview() {
    const dispatch = useDispatch<AppDispatch>();
    const [mounted, setMounted] = useState<boolean>(false);

    const searchAutoTrigger = useAppSelector(s => s.preferences.autoTriggers.search);
    const ingestAutoTrigger = useAppSelector(s => s.preferences.autoTriggers.ingest);

    const stepper = useAppSelector((state) => state.preferences.stepper);
    const rawWaferMetadata = useAppSelector((state) => state.waferMetadata);

    const [db, setDb] = useState<Database | null>(null);
    const [loading, setLoading] = useState(false);
    const [ingestReport, setIngestReport] = useState<IngestReport | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailTitle, setDetailTitle] = useState<string>('');
    const [detailHeaders, setDetailHeaders] = useState<string[]>([]);
    const [detailRows, setDetailRows] = useState<string[][]>([]);

    const openDetailsTable = (title: string, headers: string[], rows: string[][]) => {
        setDetailTitle(title);
        setDetailHeaders(headers);
        setDetailRows(rows);
        setDetailOpen(true);
    };

    // Build table with (sub_id, oem_product_id, lot_id, wafer_id)
    const showSubIdTable = async (title: string, ids: string[]) => {
        if (!ids?.length) {
            openDetailsTable(title, ['衬底ID', 'OEM产品', '批次', '片号'], []);
            return;
        }
        try {
            const triples = await getTriplesBySubIds(ids);
            const byId = new Map(triples.map(r => [r.sub_id, r] as const));
            const rows = ids.map(id => {
                const t = byId.get(id);
                return [
                    id,
                    t?.oem_product_id ?? '',
                    t?.lot_id ?? '',
                    t?.wafer_id ?? '',
                ];
            });
            openDetailsTable(title, ['衬底ID', 'OEM产品', '批次', '片号'], rows);
        } catch {
            // Fallback to ID only
            openDetailsTable(title, ['衬底ID'], ids.map(id => [id]));
        }
    };

    // Write-throuch session cache
    const [ignoreSessionCache, setIgnoreSessionCache] = useState<boolean>(false);
    const [resetCache, setResetCache] = useState<boolean>(false);

    // Pagination & filter state
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [kind, setKind] = useState<'all' | 'excel' | 'wafer'>('all');

    // Build filtered items once
    const items = useMemo(() => {
        const all = rawWaferMetadata;
        if (kind === 'excel') return all.filter((r): r is ExcelMetadata => 'type' in r);
        if (kind === 'wafer') return all.filter((r): r is WaferFileMetadata => 'waferId' in r);
        return all;
    }, [rawWaferMetadata, kind]);

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageItems = useMemo(() => items.slice(start, end), [items, start, end]);

    // =========================================================================
    // NOTE: INIT
    // =========================================================================
    useEffect(() => {
        if (!mounted) {
            setMounted(true);
        }
    }, []);

    // =========================================================================
    // NOTE: METHODS
    // =========================================================================

    const handleLoadWaferMetadata = async () => {
        setLoading(true);
        try {
            if (!db) return;
            if (ignoreSessionCache) {
                // Clear the session file and folder caches
                await resetSessionFileIndexCache();
                await resetSessionFolderIndexCache();
                setIgnoreSessionCache(false);   // reset

                if (resetCache) {
                    await deleteAllFileIndexes();
                    await deleteAllFolderIndexes();
                    setResetCache(false);       // reset
                }
            }
            await dispatch(fetchWaferMetadata());
        } catch (err) {
            console.error('Load failed:', err);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Any files/folders that had defected changes will be reprocessed and upserted into the database.
     * @returns 
     */
    const handleSQLDataIngest = async () => {
        if (!db) return;
        setLoading(true);
        try {
            const excelRecords = rawWaferMetadata.filter((r): r is ExcelMetadata => 'type' in r);
            const waferRecords = rawWaferMetadata.filter((r): r is WaferFileMetadata => 'waferId' in r);

            let sum = 0;

            // 2) batch‐upsert in one transaction
            const excelStats = await processNSyncExcelDataWithStats(excelRecords);
            const waferStats = await processNSyncWaferDataWithStats(waferRecords);
            sum += excelStats.productDefects.inserted + excelStats.productDefects.updated;
            sum += excelStats.substrateDefects.inserted + excelStats.substrateDefects.updated;
            sum += waferStats.inserted + waferStats.updated;

            setIngestReport({
                productDefects: excelStats.productDefects,
                substrateDefects: excelStats.substrateDefects,
                waferMaps: waferStats,
            });

            if (sum === 0) {
                infoToast({
                    title: '数据摄取结果',
                    message: '没有新增或更新的记录',
                });
            } else {
                infoToast({
                    title: '数据摄取结果',
                    message: `数据库已更新，共写入 ${sum} 条记录`,
                    lines: [
                        { label: 'Excel(产品缺陷)', value: excelStats.productDefects.unique },
                        { label: 'Excel(衬底缺陷)', value: excelStats.substrateDefects.unique },
                        { label: 'Wafer', value: waferStats.unique },
                    ],
                });
            }

            // 3) advance to next step
            await dispatch(advanceStepper(ConfigStepperState.Database + 1));
        } catch (err) {
            console.error('Sync failed:', err);
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // NOTE: REACT
    // =========================================================================
    useEffect(() => {
        if (!mounted) return;

        // Init DB connection on first load
        if (!db) {
            const connectDB = async () => setDb(await getDb());
            connectDB();
        }

        if (db) {
            const tasks = async () => {
                // Triggers when mounted or db changes
                if (searchAutoTrigger && stepper >= ConfigStepperState.Metadata)
                    await handleLoadWaferMetadata();
                if (ingestAutoTrigger)
                    await handleSQLDataIngest();
            }
            tasks();
        }
    }, [mounted, db]);

    // Reset page when deps change
    useEffect(() => {
        setPage(1);
    }, [rawWaferMetadata, kind, pageSize]);

    return (
        <Stack>
            <Title order={2}>元文件数据信息</Title>

            <Group align="center" gap="sm">
                <SegmentedControl
                    value={ignoreSessionCache ? 'force' : 'cache'}
                    onChange={(v) => setIgnoreSessionCache(v === 'force')}
                    data={[
                        { label: '使用缓存', value: 'cache' },
                        { label: '重扫（写穿缓存）', value: 'force' },
                    ]}
                    disabled={loading}
                />
                <Tooltip
                    label={
                        ignoreSessionCache
                            ? '清空已有的缓冲，然后重新扫描并刷新缓存（数据库不变）'
                            : '优先使用已有缓存（更快）'
                    }
                    withArrow
                >
                    <Indicator
                        disabled={!(stepper <= ConfigStepperState.Metadata)}
                        processing
                        color="red"
                        offset={2}
                        position="top-end"
                        size={8}
                    >
                        <Button
                            fullWidth
                            disabled={stepper < ConfigStepperState.Metadata}
                            variant="light"
                            color="blue"
                            leftSection={<IconLoader size={16} />}
                            loading={loading}
                            onClick={handleLoadWaferMetadata}
                        >
                            加载/刷新
                        </Button>
                    </Indicator>
                </Tooltip>

                <Checkbox
                    label="重置缓存"
                    checked={resetCache}
                    onChange={(event) => setResetCache(event.currentTarget.checked)}
                    disabled={loading || !ignoreSessionCache}
                />

                <AutoTrigger type={AutoTriggers.search} />
            </Group>

            <RawWaferSummary description="新/修改过的数据" />

            <Group flex="1 auto">
                <Tooltip label="将未知数据添加进数据库（手动）" withArrow>
                    <Indicator
                        disabled={!(stepper <= ConfigStepperState.Database)}
                        processing
                        color="red"
                        offset={2}
                        position="top-end"
                        size={8}
                    >
                        <Button
                            disabled={stepper < ConfigStepperState.Database}
                            fullWidth
                            variant="light"
                            color="blue"
                            leftSection={<IconReload size={16} />}
                            loading={loading}
                            onClick={handleSQLDataIngest}
                        >
                            同步数据库
                        </Button>
                    </Indicator>
                </Tooltip>

                <AutoTrigger type={AutoTriggers.ingest} />
            </Group>

            <Divider />

            {/* Duplicates/details modal */}
            <Modal opened={detailOpen} onClose={() => setDetailOpen(false)} title={detailTitle} size="lg">
                <ScrollArea h={420} type="auto" offsetScrollbars>
                    {detailRows.length ? (
                        <Table striped highlightOnHover withTableBorder withColumnBorders stickyHeader>
                            <Table.Thead>
                                <Table.Tr>
                                    {detailHeaders.map((h) => (
                                        <Table.Th key={h}>{h}</Table.Th>
                                    ))}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {detailRows.map((r, i) => (
                                    <Table.Tr key={i}>
                                        {r.map((c, j) => (
                                            <Table.Td key={j} style={{ wordBreak: 'break-all' }}>{c}</Table.Td>
                                        ))}
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    ) : (
                        <Text size="sm" c="dimmed">暂无数据</Text>
                    )}
                </ScrollArea>
            </Modal>

            {total ? (
                <Group align="flex-start" wrap="nowrap" gap="xl">
                    <Stack flex={1} style={{ minWidth: 0 }}>
                        <Group justify="space-between" align="center">
                            <Title order={3}>新数据</Title>
                            <Group gap="sm" align="center">
                                <SegmentedControl
                                    value={kind}
                                    onChange={(v) => setKind(v as typeof kind)}
                                    data={[
                                        { label: '全部', value: 'all' },
                                        { label: '衬底', value: 'excel' },
                                        { label: 'Wafer', value: 'wafer' },
                                    ]}
                                />
                            </Group>
                        </Group>

                        <Group justify="space-between" align="center" mt="xs">
                            <Text c="dimmed" size="sm">
                                显示 {total ? start + 1 : 0}-{end} / {total}
                            </Text>
                            <Group gap="sm" align="center">
                                <Select
                                    w={120}
                                    value={String(pageSize)}
                                    onChange={(v) => setPageSize(Number(v ?? 20))}
                                    data={['10', '20', '50', '100']}
                                    label="每页"
                                />
                                <Pagination total={totalPages} value={page} onChange={setPage} />
                            </Group>
                        </Group>

                        {/* Page content */}
                        <Stack mt="sm">
                            {pageItems.map((r) =>
                                'type' in r ? (
                                    <ExcelMetadataCard key={r.filePath} data={r} onClick={() => open(r.filePath)} />
                                ) : (
                                    <WaferFileMetadataCard key={r.filePath} data={r} />
                                )
                            )}
                        </Stack>

                        {/* Pagination moved to top; bottom pager removed per request */}
                    </Stack>

                    {/* Right-side status panel */}
                    <Stack w={360} miw={280} p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
                        <Title order={3}>状态</Title>
                        {ingestReport ? (
                            <>
                                <Text fw={600}>产品缺陷 (Excel)</Text>
                                <Group gap={8}>
                                    <Text size="sm" c="dimmed">输入: {ingestReport.productDefects?.input ?? 0}，唯一: {ingestReport.productDefects?.unique ?? 0}，重复: {ingestReport.productDefects?.duplicates ?? 0}</Text>
                                    {(ingestReport.productDefects?.duplicates ?? 0) > 0 && (
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            onClick={() => openDetailsTable(
                                                '重复的产品缺陷键',
                                                ['OEM产品', '批次', '片号'],
                                                (ingestReport.productDefects?.duplicateKeys ?? []).map(k => [k.oem_product_id, k.lot_id, k.wafer_id])
                                            )}
                                        >查看</Button>
                                    )}
                                </Group>
                                <Text size="sm">已存在: {ingestReport.productDefects?.existing ?? 0}</Text>
                                <Text size="sm">插入: {ingestReport.productDefects?.inserted ?? 0}</Text>
                                <Text size="sm">更新: {ingestReport.productDefects?.updated ?? 0}</Text>
                                {Boolean(ingestReport.productDefects && ((ingestReport.productDefects.insertedKeys?.length ?? 0) || (ingestReport.productDefects.updatedKeys?.length ?? 0))) && (
                                    <Stack gap={4} mt={6}>
                                        {(ingestReport.productDefects?.insertedKeys?.length ?? 0) > 0 && (
                                            <Group gap={6}>
                                                <Text size="xs" c="dimmed">插入条目示例: {(ingestReport.productDefects?.insertedKeys ?? []).slice(0, 5).map(k => `${k.oem_product_id}|${k.lot_id}|${k.wafer_id}`).join(', ')}{(ingestReport.productDefects?.insertedKeys?.length ?? 0) > 5 ? ' …' : ''}</Text>
                                                <Button size="xs" variant="subtle" onClick={() => openDetailsTable(
                                                    '所有插入（产品缺陷）',
                                                    ['OEM产品', '批次', '片号'],
                                                    (ingestReport.productDefects?.insertedKeys ?? []).map(k => [k.oem_product_id, k.lot_id, k.wafer_id])
                                                )}>更多</Button>
                                            </Group>
                                        )}
                                        {(ingestReport.productDefects?.updatedKeys?.length ?? 0) > 0 && (
                                            <Group gap={6}>
                                                <Text size="xs" c="dimmed">更新条目示例: {(ingestReport.productDefects?.updatedKeys ?? []).slice(0, 5).map(k => `${k.oem_product_id}|${k.lot_id}|${k.wafer_id}`).join(', ')}{(ingestReport.productDefects?.updatedKeys?.length ?? 0) > 5 ? ' …' : ''}</Text>
                                                <Button size="xs" variant="subtle" onClick={() => openDetailsTable(
                                                    '所有更新（产品缺陷）',
                                                    ['OEM产品', '批次', '片号'],
                                                    (ingestReport.productDefects?.updatedKeys ?? []).map(k => [k.oem_product_id, k.lot_id, k.wafer_id])
                                                )}>更多</Button>
                                            </Group>
                                        )}
                                    </Stack>
                                )}

                                <Divider my="sm" />

                                <Text fw={600}>衬底缺陷 (Excel)</Text>
                                <Group gap={8}>
                                    <Text size="sm" c="dimmed">输入: {ingestReport.substrateDefects?.input ?? 0}，唯一: {ingestReport.substrateDefects?.unique ?? 0}，重复: {ingestReport.substrateDefects?.duplicates ?? 0}</Text>
                                    {(ingestReport.substrateDefects?.duplicates ?? 0) > 0 && (
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            onClick={() => showSubIdTable('重复的衬底ID', ingestReport.substrateDefects?.duplicateIds ?? [])}
                                        >查看</Button>
                                    )}
                                </Group>
                                <Text size="sm">已存在: {ingestReport.substrateDefects?.existing ?? 0}</Text>
                                <Text size="sm">插入: {ingestReport.substrateDefects?.inserted ?? 0}</Text>
                                <Text size="sm">更新: {ingestReport.substrateDefects?.updated ?? 0}</Text>
                                {Boolean(ingestReport.substrateDefects && ((ingestReport.substrateDefects.insertedIds?.length ?? 0) || (ingestReport.substrateDefects.updatedIds?.length ?? 0))) && (
                                    <Stack gap={4} mt={6}>
                                        {(ingestReport.substrateDefects?.insertedIds?.length ?? 0) > 0 && (
                                            <Group gap={6}>
                                                <Text size="xs" c="dimmed">插入ID示例: {(ingestReport.substrateDefects?.insertedIds ?? []).slice(0, 5).join(', ')}{(ingestReport.substrateDefects?.insertedIds?.length ?? 0) > 5 ? ' …' : ''}</Text>
                                                <Button size="xs" variant="subtle" onClick={() => showSubIdTable('所有插入（衬底缺陷）', ingestReport.substrateDefects?.insertedIds ?? [])}>更多</Button>
                                            </Group>
                                        )}
                                        {(ingestReport.substrateDefects?.updatedIds?.length ?? 0) > 0 && (
                                            <Group gap={6}>
                                                <Text size="xs" c="dimmed">更新ID示例: {(ingestReport.substrateDefects?.updatedIds ?? []).slice(0, 5).join(', ')}{(ingestReport.substrateDefects?.updatedIds?.length ?? 0) > 5 ? ' …' : ''}</Text>
                                                <Button size="xs" variant="subtle" onClick={() => showSubIdTable('所有更新（衬底缺陷）', ingestReport.substrateDefects?.updatedIds ?? [])}>更多</Button>
                                            </Group>
                                        )}
                                    </Stack>
                                )}

                                <Divider my="sm" />

                                <Text fw={600}>Wafer 地图</Text>
                                <Group gap={8}>
                                    <Text size="sm" c="dimmed">输入: {ingestReport.waferMaps?.input ?? 0}，唯一: {ingestReport.waferMaps?.unique ?? 0}，重复: {ingestReport.waferMaps?.duplicates ?? 0}</Text>
                                    {(ingestReport.waferMaps?.duplicates ?? 0) > 0 && (
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            onClick={() => openDetailsTable(
                                                '重复的Wafer文件',
                                                ['文件名', '路径'],
                                                (ingestReport.waferMaps?.duplicateFiles ?? []).map(p => {
                                                    const parts = p.split(/\\\\|\//);
                                                    const name = parts[parts.length - 1] ?? p;
                                                    return [name, p];
                                                })
                                            )}
                                        >查看</Button>
                                    )}
                                </Group>
                                <Text size="sm">已存在: {ingestReport.waferMaps?.existing ?? 0}</Text>
                                <Text size="sm">插入: {ingestReport.waferMaps?.inserted ?? 0}</Text>
                                <Text size="sm">更新: {ingestReport.waferMaps?.updated ?? 0}</Text>
                                {Boolean(ingestReport.waferMaps && ((ingestReport.waferMaps.insertedFiles?.length ?? 0) || (ingestReport.waferMaps.updatedFiles?.length ?? 0))) && (
                                    <Stack gap={4} mt={6}>
                                        {(ingestReport.waferMaps?.insertedFiles?.length ?? 0) > 0 && (
                                            <Group gap={6}>
                                                <Text size="xs" c="dimmed">插入文件示例: {(ingestReport.waferMaps?.insertedFiles ?? []).slice(0, 5).map(p => (p.split(/\\\\|\//).pop() ?? p)).join(', ')}{(ingestReport.waferMaps?.insertedFiles?.length ?? 0) > 5 ? ' …' : ''}</Text>
                                                <Button size="xs" variant="subtle" onClick={() => openDetailsTable(
                                                    '所有插入（Wafer）',
                                                    ['文件名', '路径'],
                                                    (ingestReport.waferMaps?.insertedFiles ?? []).map(p => {
                                                        const parts = p.split(/\\\\|\//);
                                                        const name = parts[parts.length - 1] ?? p;
                                                        return [name, p];
                                                    })
                                                )}>更多</Button>
                                            </Group>
                                        )}
                                        {(ingestReport.waferMaps?.updatedFiles?.length ?? 0) > 0 && (
                                            <Group gap={6}>
                                                <Text size="xs" c="dimmed">更新文件示例: {(ingestReport.waferMaps?.updatedFiles ?? []).slice(0, 5).map(p => (p.split(/\\\\|\//).pop() ?? p)).join(', ')}{(ingestReport.waferMaps?.updatedFiles?.length ?? 0) > 5 ? ' …' : ''}</Text>
                                                <Button size="xs" variant="subtle" onClick={() => openDetailsTable(
                                                    '所有更新（Wafer）',
                                                    ['文件名', '路径'],
                                                    (ingestReport.waferMaps?.updatedFiles ?? []).map(p => {
                                                        const parts = p.split(/\\\\|\//);
                                                        const name = parts[parts.length - 1] ?? p;
                                                        return [name, p];
                                                    })
                                                )}>更多</Button>
                                            </Group>
                                        )}
                                    </Stack>
                                )}
                            </>
                        ) : (
                            <Text c="dimmed">尚未同步，执行“同步数据库”后显示。</Text>
                        )}
                    </Stack>
                </Group>
            ) : (
                <Text>暂无新数据</Text>
            )}
        </Stack>
    );
}

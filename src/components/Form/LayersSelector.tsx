import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Checkbox, Group, Stack, Text, Title } from '@mantine/core';
import { useAppSelector } from '@/hooks';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store';
import { setLayerSelection } from '@/slices/job';
import type { WaferMapRow } from '@/db/types';
import { DataSourceType } from '@/types/dataSource';
import { getWaferMapsByTriple } from '@/db/wafermaps';

export type LayerChoice = {
    includeSubstrate: boolean;
    maps: WaferMapRow[]; // one per stage/sub-stage (highest retest chosen)
};

function stageLabel(stage: string | DataSourceType, subStage?: string | null) {
    switch (stage as DataSourceType) {
        case DataSourceType.FabCp:
            return 'FB';
        case DataSourceType.Wlbi:
            return 'WLBI';
        case DataSourceType.Aoi:
            return 'AOI';
        case DataSourceType.CpProber: {
            const n = (subStage ?? '').toString().trim();
            return `CP${n ? ` ${n}` : ''}`;
        }
        default:
            return String(stage ?? 'UNKNOWN').toUpperCase();
    }
}

// Group maps by (stage, sub_stage) and pick the one with highest retest_count
function pickHighestRetestPerGroup(rows: WaferMapRow[]): WaferMapRow[] {
    const byKey = new Map<string, WaferMapRow>();
    for (const r of rows) {
        const key = `${String(r.stage).toLowerCase()}|${r.sub_stage ?? ''}`;
        const cur = byKey.get(key);
        if (!cur || (r.retest_count ?? 0) > (cur.retest_count ?? 0)) byKey.set(key, r);
    }
    return Array.from(byKey.values());
}

export default function LayersSelector({ onChange }: { onChange?: (sel: LayerChoice) => void }) {
    const job = useAppSelector((s) => s.stackingJob);
    const dispatch = useDispatch<AppDispatch>();
    const { productId, batchId, waferId, waferMaps, waferSubstrate, subId, includeSubstrateSelected, selectedLayerKeys } = job;

    // Fetch fresh wafer maps from DB for the current triple to show all available layers
    const [dbMaps, setDbMaps] = useState<WaferMapRow[]>(waferMaps);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (productId && batchId && typeof waferId === 'number' && Number.isFinite(waferId)) {
                    const rows = await getWaferMapsByTriple(productId, batchId, waferId);
                    if (!cancelled) setDbMaps(rows);
                } else {
                    // fallback to job-provided maps when triple incomplete
                    if (!cancelled) setDbMaps(waferMaps);
                }
            } catch {
                if (!cancelled) setDbMaps(waferMaps);
            }
        })();
        return () => { cancelled = true; };
    }, [productId, batchId, waferId, waferMaps]);

    // Reverse display order (substrate checkbox stays on top separately)
    const candidates = useMemo(() => pickHighestRetestPerGroup(dbMaps).reverse(), [dbMaps]);

    // selection state
    const keyOf = (r: WaferMapRow) => {
        const stage = String(r.stage ?? '').toLowerCase();
        const sub = r.sub_stage == null ? '' : String(r.sub_stage);
        return `${stage}|${sub}`;
    };
    const defaultKeys = useMemo(() => candidates.map((r) => String(keyOf(r))), [candidates]);
    const initialCheckedKeys = useMemo(() => {
        // Preserve intentional empty selection; only fallback when undefined
        const keys = (selectedLayerKeys !== undefined) ? selectedLayerKeys : defaultKeys;
        const candidateSet = new Set(defaultKeys);
        return keys.filter(k => candidateSet.has(String(k)));
    }, [selectedLayerKeys, defaultKeys]);

    const [includeSub, setIncludeSub] = useState<boolean>(
        typeof includeSubstrateSelected === 'boolean' ? includeSubstrateSelected : !!waferSubstrate
    );
    const [checkedIds, setCheckedIds] = useState<Set<number | string>>(() => new Set(initialCheckedKeys));

    const lastJobSigRef = useRef<string>('');

    useEffect(() => {
        // derive current job selection (normalized) and a signature of job+candidates
        const candidateKeys = candidates.map((r) => String(keyOf(r)));
        const jobInclude = (typeof includeSubstrateSelected === 'boolean') ? includeSubstrateSelected : !!waferSubstrate;
        // Preserve intentional empty selection; only fallback when undefined
        const jobBaseKeys = (selectedLayerKeys !== undefined) ? selectedLayerKeys : candidateKeys;
        const jobValidKeys = jobBaseKeys.filter((k) => candidateKeys.includes(String(k))).map(String);
        const jobSig = `${jobInclude ? 1 : 0}#${jobValidKeys.slice().sort().join('|')}#${candidateKeys.join('|')}`;

        // If job/candidates changed since last sync, update locals to match and exit
        if (lastJobSigRef.current !== jobSig) {
            lastJobSigRef.current = jobSig;
            if (includeSub !== jobInclude) setIncludeSub(jobInclude);
            const sameSet = jobValidKeys.length === checkedIds.size && jobValidKeys.every((k) => checkedIds.has(k));
            if (!sameSet) setCheckedIds(new Set(jobValidKeys));
            return;
        }

        // Otherwise, publish local changes when they differ from job
        const localKeys = Array.from(checkedIds).map(String).filter((k) => candidateKeys.includes(k)).sort();
        const jobKeysSorted = jobValidKeys.slice().sort();
        const sameInclude = includeSub === jobInclude;
        const sameKeys = localKeys.length === jobKeysSorted.length && localKeys.every((k, i) => k === jobKeysSorted[i]);

        const selected = candidates.filter((r) => checkedIds.has(keyOf(r)));
        onChange?.({ includeSubstrate: includeSub, maps: selected });

        if (!(sameInclude && sameKeys)) {
            dispatch(setLayerSelection({ includeSubstrate: includeSub, selectedLayerKeys: localKeys }));
        }
    }, [
        waferSubstrate,
        includeSubstrateSelected,
        selectedLayerKeys,
        candidates,
        includeSub,
        checkedIds,
        dispatch,
        onChange,
    ]);

    return (
        <Card withBorder radius="lg" p="sm">
            <Stack gap="sm">
                <Title order={5}>选择参与叠图的图层</Title>
                <Stack gap={4}>
                    <Checkbox
                        checked={includeSub}
                        onChange={(e) => setIncludeSub(e.currentTarget.checked)}
                        label={`Substrate${subId ? ` / ${subId}` : ''}`}
                        disabled={!waferSubstrate}
                    />

                    {candidates.length === 0 ? (
                        <Text size="sm" c="dimmed">暂无工序图层</Text>
                    ) : (
                        candidates.map((r) => {
                            const id = keyOf(r);
                            const label = stageLabel(r.stage, r.sub_stage);
                            const checked = checkedIds.has(id);
                            return (
                                <Checkbox
                                    key={String(id)}
                                    checked={checked}
                                    onChange={(e) => {
                                        const next = new Set(checkedIds);
                                        if (e.currentTarget.checked) next.add(id); else next.delete(id);
                                        setCheckedIds(next);
                                    }}
                                    label={
                                        <Group gap={6} wrap="nowrap">
                                            <Text>{label}</Text>
                                            {(r.retest_count ?? 0) !== 0 && (
                                                <Text c="dimmed" size="sm">({r.retest_count})</Text>
                                            )}
                                        </Group>
                                    }
                                />
                            );
                        })
                    )}
                </Stack>
            </Stack>
        </Card>
    );
}

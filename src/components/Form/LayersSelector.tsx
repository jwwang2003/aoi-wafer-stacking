import { useEffect, useMemo, useState } from 'react';
import { Card, Checkbox, Group, Stack, Text, Title } from '@mantine/core';
import { useAppSelector } from '@/hooks';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store';
import { setLayerSelection } from '@/slices/job';
import type { WaferMapRow } from '@/db/types';
import { DataSourceType } from '@/types/dataSource';

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
    const { waferMaps, waferSubstrate, subId } = job;

    const candidates = useMemo(() => pickHighestRetestPerGroup(waferMaps), [waferMaps]);

    // selection state
    const [includeSub, setIncludeSub] = useState<boolean>(!!waferSubstrate);
    const [checkedIds, setCheckedIds] = useState<Set<number | string>>(() => new Set(candidates.map((r) => r.idx ?? `${r.stage}|${r.sub_stage}`)));

    useEffect(() => {
        // reset when source changes
        setIncludeSub(!!waferSubstrate);
        setCheckedIds(new Set(candidates.map((r) => r.idx ?? `${r.stage}|${r.sub_stage}`)));
    }, [waferSubstrate, candidates]);

    useEffect(() => {
        const selected = candidates.filter((r) => checkedIds.has(r.idx ?? `${r.stage}|${r.sub_stage}`));
        onChange?.({ includeSubstrate: includeSub, maps: selected });
        // Publish selection to Redux so JobManager can respect it when enqueuing
        const keys = selected.map((r) => String(r.idx ?? `${r.stage}|${r.sub_stage}`));
        dispatch(setLayerSelection({ includeSubstrate: includeSub, selectedLayerKeys: keys }));
    }, [includeSub, checkedIds, candidates, onChange, dispatch]);

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
                            const id = r.idx ?? `${r.stage}|${r.sub_stage}`;
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

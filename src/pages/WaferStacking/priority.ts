import { DataSourceType } from '@/types/dataSource';

export const PASS_VALUES = new Set(['1', 'G', 'H', 'I', 'J']);

export type LayerMeta = {
    stage: DataSourceType;
    subStage?: string | number | null; // e.g. "1" / 1 / "CP-2"
    retest_count?: number | null;
    time?: number | null;              // epoch ms
};

type PriorityRule = {
    id: string;
    score: number;                     // higher = better
    when: (m: LayerMeta) => boolean;
};

// Extract first numeric token from subStage, else undefined
const subStageNum = (s: LayerMeta['subStage']): number | undefined => {
    if (s == null) return undefined;
    const m = String(s).match(/-?\d+(\.\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
};

/**
 * Priority model (higher score wins):
 *  CP2 (CpProber + subStage=2) > WLBI > CP1 (CpProber + subStage=1) > CP3 (FabCp) > AOI
 */
export const PRIORITY_RULES: PriorityRule[] = [
    { id: 'CP2', score: 6, when: m => m.stage === DataSourceType.CpProber && subStageNum(m.subStage) === 2 },
    { id: 'WLBI', score: 5, when: m => m.stage === DataSourceType.Wlbi },
    { id: 'CP1', score: 4, when: m => m.stage === DataSourceType.CpProber && subStageNum(m.subStage) === 1 },
    { id: 'FAB CP', score: 3, when: m => m.stage === DataSourceType.FabCp }, // aka fabCP
    { id: 'Substrate', score: 2, when: m => m.stage === DataSourceType.Substrate },
    { id: 'AOI', score: 1, when: m => m.stage === DataSourceType.Aoi },
];

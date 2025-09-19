import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { SubstrateDefectRow, WaferMapRow } from '@/db/types';

export interface WaferState {
    oemProductId: string;

    // triple + sub
    productId: string;
    batchId: string;
    waferId: number | null;
    subId: string;

    waferSubstrate: SubstrateDefectRow | null;
    waferMaps: WaferMapRow[];
    includeSubstrateSelected?: boolean;
    selectedLayerKeys?: string[];
}

export type JobStatus = 'queued' | 'active' | 'done' | 'error';

export interface JobItem extends WaferState {
    id: string;
    name?: string;
    note?: string;
    createdAt: number;
    status: JobStatus;
}

interface JobsState extends WaferState {
    queue: JobItem[];
    activeId: string | null;
}

const initialState: JobsState = {
    oemProductId: '',
    productId: '',
    batchId: '',
    waferId: null,
    subId: '',
    waferSubstrate: null,
    waferMaps: [],
    includeSubstrateSelected: false,
    selectedLayerKeys: [],
    queue: [],
    activeId: null,
};

// ---- helpers ----
function stagePriority(stage: WaferMapRow['stage']): number {
    const s = String(stage ?? '').toLowerCase();
    if (s.includes('cp') || s === 'cpprober' || s === 'fabcp') return 0; // CP family first
    if (s === 'wlbi') return 1;
    if (s === 'aoi') return 2;
    return 3; // unknowns last
}

// Extract a numeric key from sub_stage if present; otherwise fall back to text.
// Empty/undefined sub_stage sorts BEFORE others (treated as -Infinity).
function subStageKey(subStage: WaferMapRow['sub_stage']) {
    if (subStage == null || String(subStage).trim() === '') {
        return { num: Number.NEGATIVE_INFINITY, text: '' }; // empty first
    }
    const s = String(subStage);
    const m = s.match(/-?\d+(\.\d+)?/); // first number in the string
    if (m) {
        const num = Number(m[0]);
        if (!Number.isNaN(num)) return { num, text: s.toLowerCase() };
    }
    return { num: null as number | null, text: s.toLowerCase() };
}

function sortWaferMaps(maps: WaferMapRow[]): WaferMapRow[] {
    return maps.slice().sort((a, b) => {
        // 1) stage priority
        const sp = stagePriority(a.stage) - stagePriority(b.stage);
        if (sp !== 0) return sp;

        // 2) retest_count DESC (high → low)
        const rc = (b.retest_count ?? 0) - (a.retest_count ?? 0);
        if (rc !== 0) return rc;

        // 3) sub_stage ASC (low → high), numeric-aware
        const ak = subStageKey(a.sub_stage);
        const bk = subStageKey(b.sub_stage);

        // numeric first when both numeric or one is numeric
        if (ak.num != null && bk.num != null) return ak.num - bk.num;
        if (ak.num != null && bk.num == null) return -1;
        if (ak.num == null && bk.num != null) return 1;

        // both non-numeric → lexical
        return ak.text.localeCompare(bk.text, undefined, { numeric: true, sensitivity: 'base' });
    });
}

// Build a stable selection key for a wafer map row based on stage+sub_stage only
function layerKey(r: WaferMapRow): string {
    const stage = String(r.stage ?? '').toLowerCase();
    const sub = r.sub_stage == null ? '' : String(r.sub_stage);
    return `${stage}|${sub}`;
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

function extractTriple(maps: WaferMapRow[] | undefined) {
    if (!maps?.length) return { productId: '', batchId: '', waferId: null as number | null };
    // assume already sorted before calling
    const m0 = maps[0];
    return {
        productId: m0.product_id ?? '',
        batchId: m0.batch_id ?? '',
        waferId: typeof m0.wafer_id === 'number' ? m0.wafer_id : Number(m0.wafer_id ?? NaN) || null,
    };
}

const stackingJobSlice = createSlice({
    name: 'wafer',
    initialState,
    reducers: {
        // Set whole job; can override values explicitly
        setJob(
            state,
            action: PayloadAction<{
                substrate: SubstrateDefectRow | null;
                maps: WaferMapRow[];
                oemProductId?: string;
                productId?: string;
                batchId?: string;
                waferId?: number | null;
                subId?: string;
            }>
        ) {
            state.waferSubstrate = action.payload.substrate;

            // sort maps: CP -> WLBI -> AOI -> others
            const sorted = sortWaferMaps(action.payload.maps);
            state.waferMaps = sorted;

            // default selection: include substrate if provided, select all candidate layers
            state.includeSubstrateSelected = !!action.payload.substrate;
            const candidates = pickHighestRetestPerGroup(sorted);
            state.selectedLayerKeys = candidates.map((r) => layerKey(r));

            if (typeof action.payload.oemProductId === 'string') {
                state.oemProductId = action.payload.oemProductId;
            }

            const derived = extractTriple(sorted);
            state.productId = action.payload.productId ?? derived.productId;
            state.batchId = action.payload.batchId ?? derived.batchId;
            state.waferId = (action.payload.waferId ?? derived.waferId) as number | null;

            // derive sub_id from substrate if not explicitly given
            state.subId = action.payload.subId ?? action.payload.substrate?.sub_id ?? '';
        },

        setJobSubstrate(state, action: PayloadAction<SubstrateDefectRow | null>) {
            state.waferSubstrate = action.payload;
            if (action.payload?.sub_id) state.subId = action.payload.sub_id;
        },

        setJobMaps(state, action: PayloadAction<WaferMapRow[]>) {
            const sorted = sortWaferMaps(action.payload);
            state.waferMaps = sorted;
            const { productId, batchId, waferId } = extractTriple(sorted);
            state.productId = productId;
            state.batchId = batchId;
            state.waferId = waferId;
            // reset selection to all candidate layers when maps change
            const candidates = pickHighestRetestPerGroup(sorted);
            state.selectedLayerKeys = candidates.map((r) => layerKey(r));
        },

        addJobMaps(state, action: PayloadAction<WaferMapRow[]>) {
            state.waferMaps.push(...action.payload);
            state.waferMaps = sortWaferMaps(state.waferMaps);
            // re-derive triple from new first element
            const { productId, batchId, waferId } = extractTriple(state.waferMaps);
            state.productId = productId;
            state.batchId = batchId;
            state.waferId = waferId;
        },

        setJobOemProductId(state, action: PayloadAction<string>) {
            state.oemProductId = action.payload;
        },
        setJobProductId(state, action: PayloadAction<string>) {
            state.productId = action.payload;
        },
        setJobBatchId(state, action: PayloadAction<string>) {
            state.batchId = action.payload;
        },
        setJobWaferId(state, action: PayloadAction<number | null>) {
            state.waferId = action.payload;
        },
        setJobSubId(state, action: PayloadAction<string>) {
            state.subId = action.payload;
        },

        clearJob(state) {
            state.oemProductId = '';
            state.productId = '';
            state.batchId = '';
            state.waferId = null;
            state.subId = '';
            state.waferSubstrate = null;
            state.waferMaps = [];
            state.includeSubstrateSelected = false;
            state.selectedLayerKeys = [];
        },

        // ===== Queue management =====
        queueAddFromCurrent(state, action: PayloadAction<{ name?: string; note?: string } | undefined>) {
            const id = uuidv4();
            // Determine selected layers from current state; default to all candidates
            const candidates = pickHighestRetestPerGroup(state.waferMaps);
            const selectedKeys = new Set((state.selectedLayerKeys && state.selectedLayerKeys.length > 0)
                ? state.selectedLayerKeys
                : candidates.map((r) => layerKey(r))
            );
            const selectedMaps = candidates.filter((r) => selectedKeys.has(layerKey(r)));
            const job: JobItem = {
                id,
                name: action.payload?.name ?? undefined,
                note: action.payload?.note ?? undefined,
                createdAt: Date.now(),
                status: 'queued',
                oemProductId: state.oemProductId,
                productId: state.productId,
                batchId: state.batchId,
                waferId: state.waferId,
                subId: state.subId,
                waferSubstrate: state.includeSubstrateSelected ? state.waferSubstrate : null,
                waferMaps: selectedMaps,
            };
            state.queue.push(job);
        },
        queueAddJob(state, action: PayloadAction<Omit<JobItem, 'id' | 'createdAt' | 'status'>>) {
            const id = uuidv4();
            const payload = action.payload;
            const job: JobItem = {
                ...payload,
                id,
                createdAt: Date.now(),
                status: 'queued',
            };
            state.queue.push(job);
        },
        queueRemoveJob(state, action: PayloadAction<string>) {
            const id = action.payload;
            const wasActive = state.activeId === id;
            state.queue = state.queue.filter(j => j.id !== id);
            if (wasActive) {
                // Reset active selection and clear current job fields
                state.activeId = null;
                state.oemProductId = '';
                state.productId = '';
                state.batchId = '';
                state.waferId = null;
                state.subId = '';
                state.waferSubstrate = null;
                state.waferMaps = [];
                state.includeSubstrateSelected = false;
                state.selectedLayerKeys = [];
            }
        },
        queueUpdateJob(state, action: PayloadAction<{ id: string; changes: Partial<JobItem> }>) {
            const { id, changes } = action.payload;
            const j = state.queue.find(x => x.id === id);
            if (!j) return;
            Object.assign(j, changes);
        },
        queueSetActive(state, action: PayloadAction<string | null>) {
            const id = action.payload;
            // reset previous active status
            if (state.activeId) {
                const prev = state.queue.find(x => x.id === state.activeId);
                if (prev) prev.status = prev.status === 'done' ? 'done' : 'queued';
            }
            state.activeId = id;
            if (!id) {
                // Unset active → also clear the current job fields
                state.oemProductId = '';
                state.productId = '';
                state.batchId = '';
                state.waferId = null;
                state.subId = '';
                state.waferSubstrate = null;
                state.waferMaps = [];
                state.includeSubstrateSelected = false;
                state.selectedLayerKeys = [];
                return;
            }
            const j = state.queue.find(x => x.id === id);
            if (!j) return;
            j.status = 'active';
            // apply job into active fields to keep compatibility with existing consumers
            state.oemProductId = j.oemProductId;
            state.productId = j.productId;
            state.batchId = j.batchId;
            state.waferId = j.waferId;
            state.subId = j.subId;
            state.waferSubstrate = j.waferSubstrate;
            state.waferMaps = j.waferMaps.slice();
            // reflect selection from the active job
            state.includeSubstrateSelected = !!j.waferSubstrate;
            state.selectedLayerKeys = pickHighestRetestPerGroup(state.waferMaps).map((r) => layerKey(r));
        },
        // Reset all job statuses to queued and unset active
        queueResetAllStatus(state) {
            state.queue.forEach(j => { j.status = 'queued'; });
            state.activeId = null;
        },
        // Remove completed jobs; unset active and clear fields if active was done
        queueClearCompleted(state) {
            const active = state.queue.find(j => j.id === state.activeId);
            const activeWasDone = !!active && active.status === 'done';
            state.queue = state.queue.filter(j => j.status !== 'done');
            if (activeWasDone) {
                state.activeId = null;
                state.oemProductId = '';
                state.productId = '';
                state.batchId = '';
                state.waferId = null;
                state.subId = '';
                state.waferSubstrate = null;
                state.waferMaps = [];
                state.includeSubstrateSelected = false;
                state.selectedLayerKeys = [];
            }
        },
        // Remove all jobs and clear current fields
        queueClearAll(state) {
            state.queue = [];
            state.activeId = null;
            state.oemProductId = '';
            state.productId = '';
            state.batchId = '';
            state.waferId = null;
            state.subId = '';
            state.waferSubstrate = null;
            state.waferMaps = [];
            state.includeSubstrateSelected = false;
            state.selectedLayerKeys = [];
        },
        // ===== Layer selection management =====
        setLayerSelection(state, action: PayloadAction<{ includeSubstrate: boolean; selectedLayerKeys: string[] }>) {
            state.includeSubstrateSelected = action.payload.includeSubstrate;
            state.selectedLayerKeys = action.payload.selectedLayerKeys.slice();
            // Persist selection into the active job as well, so edits from the selector update the job item
            if (state.activeId) {
                const j = state.queue.find(x => x.id === state.activeId);
                if (j) {
                    j.includeSubstrateSelected = action.payload.includeSubstrate;
                    j.selectedLayerKeys = action.payload.selectedLayerKeys.slice();
                }
            }
        },
    },
});

export const {
    setJob,
    setJobSubstrate,
    setJobMaps,
    addJobMaps,
    setJobOemProductId,
    setJobProductId,
    setJobBatchId,
    setJobWaferId,
    setJobSubId,
    clearJob,
    queueAddFromCurrent,
    queueAddJob,
    queueRemoveJob,
    queueUpdateJob,
    queueSetActive,
    queueResetAllStatus,
    queueClearCompleted,
    queueClearAll,
    setLayerSelection,
} = stackingJobSlice.actions;

export default stackingJobSlice.reducer;

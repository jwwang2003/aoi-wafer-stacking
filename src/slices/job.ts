import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SubstrateDefectRow, WaferMapRow } from '@/db/types';

interface WaferState {
    oemProductId: string;

    // triple + sub
    productId: string;
    batchId: string;
    waferId: number | null;
    subId: string;

    waferSubstrate: SubstrateDefectRow | null;
    waferMaps: WaferMapRow[];
}

const initialState: WaferState = {
    oemProductId: '',
    productId: '',
    batchId: '',
    waferId: null,
    subId: '',
    waferSubstrate: null,
    waferMaps: [],
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
} = stackingJobSlice.actions;

export default stackingJobSlice.reducer;

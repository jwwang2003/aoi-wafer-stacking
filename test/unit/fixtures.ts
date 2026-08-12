/**
 * Loader for the shared fixture set in `test/fixtures/`.
 *
 * `test/fixtures/parsed/` holds JSON dumps produced by the Rust parsers
 * (see `src-tauri/src/parser/tests/mod.rs::dump_parsed_fixtures`), so the
 * data here has exactly the shape production code receives from Tauri IPC.
 *
 * Regenerate after parser changes with:
 *   cd src-tauri && cargo test --no-default-features dump_parsed_fixtures -- --ignored
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
    AsciiDie,
    BinMapData,
    DieLayoutMap,
    MapData,
    SubstrateDefectXlsResult,
    Wafer,
} from '@/types/ipc';
import { isNumberBin } from '@/types/ipc';
import { DataSourceType } from '@/types/dataSource';
import { LayerMeta } from '@/pages/WaferStacking/priority';
import { getLayerPriority } from '@/utils/waferSubstrateRenderer';
import type { ParsedStackingLayer } from '@/pages/WaferStacking/stackingLayers';

export const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures');

export type LotId = 'B003332' | 'B003990';

function loadParsed<T>(lot: LotId, name: string): T {
    const path = join(FIXTURES_DIR, 'parsed', lot, `${name}.json`);
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export const loadFabCp = (lot: LotId): Wafer => loadParsed<Wafer>(lot, 'fab-cp');
export const loadCp1 = (lot: LotId): MapData => loadParsed<MapData>(lot, 'cp1');
export const loadCp2 = (lot: LotId): MapData => loadParsed<MapData>(lot, 'cp2');
export const loadWlbi = (lot: LotId): BinMapData => loadParsed<BinMapData>(lot, 'wlbi');
export const loadAoi = (lot: LotId): MapData => loadParsed<MapData>(lot, 'aoi');
export const loadSubstrateDefects = (lot: LotId): SubstrateDefectXlsResult =>
    loadParsed<SubstrateDefectXlsResult>(lot, 'substrate-defects');

/** Parsed 基板布局 Excel (one sheet per product, shared by both lots). */
export const loadDieLayouts = (): DieLayoutMap =>
    JSON.parse(
        readFileSync(join(FIXTURES_DIR, 'parsed', 'die-layout.json'), 'utf-8')
    ) as DieLayoutMap;

/** A parsed lot layer plus the stage metadata the priority rules operate on. */
export interface FixtureLayer {
    name: string;
    dies: AsciiDie[];
    meta: LayerMeta;
}

/** WLBI maps mark the alignment die as bin 257; the job processor converts it to '*'. */
export const wlbiDiesWithMarker = (binMap: BinMapData): AsciiDie[] =>
    binMap.map.map((die) =>
        isNumberBin(die.bin) && die.bin.number === 257
            ? { x: die.x, y: die.y, bin: { special: '*' } }
            : { x: die.x, y: die.y, bin: die.bin }
    );

/**
 * All map layers of a lot, in the order the app processes them
 * (descending stage priority: CP2 > WLBI > CP1 > FAB CP > AOI).
 */
export function loadLotLayers(lot: LotId): FixtureLayer[] {
    return [
        {
            name: 'CP2',
            dies: loadCp2(lot).map.dies,
            meta: { stage: DataSourceType.CpProber, subStage: '2' },
        },
        {
            name: 'WLBI',
            dies: wlbiDiesWithMarker(loadWlbi(lot)),
            meta: { stage: DataSourceType.Wlbi },
        },
        {
            name: 'CP1',
            dies: loadCp1(lot).map.dies,
            meta: { stage: DataSourceType.CpProber, subStage: '1' },
        },
        {
            name: 'FAB CP',
            dies: loadFabCp(lot).map.dies,
            meta: { stage: DataSourceType.FabCp },
        },
        {
            name: 'AOI',
            dies: loadAoi(lot).map.dies,
            meta: { stage: DataSourceType.Aoi },
        },
    ];
}

/** The same layers as ParsedStackingLayer[] ready for the real pipeline. */
export const toStackingLayers = (layers: FixtureLayer[]): ParsedStackingLayer[] =>
    layers.map(({ name, dies, meta }) => ({
        name,
        dies,
        priority: getLayerPriority(meta),
        header: {},
    }));

/** Flatten both defect sheets, the way the job processor does before filtering. */
export function flattenDefects(result: SubstrateDefectXlsResult) {
    return [
        ...(result['PL defect list'] ?? []),
        ...(result['Surface defect list'] ?? []),
    ];
}

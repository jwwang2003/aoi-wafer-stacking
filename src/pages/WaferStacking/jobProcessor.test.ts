import { describe, expect, it, vi } from 'vitest';

import type { WaferMapRow } from '@/db/types';
import type { JobItem } from '@/slices/job';
import { DataSourceType } from '@/types/dataSource';
import type { MapData } from '@/types/ipc';

import {
    processWaferStackingJob,
    type WaferStackingJobOptions,
    type WaferStackingJobDependencies,
} from './jobProcessor';

const AOI_FIXTURE_PATH = 'test/reference_files/wafer_stacking/AOI/S1M032120B_B003332/S1M032120B_B003332_02.txt';
const SUBSTRATE_FIXTURE_PATH = 'test/reference_files/wafer_stacking/衬底/2-86107919CNF1.xls';

const mapExData = {
    deviceName: 'S1M040120B',
    lotNo: 'B003990',
    waferId: '02',
    waferSize: '6',
    diceSizeX: 1.5,
    diceSizeY: 2.5,
    flatNotch: 'Down',
    mapColumns: 2,
    mapRows: 1,
    totalTested: 2,
    totalPass: 1,
    totalFail: 1,
    yieldPercent: 50,
    map: {
        dies: [
            { x: 0, y: 0, bin: { number: 1 } },
            { x: 1, y: 0, bin: { number: 2 } },
        ],
    },
} satisfies MapData;

const mapExDataWithSubstrateSeed = {
    ...mapExData,
    map: {
        dies: [
            { x: 0, y: 0, bin: { special: 'S' } },
            { x: 1, y: 0, bin: { number: 1 } },
            { x: 0, y: 1, bin: { number: 1 } },
        ],
    },
} satisfies MapData;

const createAoiMap = (overrides: Partial<WaferMapRow> = {}): WaferMapRow => ({
    product_id: 'PROD-1',
    batch_id: 'LOT-1',
    wafer_id: 7,
    stage: DataSourceType.Aoi,
    sub_stage: null,
    retest_count: 0,
    time: null,
    file_path: AOI_FIXTURE_PATH,
    ...overrides,
});

const createJob = (overrides: Partial<JobItem> = {}): JobItem => ({
    id: 'job-1',
    createdAt: 1,
    status: 'queued',
    oemProductId: 'OEM-1',
    productId: 'PROD-1',
    batchId: 'LOT-1',
    waferId: 7,
    subId: 'SUB-1',
    waferSubstrate: null,
    waferMaps: [createAoiMap()],
    ...overrides,
});

const createOptions = (
    overrides: Partial<WaferStackingJobOptions> = {}
): WaferStackingJobOptions => ({
    outputDir: 'output',
    finalOutputDir: '',
    dieLayoutPath: '',
    selectedOutputs: ['mapEx', 'bin'],
    selectedDefectClasses: [],
    imageRenderer: 'bin',
    exportAsciiData: false,
    goodBins: ['BIN 1'],
    ...overrides,
});

const createDependencies = (
    overrides: Partial<WaferStackingJobDependencies> = {}
): WaferStackingJobDependencies => ({
    getOemOffset: vi.fn().mockResolvedValue({
        x_offset: 3,
        y_offset: 4,
        defect_offset_x: 0.1,
        defect_offset_y: 0.2,
    }),
    getProductSize: vi.fn().mockResolvedValue({
        die_x: 1.5,
        die_y: 2.5,
    }),
    parseWaferMapEx: vi.fn().mockResolvedValue(mapExData),
    parseWaferMap: vi.fn(),
    invokeParseWafer: vi.fn(),
    invokeParseSubstrateDefectXls: vi.fn(),
    invokeParseDieLayoutXls: vi.fn(),
    upsertWaferStackStats: vi.fn(),
    join: vi.fn(async (...parts: string[]) => parts.join('/')),
    mkdir: vi.fn(),
    exportWaferFiles: vi.fn(),
    now: vi.fn(() => new Date(2025, 2, 31, 2, 27)),
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
    },
    ...overrides,
});

describe('processWaferStackingJob', () => {
    it('processes the selected map layer and exports the merged wafer files', async () => {
        const deps = createDependencies();
        const onFinalOutputDir = vi.fn();

        const result = await processWaferStackingJob(createJob(), createOptions({
            onFinalOutputDir,
        }), deps);

        expect(deps.parseWaferMapEx).toHaveBeenCalledWith(AOI_FIXTURE_PATH);
        expect(deps.mkdir).toHaveBeenCalledWith('output/OEM-1_PROD-1_LOT-1_7_SUB-1', { recursive: true });
        expect(onFinalOutputDir).toHaveBeenCalledWith('output/OEM-1_PROD-1_LOT-1_7_SUB-1');
        expect(deps.upsertWaferStackStats).toHaveBeenCalledWith({
            oem_product_id: 'OEM-1',
            batch_id: 'LOT-1',
            wafer_id: '7',
            total_tested: 2,
            total_pass: 1,
            total_fail: 1,
            yield_percentage: 50,
            bin_counts: '{"1":1,"2":1}',
            start_time: '2025/03/31 02:27',
            stop_time: '2025/03/31 02:27',
        });
        expect(deps.exportWaferFiles).toHaveBeenCalledTimes(1);
        expect(deps.exportWaferFiles).toHaveBeenCalledWith(expect.objectContaining({
            baseFileName: 'OEM-1_PROD-1_LOT-1_7_SUB-1',
            outputRootDir: 'output/OEM-1_PROD-1_LOT-1_7_SUB-1',
            mergedDies: mapExData.map.dies,
            selectedOutputs: ['mapEx', 'bin'],
            imageRenderer: 'bin',
            allSubstrateDefects: [],
            currentDieSize: { x: 1.5, y: 2.5 },
            currentSubstrateOffset: { x: 3, y: 4 },
            exportAsciiData: false,
            selectedPassBins: ['BIN 1'],
        }));
        expect(result).toEqual({
            jobId: 'job-1',
            outputRootDir: 'output/OEM-1_PROD-1_LOT-1_7_SUB-1',
            mergedDieCount: 2,
        });
    });

    it('rejects an explicit empty map selection when no substrate layer is selected', async () => {
        const deps = createDependencies();

        await expect(processWaferStackingJob(createJob({
            selectedLayerKeys: [],
        }), createOptions(), deps)).rejects.toThrow('未选择有效图层或图层无文件路径');

        expect(deps.exportWaferFiles).not.toHaveBeenCalled();
    });

    it('continues exporting when stats persistence fails', async () => {
        const warning = new Error('db down');
        const deps = createDependencies({
            upsertWaferStackStats: vi.fn().mockRejectedValue(warning),
        });

        const result = await processWaferStackingJob(createJob(), createOptions(), deps);

        expect(deps.logger.warn).toHaveBeenCalledWith('晶圆 7 统计数据入库失败:', warning);
        expect(deps.exportWaferFiles).toHaveBeenCalledTimes(1);
        expect(result.jobId).toBe('job-1');
    });

    it('uses selected substrate classes for stacking while preserving all substrate defects for export', async () => {
        const deps = createDependencies({
            getOemOffset: vi.fn().mockResolvedValue({
                x_offset: 0,
                y_offset: 0,
                defect_offset_x: 0,
                defect_offset_y: 0,
            }),
            getProductSize: vi.fn().mockResolvedValue({
                die_x: 1,
                die_y: 1,
            }),
            parseWaferMapEx: vi.fn().mockResolvedValue(mapExDataWithSubstrateSeed),
            invokeParseSubstrateDefectXls: vi.fn().mockResolvedValue({
                'PL defect list': [
                    { no: 1, x: 1, y: 0, w: 1000, h: 1000, area: 1, class: 'Pit', contrast: 1, channel: 'PL' },
                ],
                'Surface defect list': [
                    { no: 2, x: 0, y: -1, w: 1000, h: 1000, area: 1, class: 'Scratch', contrast: 1, channel: 'Surface' },
                ],
            }),
        });

        await processWaferStackingJob(createJob({
            waferSubstrate: { sub_id: 'SUB-1', file_path: SUBSTRATE_FIXTURE_PATH },
            includeSubstrateSelected: true,
        }), createOptions({
            selectedDefectClasses: ['Pit'],
        }), deps);

        expect(deps.invokeParseSubstrateDefectXls).toHaveBeenCalledWith(SUBSTRATE_FIXTURE_PATH);
        expect(deps.exportWaferFiles).toHaveBeenCalledWith(expect.objectContaining({
            allSubstrateDefects: [
                expect.objectContaining({ class: 'Pit' }),
                expect.objectContaining({ class: 'Scratch' }),
            ],
            mergedDies: expect.arrayContaining([
                { x: 1, y: 0, bin: { special: 'E' } },
                { x: 0, y: 1, bin: { number: 1 } },
            ]),
        }));
    });
});

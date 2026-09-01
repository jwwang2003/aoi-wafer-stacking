/**
 * Guards the contract between the data-source scanning rules and the
 * canonical directory layout in `test/fixtures/scan-tree/` (which mirrors the
 * production share layout, including a multi-product CP-prober tree with the
 * real-world file-naming variants). If either side drifts, ingest would
 * silently skip data sources.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialDataSourceConfigState } from '@/constants/default';
import { SCAN_PATTERNS } from '@/utils/dataSource';
import { FIXTURES_DIR } from './fixtures';

const SCAN_TREE = join(FIXTURES_DIR, 'scan-tree');
const regexes = initialDataSourceConfigState.regex;

const dirsIn = (...segments: string[]) =>
    readdirSync(join(SCAN_TREE, ...segments), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

const filesIn = (...segments: string[]) =>
    readdirSync(join(SCAN_TREE, ...segments), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();

const topLevelDirs = dirsIn();

const matchWhole = (pattern: string, name: string) =>
    new RegExp(`^(?:${pattern})$`).test(name);

describe('scan-tree fixture vs default folder regexes', () => {
    it('contains one folder per data source type', () => {
        expect(topLevelDirs).toEqual(
            ['AOI-01', 'CP-prober-01', 'CP-prober-02', 'FAB CP', 'Substrate', 'WLBI-02'].sort()
        );
    });

    it.each([
        ['substrate', 'Substrate'],
        ['fabCp', 'FAB CP'],
        ['cpProber', 'CP-prober-01'],
        ['cpProber', 'CP-prober-02'],
        ['wlbi', 'WLBI-02'],
        ['aoi', 'AOI-01'],
    ] as const)('default %s regex matches folder "%s"', (key, folder) => {
        expect(topLevelDirs).toContain(folder);
        expect(matchWhole(regexes[key], folder)).toBe(true);
    });

    it('regexes are mutually exclusive on the fixture folders', () => {
        for (const folder of topLevelDirs) {
            const matches = (Object.keys(regexes) as Array<keyof typeof regexes>)
                .filter((key) => matchWhole(regexes[key], folder));
            expect(matches, `folder "${folder}" matched ${matches.join(', ')}`).toHaveLength(1);
        }
    });

    it('does not match folders from other machines or stages', () => {
        for (const bogus of ['CP-prober', 'WLBI', 'AOI', 'Backup', 'FAB CP old']) {
            const matches = (Object.keys(regexes) as Array<keyof typeof regexes>)
                .filter((key) => matchWhole(regexes[key], bogus));
            expect(matches, `bogus folder "${bogus}"`).toHaveLength(0);
        }
    });
});

describe('multi-product CP-prober tree', () => {
    const lotDirs = dirsIn('CP-prober-01');

    it('holds two different products under one prober', () => {
        expect(lotDirs).toEqual(['S1M040120B_B003990_1_0', 'SZ4MA25120BK_HL9188_2_0']);
    });

    it('every lot folder matches the process-folder pattern with the right groups', () => {
        const expected: Record<string, [string, string, string, string]> = {
            S1M040120B_B003990_1_0: ['S1M040120B', 'B003990', '1', '0'],
            SZ4MA25120BK_HL9188_2_0: ['SZ4MA25120BK', 'HL9188', '2', '0'],
        };
        for (const dir of lotDirs) {
            const m = SCAN_PATTERNS.cpProber.processFolder.exec(dir);
            expect(m, `lot folder "${dir}"`).not.toBeNull();
            expect(m!.slice(1)).toEqual(expected[dir]);
        }
    });

    it('every wafer folder matches the wafer-folder pattern', () => {
        for (const lot of lotDirs) {
            for (const wafer of dirsIn('CP-prober-01', lot)) {
                expect(
                    SCAN_PATTERNS.cpProber.waferFolder.test(wafer),
                    `wafer folder "${wafer}"`
                ).toBe(true);
            }
        }
    });

    it('the lot-level CSV report is not picked up as a wafer folder or map file', () => {
        const entries = filesIn('CP-prober-01', 'SZ4MA25120BK_HL9188_2_0');
        expect(entries).toEqual(['SZ4MA25120BK_HL9188测试报告.csv']);
        expect(SCAN_PATTERNS.cpProber.waferFolder.test(entries[0])).toBe(false);
        expect(SCAN_PATTERNS.cpProber.mapExFile.test(entries[0])).toBe(false);
    });

    describe('real-world file naming variants (product SZ4MA25120BK)', () => {
        const waferFiles = (wafer: string) =>
            filesIn('CP-prober-01', 'SZ4MA25120BK_HL9188_2_0', wafer);

        it('plain naming (wafer 18): mapEx file matches the scan pattern', () => {
            const mapEx = waferFiles('SZ4MA25120BK_HL9188_18')
                .filter((f) => SCAN_PATTERNS.cpProber.mapExFile.test(f));
            expect(mapEx).toEqual(['SZ4MA25120BK_HL9188_18_mapEx.txt']);
        });

        it('dash-variant naming (wafer 20): mapEx file does NOT match and would be skipped', () => {
            // The machine sometimes writes `<model>-8_<lot>_<lot>-<wafer>_mapEx.txt`.
            // Documented current behavior: such wafers are silently skipped by ingest.
            const files = waferFiles('SZ4MA25120BK_HL9188_20');
            expect(files.some((f) => f.endsWith('_mapEx.txt'))).toBe(true);
            expect(files.filter((f) => SCAN_PATTERNS.cpProber.mapExFile.test(f)))
                .toHaveLength(0);
        });

        it('dot-variant naming (wafer 23): only the plain-named mapEx matches', () => {
            const matching = waferFiles('SZ4MA25120BK_HL9188_23')
                .filter((f) => SCAN_PATTERNS.cpProber.mapExFile.test(f));
            expect(matching).toEqual(['SZ4MA25120BK_HL9188_23_mapEx.txt']);
        });
    });
});

describe('product ids with "-A"-style suffixes', () => {
    it('FAB CP map file with a suffixed oem model matches and captures the full id', () => {
        const m = SCAN_PATTERNS.fabCp.mapFile.exec('P0097B-A_B003990_02.txt');
        expect(m).not.toBeNull();
        expect(m!.slice(1)).toEqual(['P0097B-A', 'B003990', '02']);
    });

    it('FAB CP batch folder accepts a suffixed lot id', () => {
        expect(SCAN_PATTERNS.fabCp.batchFolder.test('B003990-1')).toBe(true);
    });

    it('CP-prober folders and mapEx file accept a suffixed product model', () => {
        expect(SCAN_PATTERNS.cpProber.processFolder.exec('S1M040120B-A_B003990_1_0')!.slice(1))
            .toEqual(['S1M040120B-A', 'B003990', '1', '0']);
        expect(SCAN_PATTERNS.cpProber.waferFolder.test('S1M040120B-A_B003990_02')).toBe(true);
        expect(SCAN_PATTERNS.cpProber.mapExFile.exec('S1M040120B-A_B003990_02_mapEx.txt')!.slice(1))
            .toEqual(['S1M040120B-A', 'B003990', '02']);
    });

    it('AOI and WLBI patterns accept a suffixed product model', () => {
        expect(SCAN_PATTERNS.aoi.processFolder.exec('S1M040120B-A_B003990')!.slice(1))
            .toEqual(['S1M040120B-A', 'B003990']);
        expect(SCAN_PATTERNS.aoi.mapFile.test('S1M040120B-A_B003990_02_20250325165831.txt')).toBe(true);
        expect(SCAN_PATTERNS.wlbi.processFolder.test('S1M040120B-A_B003990_2_0')).toBe(true);
    });

    it('underscores still delimit fields: a suffix cannot swallow the next field', () => {
        const m = SCAN_PATTERNS.fabCp.mapFile.exec('P0097B_B003990_02.txt');
        expect(m!.slice(1)).toEqual(['P0097B', 'B003990', '02']);
    });
});

describe('WLBI and AOI patterns vs scan-tree', () => {
    it('WLBI lot folder, WaferMap folder and file all match', () => {
        const [lot] = dirsIn('WLBI-02');
        expect(SCAN_PATTERNS.wlbi.processFolder.test(lot)).toBe(true);
        expect(dirsIn('WLBI-02', lot)).toContain('WaferMap');
        const [file] = filesIn('WLBI-02', lot, 'WaferMap');
        const m = SCAN_PATTERNS.wlbi.waferMapFile.exec(file);
        expect(m, `WLBI file "${file}"`).not.toBeNull();
        expect(m!.slice(1)).toEqual(['B003990', '02', '20250325', '165831']);
    });

    it('AOI product folder and timestamped map file match', () => {
        const [productDir] = dirsIn('AOI-01');
        const m = SCAN_PATTERNS.aoi.processFolder.exec(productDir);
        expect(m).not.toBeNull();
        expect(m!.slice(1)).toEqual(['S1M040120B', 'B003990']);
        const [file] = filesIn('AOI-01', productDir);
        expect(SCAN_PATTERNS.aoi.mapFile.test(file), `AOI file "${file}"`).toBe(true);
    });
});

describe('multi-product substrate folder', () => {
    it('holds product record sheets for both products plus the shared mapping', () => {
        expect(filesIn('Substrate')).toEqual([
            'P0020B_20250721160201.xlsx',
            'P0097B_20250721160205.xlsx',
            'Product list.xlsx',
        ]);
    });

    it('holds defect lists from both substrate vendors (CN and TG ids)', () => {
        const defectLists = filesIn('Substrate', 'Defect list');
        expect(defectLists).toContain('86107919CNF1.xls');
        expect(defectLists).toContain('B4151312TGG0.xls');
    });
});

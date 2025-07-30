import { DataSourceRegex } from '@/types/DataSource';

// Derive the type of valid regex keys from the actual keys of regexPatterns
export type RegexKey = keyof DataSourceRegex;

/**
 * List of regex config definitions to drive UI or processing logic.
 */
export const RegexConfigs: { label: string; key: RegexKey }[] = [
    { label: 'Substrate 文件夹名正则', key: 'substrate' },
    { label: 'FAB CP 文件夹名正则', key: 'fabCp' },
    { label: 'CP-prober-XX 文件夹名正则', key: 'cpProber' },
    { label: 'WLBI-XX 文件夹名正则', key: 'wlbi' },
    { label: 'AOI 文件夹名正则', key: 'aoi' },
];
import { RegexState } from '@/types/DataSource';

// Derive the type of valid regex keys from the actual keys of regexPatterns
export type RegexKey = keyof RegexState;

/**
 * List of regex config definitions to drive UI or processing logic.
 */
export const RegexConfigs: { label: string; key: RegexKey }[] = [
    { label: 'Substrate 文件夹名正则', key: 'SubstrateRegex' },
    { label: 'CP-prober-XX 文件夹名正则', key: 'CpProberRegex' },
    { label: 'WLBI-XX 文件夹名正则', key: 'WlbiRegex' },
    { label: 'AOI 文件夹名正则', key: 'AoiRegex' },
];
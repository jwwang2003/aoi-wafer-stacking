import { DataSourceType } from '@/types/DataSource';

/**
 * List of regex config definitions to drive UI or processing logic.
 */
export const RegexConfigs: { label: string; key: DataSourceType }[] = [
    { label: 'Substrate 文件夹名正则', key: 'substrate' },
    { label: 'FAB CP 文件夹名正则', key: 'fabCp' },
    { label: 'CP-prober-XX 文件夹名正则', key: 'cpProber' },
    { label: 'WLBI-XX 文件夹名正则', key: 'wlbi' },
    { label: 'AOI 文件夹名正则', key: 'aoi' },
];
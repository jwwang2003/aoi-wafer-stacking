import { DataSourceType } from '@/types/dataSource';

/**
 * List of regex config definitions to drive UI or processing logic.
 */
export const RegexConfigs: { label: string; key: DataSourceType }[] = [
    { label: 'Substrate 文件夹名正则', key: DataSourceType.Substrate },
    { label: 'FAB CP 文件夹名正则', key: DataSourceType.FabCp },
    { label: 'CP-prober-XX 文件夹名正则', key: DataSourceType.CpProber },
    { label: 'WLBI-XX 文件夹名正则', key: DataSourceType.Wlbi },
    { label: 'AOI 文件夹名正则', key: DataSourceType.Aoi },
];
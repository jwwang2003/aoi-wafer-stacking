/**
 * 统计信息类型定义
 */
export interface Statistics {
    totalTested: number;
    totalPass: number;
    totalFail: number;
    yieldPercentage: number;
}

/**
 * 解析后的文件数据类型
 */
export interface ParsedFileData {
    header: Record<string, string>;
    mapData: string[];
}

/**
 * 叠图结果类型
 */
export interface OverlayResult {
    result: string[];
    debug: string[];
}

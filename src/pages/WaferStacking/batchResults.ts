export interface BatchProcessingError {
    id: string;
    message: string;
}

export interface BatchCompletionSummary {
    ok: boolean;
    title: string;
    message: string;
    successCount: number;
    failureCount: number;
}

export function buildBatchCompletionSummary(
    totalCount: number,
    errors: BatchProcessingError[]
): BatchCompletionSummary {
    const failureCount = errors.length;
    const successCount = Math.max(0, totalCount - failureCount);

    if (failureCount > 0) {
        return {
            ok: false,
            title: '批量处理完成',
            message: `共 ${totalCount} 个任务，成功 ${successCount} 个，失败 ${failureCount} 个`,
            successCount,
            failureCount,
        };
    }

    return {
        ok: true,
        title: '批量处理完成',
        message: `全部 ${totalCount} 个任务处理成功`,
        successCount,
        failureCount,
    };
}

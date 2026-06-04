import { describe, expect, it } from 'vitest';

import { buildBatchCompletionSummary } from './batchResults';

describe('buildBatchCompletionSummary', () => {
    it('returns a successful summary when all batch jobs complete', () => {
        expect(buildBatchCompletionSummary(3, [])).toEqual({
            ok: true,
            title: '批量处理完成',
            message: '全部 3 个任务处理成功',
            successCount: 3,
            failureCount: 0,
        });
    });

    it('returns a failure summary with success and failure counts', () => {
        expect(buildBatchCompletionSummary(3, [
            { id: 'job-1', message: 'first failure' },
            { id: 'job-2', message: 'second failure' },
        ])).toEqual({
            ok: false,
            title: '批量处理完成',
            message: '共 3 个任务，成功 1 个，失败 2 个',
            successCount: 1,
            failureCount: 2,
        });
    });

    it('clamps successful jobs to zero when failures exceed total jobs', () => {
        expect(buildBatchCompletionSummary(1, [
            { id: 'job-1', message: 'first failure' },
            { id: 'job-2', message: 'second failure' },
        ])).toMatchObject({
            successCount: 0,
            failureCount: 2,
        });
    });
});

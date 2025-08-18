import { WaferFileMetadata } from '@/types/wafer';

export function toWaferFileMetadata(r: any): WaferFileMetadata {
    return {
        filePath: r.file_path,
        productModel: r.product_id,
        batch: r.batch_id,
        waferId: String(r.wafer_id),
        processSubStage: typeof r.sub_stage === 'number' ? r.sub_stage : undefined,
        retestCount: typeof r.retest_count === 'number' ? r.retest_count : undefined,
        time: r.time ?? undefined,
        stage: r.stage ?? undefined,
        lastModified: 0,
    };
}
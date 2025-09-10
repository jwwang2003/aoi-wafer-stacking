import { WaferFileMetadata } from '@/types/wafer';
import type { WaferMapRow } from '@/db/types';
import { DataSourceType } from '@/types/dataSource';

export function toWaferFileMetadata(r: WaferMapRow): WaferFileMetadata {
    const subStageNum =
        r.sub_stage == null
            ? undefined
            : Number.isNaN(Number(r.sub_stage))
                ? undefined
                : Number(r.sub_stage);
    return {
        filePath: r.file_path,
        productModel: r.product_id,
        batch: r.batch_id,
        waferId: String(r.wafer_id),
        processSubStage: subStageNum,
        retestCount: r.retest_count ?? undefined,
        time: r.time != null ? String(r.time) : undefined,
        stage: r.stage as unknown as DataSourceType,
        lastModified: 0,
    };
}

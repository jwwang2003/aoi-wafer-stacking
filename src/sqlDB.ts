
import Database from '@tauri-apps/plugin-sql';
import { WaferFileMetadata } from '@/types/Wafer';

type WaferMapRow = {
    product_id: string
    batch_id: string
    wafer_id: string
    time: number | null
}

/**
 * Batch-sync an array of WaferFileMetadata into SQLite’s `wafer_maps` table,
 * updating only when the incoming record is newer.
 */
export async function syncWaferMapsBatch(
    db: Database,
    records: WaferFileMetadata[]
) {
    // 1) load all existing (product_id|batch_id|wafer_id) → time
    const rows = await db.select<WaferMapRow[]>(
        'SELECT product_id, batch_id, wafer_id, time FROM wafer_maps;'
    );

    // build a lookup map
    const existing = new Map<string, number | null>()
    for (const { product_id, batch_id, wafer_id, time } of rows) {
        const key = `${product_id}|${batch_id}|${wafer_id}`
        existing.set(key, time)
    }

    try {
        // 2) one big transaction
        await db.execute('BEGIN')

        for (const r of records) {
            console.log(r);
            const key = `${r.productModel}|${r.batch}|${r.waferId}`
            const oldTime = existing.get(key) ?? null
            const newTime = r.time ? parseInt(r.time, 10) : null
            
            if (!oldTime) {
                // not present → INSERT
                await db.execute(
                    `
INSERT INTO wafer_maps
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`,
                    [
                        r.productModel,
                        r.batch,
                        r.waferId,
                        r.stage,
                        r.processSubStage ?? null,
                        r.retestCount ?? 0,
                        newTime,
                        r.filePath,
                    ]
                )
            } else if (
                newTime !== null &&
                (oldTime === null || newTime > oldTime)
            ) {
                // exists, and incoming is newer → UPDATE
                await db.execute(
                    `
UPDATE wafer_maps SET
    stage        = ?,
    sub_stage    = ?,
    retest_count = ?,
    time         = ?,
    file_path    = ?
WHERE product_id = ?
    AND batch_id   = ?
    AND wafer_id   = ?
`,
                    [
                        r.stage,
                        r.processSubStage ?? null,
                        r.retestCount ?? 0,
                        newTime,
                        r.filePath,
                        r.productModel,
                        r.batch,
                        r.waferId,
                    ]
                )
            }
            // otherwise: existing is up-to-date → skip
        }

        // 3) commit
        await db.execute('COMMIT')
        console.log('test');
    } catch (err) {
        await db.execute('ROLLBACK')
        throw err
    }
}

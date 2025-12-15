import { getDb } from './index';

export interface WaferStackStats {
    oem_product_id: string;
    batch_id: string;
    wafer_id: string;
    total_tested: number;
    total_pass: number;
    total_fail: number;
    yield_percentage: number;
    bin_counts: string;
    start_time: string | null;
    stop_time: string | null;
}

export interface WaferStatsIngestResult {
    inserted: number;
    updated: number;
}

export async function upsertWaferStackStats(stats: WaferStackStats): Promise<WaferStatsIngestResult> {
    const db = await getDb();
    let inserted = 0;
    let updated = 0;

    try {
        const existing = await db.select(
            `SELECT id FROM wafer_stack_stats 
       WHERE oem_product_id = ? AND batch_id = ? AND wafer_id = ?`,
            [stats.oem_product_id, stats.batch_id, stats.wafer_id]
        ) as unknown as Array<{ id: number }>;

        const sql = `
      INSERT INTO wafer_stack_stats (
        oem_product_id, batch_id, wafer_id, total_tested, total_pass, 
        total_fail, yield_percentage, bin_counts, start_time, stop_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(oem_product_id, batch_id, wafer_id) DO UPDATE SET
        total_tested = excluded.total_tested,
        total_pass = excluded.total_pass,
        total_fail = excluded.total_fail,
        yield_percentage = excluded.yield_percentage,
        bin_counts = excluded.bin_counts,
        start_time = excluded.start_time,
        stop_time = excluded.stop_time
    `;

        await db.execute(sql, [
            stats.oem_product_id,
            stats.batch_id,
            stats.wafer_id,
            stats.total_tested,
            stats.total_pass,
            stats.total_fail,
            stats.yield_percentage,
            stats.bin_counts,
            stats.start_time,
            stats.stop_time
        ]);

        if (existing.length > 0) {
            updated++;
        } else {
            inserted++;
        }

        return { inserted, updated };
    } catch (error) {
        console.error('保存晶圆统计数据失败:', error);
        throw new Error(`保存统计数据失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 根据OEM产品编号查询所有统计数据
 */
export async function getWaferStackStatsByOem(
    oemProductId: string
): Promise<WaferStackStats[]> {
    const db = await getDb();
    const rows = await db.select(
        `SELECT * FROM wafer_stack_stats 
     WHERE oem_product_id = ? 
     ORDER BY batch_id, wafer_id`,
        [oemProductId]
    ) as unknown as WaferStackStats[];

    return rows.map(row => ({
        ...row,
        bin_counts: row.bin_counts || '{}',
        start_time: row.start_time || null,
        stop_time: row.stop_time || null
    }));
}



/**
 * 根据OEM产品编号删除对应的晶圆统计数据
 * @param oemProductId OEM产品编号
 * @returns 删除的记录数
 */
export async function deleteWaferStackStatsByOem(
    oemProductId: string
): Promise<number> {
    if (!oemProductId || typeof oemProductId !== 'string') {
        throw new Error('无效的OEM产品编号：必须是非空字符串');
    }

    const db = await getDb();

    try {
        const countResult = await db.select(
            `SELECT COUNT(*) as count FROM wafer_stack_stats WHERE oem_product_id = ?`,
            [oemProductId]
        ) as unknown as Array<{ count: number }>;
        const deleteCount = countResult[0]?.count || 0;

        if (deleteCount === 0) {
            console.warn(`OEM ${oemProductId} 无对应的统计数据，无需删除`);
            return 0;
        }

        await db.execute(
            `DELETE FROM wafer_stack_stats WHERE oem_product_id = ?`,
            [oemProductId]
        );

        console.log(`成功删除OEM ${oemProductId} 的 ${deleteCount} 条统计数据`);
        return deleteCount;
    } catch (error) {
        console.error(`删除OEM ${oemProductId} 统计数据失败:`, error);
        throw new Error(
            `删除统计数据失败: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
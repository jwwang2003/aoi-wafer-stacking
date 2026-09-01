import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { getWaferStackStatsByOem } from '@/db/waferStackStats';
import { getProductSize } from '@/db/productSize';

/** wafer_id 是文本列；按数值排序，避免 '10' 排在 '2' 前面 */
const compareWaferIds = (a: string, b: string): number => {
    const numA = Number(a);
    const numB = Number(b);
    if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
    return a.localeCompare(b);
};

export async function exportWaferStatsReport(
    oemProductIds: string | string[],
    outputDir: string,
    machineId = '15',
    waferSize = 6, //默认 待增加
): Promise<string[]> {
    const oemIds = Array.isArray(oemProductIds) ? oemProductIds : [oemProductIds];
    const exportedPaths: string[] = [];

    const dataDir = await join(outputDir, '数据总汇');
    await mkdir(dataDir, { recursive: true });

    for (const oemProductId of oemIds) {
        if (!oemProductId) continue;

        const [statsList, productSizeData] = await Promise.all([
            getWaferStackStatsByOem(oemProductId),
            getProductSize(oemProductId)
        ]);

        if (statsList.length === 0) {
            console.warn(`OEM ${oemProductId} 无统计数据，跳过`);
            continue;
        }

        const dieSize = {
            x: productSizeData ? Math.round(productSizeData.die_x * 1000) : 1,
            y: productSizeData ? Math.round(productSizeData.die_y * 1000) : 1
        };

        const batchGroups = statsList.reduce<Record<string, typeof statsList>>((groups, stats) => {
            const batchId = stats.batch_id;
            if (!groups[batchId]) {
                groups[batchId] = [];
            }
            groups[batchId].push(stats);
            return groups;
        }, {});

        for (const [batchId, batchStats] of Object.entries(batchGroups)) {
            // 同一批次的所有片按片号数值排序输出
            batchStats.sort((a, b) => compareWaferIds(a.wafer_id, b.wafer_id));
            const totalWafer = batchStats.length;

            const allBinKeys = new Set<string>();
            batchStats.forEach(stats => {
                const binCounts = JSON.parse(stats.bin_counts) as Record<string, number>;
                Object.keys(binCounts).forEach(key => allBinKeys.add(key));
            });
            for (let i = 0; i <= 19; i++) {
                allBinKeys.add(i.toString());
            }
            const sortedBinKeys = Array.from(allBinKeys).sort((a, b) => {
                const numA = parseInt(a);
                const numB = parseInt(b);
                return isNaN(numA) ? 1 : isNaN(numB) ? -1 : numA - numB;
            });

            let content = '';
            content += `机台号\t${machineId}\t\t批号\t${batchId}\t\t片数\t${totalWafer}\t\t晶圆尺寸\t${waferSize}\t\t芯片尺寸\tX(mm)\t${dieSize.x}\tY(mm)\t${dieSize.y}\n`;
            content += '\n\n';

            let headerRow = 'No.\tWafer ID\tTotal\tPass\tFail\tYield';
            sortedBinKeys.forEach(binKey => {
                headerRow += `\tBIN${binKey}\tBIN${binKey} PCT`;
            });
            headerRow += '\tStart Time\tStop Time';
            content += headerRow + '\n';

            batchStats.forEach((stats, index) => {
                const binCounts = JSON.parse(stats.bin_counts) as Record<string, number>;
                const yieldStr = `${stats.yield_percentage.toFixed(2)}%`;

                let dataRow = `${index + 1}\t${stats.wafer_id}\t${stats.total_tested}\t${stats.total_pass}\t${stats.total_fail}\t${yieldStr}`;

                sortedBinKeys.forEach(binKey => {
                    const count = binCounts[binKey] || 0;
                    const pct = stats.total_tested > 0 ? (count / stats.total_tested * 100).toFixed(2) : '0.00';
                    dataRow += `\t${count}\t${pct}%`;
                });

                dataRow += `\t${stats.start_time}\t${stats.stop_time}`;
                content += dataRow + '\n';
            });

            const total = {
                total_tested: 0,
                total_pass: 0,
                total_fail: 0,
                bin_counts: {} as Record<string, number>
            };

            batchStats.forEach(stats => {
                total.total_tested += stats.total_tested;
                total.total_pass += stats.total_pass;
                total.total_fail += stats.total_fail;

                const binCounts = JSON.parse(stats.bin_counts) as Record<string, number>;
                Object.keys(binCounts).forEach(binKey => {
                    total.bin_counts[binKey] = (total.bin_counts[binKey] || 0) + binCounts[binKey];
                });
            });

            const totalYield = total.total_tested > 0
                ? (total.total_pass / total.total_tested * 100).toFixed(2) + '%'
                : '0.00%';

            let totalRow = `Total\t\t${total.total_tested}\t${total.total_pass}\t${total.total_fail}\t${totalYield}`;
            sortedBinKeys.forEach(binKey => {
                const count = total.bin_counts[binKey] || 0;
                const pct = total.total_tested > 0 ? (count / total.total_tested * 100).toFixed(2) : '0.00';
                totalRow += `\t${count}\t${pct}%`;
            });
            totalRow += '\t\t';
            content += totalRow + '\n';

            const outputPath = await join(dataDir, `${oemProductId}_${batchId}_统计报告.csv`);
            const csvContent = content.replace(/\t/g, ',');
            await writeTextFile(outputPath, csvContent);
            exportedPaths.push(outputPath);
        }

        // 统计数据保留在数据库中（按 OEM/批次/片号 upsert 去重），
        // 同一批次分多次处理不同片号时，报告从全量数据重建而非只含本次的片。
    }

    return exportedPaths;
}
import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { getWaferStackStatsByOem } from '@/db/waferStackStats';
import { deleteWaferStackStatsByOem } from '@/db/waferStackStats';
import { getProductSize } from '@/db/productSize';


export async function exportWaferStatsReport(
    oemProductId: string,
    outputDir: string,
    machineId = '15',
    waferSize = 6, //默认 待增加
): Promise<string[]> {
    const [statsList, productSizeData] = await Promise.all([
        getWaferStackStatsByOem(oemProductId),
        getProductSize(oemProductId)
    ]); if (statsList.length === 0) {
        throw new Error(`OEM ${oemProductId} 无统计数据`);
    }
    const dieSize = {
        x: productSizeData ? Math.round(productSizeData.die_x * 1000) : 4134,
        y: productSizeData ? Math.round(productSizeData.die_y * 1000) : 3740
    };

    const batchGroups = statsList.reduce<Record<string, typeof statsList>>((groups, stats) => {
        const batchId = stats.batch_id;
        if (!groups[batchId]) {
            groups[batchId] = [];
        }
        groups[batchId].push(stats);
        return groups;
    }, {});

    const exportedPaths: string[] = [];
    const dataDir = await join(outputDir, '数据总汇');
    await mkdir(dataDir, { recursive: true });

    for (const [batchId, batchStats] of Object.entries(batchGroups)) {
        const totalWafer = batchStats.length;

        const allBinKeys = new Set<string>();
        batchStats.forEach(stats => {
            console.log('Processing stats for wafer:', stats);
            const binCounts = JSON.parse(stats.bin_counts) as Record<string, number>;
            console.log('BIN Counts:', binCounts);
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

    await deleteWaferStackStatsByOem(oemProductId);
    return exportedPaths;
}
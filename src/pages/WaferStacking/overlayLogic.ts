import { Statistics, OverlayResult } from './types';

/**
 * 叠图逻辑
 * @param maps 地图数据数组
 * @param formatNames 格式名称列表
 * @returns 叠图结果和调试信息
 */
export const overlayMaps = (
    maps: string[][],
    formatNames: string[]
): OverlayResult => {
    const debug: string[] = [];
    if (maps.length === 0) return { result: [], debug };

    const priority: Record<string, number> = {
        CP2: 5,
        WLBI: 4,
        CP1: 3,
        CP3: 2,
        AOI: 1,
        衬底: 0,
    };

    // 按优先级排序
    const indexedMaps = formatNames
        .map((name, idx) => ({
            name,
            data: maps[idx],
            priority: priority[name] || 0,
        }))
        .sort((a, b) => a.priority - b.priority);

    debug.push('===== 叠图过程开始 =====');
    debug.push(
        `叠图顺序（按优先级从低到高）: ${indexedMaps
            .map((m) => m.name)
            .join(', ')}`
    );

    // 初始化结果为优先级最低的地图
    const result = indexedMaps[0].data.map((row) => row.split(''));
    debug.push('初始地图（优先级最低）:');
    debug.push(...indexedMaps[0].data);
    debug.push('');

    const getStartPosition = (line: string[], isFirstLine: boolean): number => {
        if (line.length === 0) return 0;

        if (isFirstLine) {
            // 首行寻找 '.S' 或 '.*' 模式后的位置
            for (let j = 0; j < line.length - 1; j++) {
                if (line[j] === '.' && (line[j + 1] === 'S' || line[j + 1] === '*')) {
                    return j + 2;
                }
            }
        } else {
            let foundDot = false;
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '.') {
                    foundDot = true;
                } else if (foundDot && /\d/.test(line[j])) {
                    return j;
                }
            }
        }
        return 0;
    };

    // 处理其余地图
    for (let i = 1; i < indexedMaps.length; i++) {
        const { name, data, priority: p } = indexedMaps[i];
        debug.push(`应用地图 ${i + 1} (${name}，优先级 ${p}):`);
        debug.push(...data);
        debug.push('');

        let totalChanges = 0;
        const changeDetails: string[] = [];

        if (result.length > 0 && data.length > 0) {
            const resultRow = result[0];
            const newRow = data[0].split('');

            const resultStart = getStartPosition(resultRow, true);
            const mapStart = getStartPosition(newRow, true);
            const offset = mapStart - resultStart;

            newRow.forEach((newChar, colIdx) => {
                const resultPos = colIdx - offset;
                if (resultPos >= 0 && resultPos < resultRow.length) {
                    const currentChar = resultRow[resultPos];
                    if (
                        newChar !== '1' &&
                        newChar !== '.' &&
                        newChar !== ' ' &&
                        newChar !== currentChar
                    ) {
                        resultRow[resultPos] = newChar;
                        totalChanges++;
                        changeDetails.push(
                            `位置 (0,${resultPos}): ${currentChar} -> ${newChar}`
                        );
                    }
                }
            });
        }

        for (
            let rowIdx = 1;
            rowIdx < Math.min(result.length, data.length);
            rowIdx++
        ) {
            const currentRow = result[rowIdx];
            const newRow = data[rowIdx].split('');

            const resultStart = getStartPosition(currentRow, false);
            const mapStart = getStartPosition(newRow, false);
            const offset = mapStart - resultStart;

            newRow.forEach((newChar, colIdx) => {
                const resultPos = colIdx - offset;
                if (resultPos >= 0 && resultPos < currentRow.length) {
                    const currentChar = currentRow[resultPos];
                    if (
                        newChar !== '1' &&
                        newChar !== '.' &&
                        newChar !== ' ' &&
                        newChar !== currentChar
                    ) {
                        currentRow[resultPos] = newChar;
                        totalChanges++;
                        changeDetails.push(
                            `位置 (${rowIdx},${resultPos}): ${currentChar} -> ${newChar}`
                        );
                    }
                }
            });
        }

        debug.push(`本轮修改了 ${totalChanges} 个位置`);
        debug.push(...result.map((row) => row.join('')));
        if (changeDetails.length > 0) {
            debug.push('具体更改:');
            debug.push(...changeDetails);
        }
        debug.push('');
    }

    debug.push('===== 叠图过程结束 =====');
    debug.push('最终地图:');
    debug.push(...result.map((row) => row.join('')));

    return {
        result: result.map((row) => row.join('')),
        debug,
    };
};

/**
 * 计算统计信息
 * @param mapData 地图数据
 * @returns 统计信息对象
 */
export const calculateStats = (mapData: string[]): Statistics => {
    let totalTested = 0;
    let totalPass = 0;

    for (const row of mapData) {
        for (const char of row) {
            if (char !== '.' && char !== 'S' && char !== '*') {
                totalTested++;
                if (char === '1' || char === 'G' || char === 'H' || char === 'I'|| char === 'J') {
                    totalPass++;
                }
            }
        }
    }

    const totalFail = totalTested - totalPass;
    const yieldPercentage =
        totalTested > 0 ? (totalPass / totalTested) * 100 : 0;

    return { totalTested, totalPass, totalFail, yieldPercentage };
};

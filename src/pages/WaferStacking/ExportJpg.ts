import { AsciiDie, isNumberBin, isSpecialBin } from '@/types/ipc';

const BIN_COLOR_MAP = {
    '1': '#19f520ff',
    '2': '#45417494',
    '3': '#f686edff',
    '4': '#fbff0dff',
    '5': '#2fc2efff',
    '6': '#2f7ebeff',
    '7': '#c8557ff4',
    'A': '#e82ef2ff',
    'B': '#1d37acff',
    //..bin
};

const getBinValue = (die: AsciiDie): string => {
    if (isNumberBin(die.bin)) return die.bin.number.toString();
    if (isSpecialBin(die.bin)) return die.bin.special;
    return 'unknown';
};

const countBinOccurrences = (dies: AsciiDie[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    dies.forEach(die => {
        const binValue = getBinValue(die);
        counts[binValue] = (counts[binValue] || 0) + 1;
    });
    return counts;
};

const calculateStats = (dies: AsciiDie[]): { totalTested: number; totalPass: number; yield: number } => {
    const totalTested = dies.length;
    let totalPass = 0;
    dies.forEach(die => {
        const binValue = getBinValue(die);
        if (binValue === '1' || binValue === 'H') {
            totalPass++;
        }
    });
    const yieldRate = totalTested > 0 ? (totalPass / totalTested) * 100 : 0;
    return {
        totalTested,
        totalPass,
        yield: Math.round(yieldRate * 100) / 100
    };
};

export const generateDiesImage = async (
    dies: AsciiDie[],
    header?: Record<string, string>,
): Promise<Uint8Array> => {
    if (dies.length === 0) {
        throw new Error('没有可绘制的芯片数据');
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('浏览器不支持Canvas');
    }

    const config = {
        cellSize: { width: 20, height: 15 },
        margin: 60,
        legendItemHeight: 25,
        infoLineHeight: 20,
        legendWidth: 300,
        binsPerRow: 5,
        binItemSpacing: 120,
        block: { width: 50, height: 20 }
    };

    const xs = dies.map(die => die.x);
    const ys = dies.map(die => die.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

    const gridWidth = (maxX - minX + 1) * config.cellSize.width;
    const gridHeight = (maxY - minY + 1) * config.cellSize.height;

    const legendCount = Object.keys(BIN_COLOR_MAP).length;
    const legendHeight = legendCount * config.legendItemHeight + 60;
    const { totalTested, totalPass, yield: yieldRate } = calculateStats(dies);

    const infoHeight = config.infoLineHeight * 3;
    const totalLegendAreaHeight = legendHeight + infoHeight + 20;

    canvas.width = gridWidth + config.margin * 2 + config.legendWidth;
    canvas.height = gridHeight + config.margin * 2 + totalLegendAreaHeight;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const offsetX = config.margin - minX * config.cellSize.width;
    const offsetY = config.margin - minY * config.cellSize.height;

    dies.forEach(die => {
        const x = die.x * config.cellSize.width + offsetX;
        const y = die.y * config.cellSize.height + offsetY;
        const bin = getBinValue(die);
        const color = BIN_COLOR_MAP[bin as keyof typeof BIN_COLOR_MAP] || '#000000ff';

        ctx.fillStyle = color;
        ctx.fillRect(x, y, config.cellSize.width - 1, config.cellSize.height - 1);
    });

    let currentY = gridHeight + config.margin + 30;
    if (header) {
        const infoLines = [
            `产品名称: ${(header['Product'] || header['Device Name']) + '_' + header['Lot No.'] + '_' + header['Wafer ID']}       Wafer厚度:0.000`,
            `晶圆尺寸: ${header['Wafer Size'] || 0}       布距: [${header['Index X'] || 0}.000, ${header['Index Y'] || 0}.000]       切角: ${header['??'] || 'Unknown'}[${header['Flat/Notch'] || 'Unknown'}]`,
            `时间: ${new Date().toLocaleString()}    测试总数: ${totalTested}    良品: ${totalPass}    次品: ${totalTested - totalPass}    良率: ${yieldRate}%`
        ];

        ctx.fillStyle = '#333333';
        ctx.font = '16px Arial bold';
        infoLines.forEach((line, index) => {
            ctx.fillText(line, config.margin, currentY + (index + 1) * config.infoLineHeight);
        });

        currentY += infoLines.length * config.infoLineHeight + 20;
    }

    const binCounts = countBinOccurrences(dies);
    ctx.font = '16px Arial bold';
    currentY += 30;

    Object.entries(BIN_COLOR_MAP).forEach(([bin, color], index) => {
        const row = Math.floor(index / config.binsPerRow);
        const col = index % config.binsPerRow;
        const y = currentY + row * config.legendItemHeight;
        const x = config.margin + col * config.binItemSpacing;
        const count = binCounts[bin] || 0;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, config.block.width, config.block.height);

        ctx.fillStyle = '#000000ff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`BIN  ${bin}  =  ${count}`, x + config.block.width / 2 - 20, y + config.block.height / 2);
    });

    return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                reject(new Error('无法生成图片数据'));
                return;
            }
            const arrayBuffer = await blob.arrayBuffer();
            resolve(new Uint8Array(arrayBuffer));
        }, 'image/jpeg', 0.9);
    });
};

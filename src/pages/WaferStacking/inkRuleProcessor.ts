import { AsciiDie, isNumberBin } from '@/types/ipc';
import { PASS_VALUES } from './priority';

export interface InkRuleConfig {
    goodValues?: Set<string>;
    inkMarker?: string;
}

const DEFAULT_CONFIG: Required<InkRuleConfig> = {
    goodValues: PASS_VALUES,
    inkMarker: 'z'
};

export function processInkRules(
    dies: AsciiDie[],
    config: InkRuleConfig = {}
): {
    processedDies: AsciiDie[];
    filteredDies: AsciiDie[];
} {
    const { goodValues, inkMarker } = { ...DEFAULT_CONFIG, ...config };

    const isGoodDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return true;
        const binValue = isNumberBin(die.bin)
            ? die.bin.number.toString()
            : die.bin.special;
        return goodValues.has(binValue);
    };

    const isFailDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return false;
        const binValue = isNumberBin(die.bin)
            ? die.bin.number.toString()
            : die.bin.special;
        const ignoreFailChars = new Set(['S', '*']);
        if (ignoreFailChars.has(binValue)) return false;
        return !goodValues.has(binValue);
    };

    const dieMap = new Map<string, AsciiDie>();
    dies.forEach(die => dieMap.set(`${die.x},${die.y}`, die));

    const failDies = dies.filter(die => isFailDie(die));
    const failDieMap = new Map<string, AsciiDie>();
    failDies.forEach(die => failDieMap.set(`${die.x},${die.y}`, die));

    const inkMarkedDies = new Map<string, AsciiDie>();

    const checkDirs = [
        [[2, 0], [1, 0]],    // 水平
        [[0, 2], [0, 1]],    // 垂直
        [[2, 2], [1, 1]],    // 主对角线
        [[-2, 2], [-1, 1]],  // 副对角线
    ];

    failDies.forEach(failDie => {
        const fx = failDie.x;
        const fy = failDie.y;

        checkDirs.forEach(([[dx2, dy2], [dx1, dy1]]) => {
            const otherFailX = fx + dx2;
            const otherFailY = fy + dy2;

            const otherFailKey = `${otherFailX},${otherFailY}`;
            if (!failDieMap.has(otherFailKey)) return;

            const goodKey = `${fx + dx1},${fy + dy1}`;
            const goodDie = dieMap.get(goodKey);
            if (!goodDie || !isGoodDie(goodDie)) return;

            if (!inkMarkedDies.has(goodKey)) {
                inkMarkedDies.set(goodKey, {
                    ...goodDie,
                    bin: { special: inkMarker }
                });
            }
        });
    });

    const processedDies = dies.map(die => {
        const key = `${die.x},${die.y}`;
        return inkMarkedDies.has(key) ? inkMarkedDies.get(key)! : { ...die };
    });

    const filteredDies = [
        ...failDies.map(die => ({ ...die })),
        ...Array.from(inkMarkedDies.values())
    ];

    return { processedDies, filteredDies };
}
import { AsciiDie, isNumberBin } from '@/types/ipc';
import { PASS_VALUES } from './priority';

export interface InkRuleConfig {
    goodValues?: Set<string>;
    inkMarker?: string;
    failThreshold?: number;
}

const DEFAULT_CONFIG: Required<InkRuleConfig> = {
    goodValues: PASS_VALUES,
    inkMarker: 'z',
    failThreshold: 2
};

export function processInkRules(
    dies: AsciiDie[],
    config: InkRuleConfig = {}
): {
    processedDies: AsciiDie[];
    filteredDies: AsciiDie[];
} {
    const { goodValues, inkMarker, failThreshold } = { ...DEFAULT_CONFIG, ...config };
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

    const goodDieFailCountMap = new Map<string, number>();

    const neighborDirs = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1]
    ];

    failDies.forEach(failDie => {
        const fx = failDie.x;
        const fy = failDie.y;

        neighborDirs.forEach(([dx, dy]) => {
            const neighborX = fx + dx;
            const neighborY = fy + dy;
            const neighborKey = `${neighborX},${neighborY}`;
            const neighborDie = dieMap.get(neighborKey);
            if (isGoodDie(neighborDie) && neighborDie) {
                goodDieFailCountMap.set(
                    neighborKey,
                    (goodDieFailCountMap.get(neighborKey) || 0) + 1
                );
            }
        });
    });

    const inkMarkedDies = new Map<string, AsciiDie>();
    goodDieFailCountMap.forEach((count, key) => {
        if (count >= failThreshold) {
            const targetDie = dieMap.get(key);
            if (targetDie) {
                inkMarkedDies.set(key, {
                    ...targetDie,
                    bin: { special: inkMarker }
                });
            }
        }
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
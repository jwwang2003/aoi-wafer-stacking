import { AsciiDie, isNumberBin } from '@/types/ipc';
import { binValueMatchesValues } from '@/pages/Config/binConfig';

export interface InkRuleConfig {
    goodValues?: Set<string>;
    failValues?: Set<string>;
    inkMarker?: string;
    failThreshold?: number;
}

const DEFAULT_GOOD_VALUES = new Set<string>();

const DEFAULT_CONFIG = {
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
    const goodValues = config.goodValues ?? DEFAULT_GOOD_VALUES;
    const failValues = config.failValues;
    const inkMarker = config.inkMarker ?? DEFAULT_CONFIG.inkMarker;
    const failThreshold = config.failThreshold ?? DEFAULT_CONFIG.failThreshold;
    const isGoodDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return true;
        return binValueMatchesValues(die.bin, goodValues);
    };

    const isFailDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return false;
        const isGood = binValueMatchesValues(die.bin, goodValues);

        const ignoreFailChars = new Set(['S', '*']);
        const hasIgnore = !isNumberBin(die.bin) && ignoreFailChars.has(die.bin.special);

        if (hasIgnore) return false;
        if (failValues) {
            return binValueMatchesValues(die.bin, failValues);
        }
        return !isGood;
    };

    const dieMap = new Map<string, AsciiDie>();
    dies.forEach(die => dieMap.set(`${die.x},${die.y}`, die));

    const failDies = dies.filter(die => isFailDie(die));
    const goodDieFailCountMap = new Map<string, number>();

    const neighborDirs = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
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
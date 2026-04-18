import { AsciiDie, isNumberBin } from '@/types/ipc';

export interface InkRuleConfig {
    goodValues?: Set<string>;
    inkMarker?: string;
    failThreshold?: number;
}

const DEFAULT_CONFIG: Required<InkRuleConfig> = {
    goodValues: new Set<string>(),
    inkMarker: 'z',
    failThreshold: 2
};

const NUM_TO_LETTER: Record<string, string> = {};
const LETTER_TO_NUM: Record<string, number> = {};

for (let n = 10; n <= 35; n++) {
    const c = String.fromCharCode(65 + (n - 10));
    NUM_TO_LETTER[String(n)] = c;
    LETTER_TO_NUM[c] = n;
}

function getBinAllKeys(bin: AsciiDie['bin']): string[] {
    const keys = new Set<string>();

    if (isNumberBin(bin)) {
        const numStr = bin.number.toString();
        keys.add(numStr);
        const letter = NUM_TO_LETTER[numStr];
        if (letter) keys.add(letter);
    } else {
        const special = bin.special || '';
        keys.add(special);
        const num = LETTER_TO_NUM[special];
        if (num != null) keys.add(num.toString());
    }
    return Array.from(keys);
}

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
        const allKeys = getBinAllKeys(die.bin);
        return allKeys.some(key => goodValues.has(key));
    };

    const isFailDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return false;
        const allKeys = getBinAllKeys(die.bin);
        const isGood = allKeys.some(key => goodValues.has(key));

        const ignoreFailChars = new Set(['S', '*']);
        const hasIgnore = allKeys.some(key => ignoreFailChars.has(key));

        if (hasIgnore) return false;
        return !isGood;
    };

    const dieMap = new Map<string, AsciiDie>();
    dies.forEach(die => dieMap.set(`${die.x},${die.y}`, die));

    const failDies = dies.filter(die => isFailDie(die));
    const failDieMap = new Map<string, AsciiDie>();
    failDies.forEach(die => failDieMap.set(`${die.x},${die.y}`, die));

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
import { AsciiDie } from '@/types/ipc';
import { binValueMatchesValues } from '@/pages/Config/binConfig';
import { isProtectedMarkerDie } from '@/utils/waferSubstrateRenderer';

export interface GdbnRuleConfig {
    goodValues?: Set<string>;
    failValues?: Set<string>;
    inkMarker?: string;
    minRunLength?: number;
}

const DEFAULT_GOOD_VALUES = new Set<string>();

const DEFAULT_CONFIG = {
    inkMarker: 'z',
    minRunLength: 10
};

interface RunBox {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

/**
 * GDBN (Good Die Bad Neighborhood) rule: a run of >= minRunLength consecutive
 * fail dies along a row or a column kills the good dies surrounding the run
 * (the one-die ring around it, four diagonal corners included).
 */
export function processGdbnRule(
    dies: AsciiDie[],
    config: GdbnRuleConfig = {}
): {
    processedDies: AsciiDie[];
    inkedDies: AsciiDie[];
} {
    const goodValues = config.goodValues ?? DEFAULT_GOOD_VALUES;
    const failValues = config.failValues;
    const inkMarker = config.inkMarker ?? DEFAULT_CONFIG.inkMarker;
    const minRunLength = config.minRunLength ?? DEFAULT_CONFIG.minRunLength;

    const isGoodDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return false;
        return binValueMatchesValues(die.bin, goodValues);
    };

    const isFailDie = (die: AsciiDie | undefined): boolean => {
        if (!die) return false;
        if (isProtectedMarkerDie(die)) return false;
        if (failValues) {
            return binValueMatchesValues(die.bin, failValues);
        }
        return !binValueMatchesValues(die.bin, goodValues);
    };

    const dieMap = new Map<string, AsciiDie>();
    dies.forEach(die => dieMap.set(`${die.x},${die.y}`, die));

    const failDies = Array.from(dieMap.values()).filter(die => isFailDie(die));

    const inkTargets = new Set<string>();
    const markRunPerimeter = (box: RunBox) => {
        for (let x = box.x0 - 1; x <= box.x1 + 1; x++) {
            for (let y = box.y0 - 1; y <= box.y1 + 1; y++) {
                const key = `${x},${y}`;
                const die = dieMap.get(key);
                if (die && !isProtectedMarkerDie(die) && isGoodDie(die)) {
                    inkTargets.add(key);
                }
            }
        }
    };

    // Runs are consecutive grid coordinates; a missing die breaks the run.
    const collectRuns = (
        groupOf: (die: AsciiDie) => number,
        posOf: (die: AsciiDie) => number,
        boxOf: (group: number, start: number, end: number) => RunBox
    ) => {
        const groups = new Map<number, number[]>();
        failDies.forEach(die => {
            const group = groupOf(die);
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)!.push(posOf(die));
        });

        groups.forEach((positions, group) => {
            positions.sort((a, b) => a - b);
            let runStart = 0;
            for (let i = 1; i <= positions.length; i++) {
                if (i < positions.length && positions[i] === positions[i - 1] + 1) continue;
                if (i - runStart >= minRunLength) {
                    markRunPerimeter(boxOf(group, positions[runStart], positions[i - 1]));
                }
                runStart = i;
            }
        });
    };

    // Horizontal runs (along a row), then vertical runs (along a column)
    collectRuns(
        die => die.y,
        die => die.x,
        (y, x0, x1) => ({ x0, x1, y0: y, y1: y })
    );
    collectRuns(
        die => die.x,
        die => die.y,
        (x, y0, y1) => ({ x0: x, x1: x, y0, y1 })
    );

    const inkMarkedDies = new Map<string, AsciiDie>();
    inkTargets.forEach(key => {
        const targetDie = dieMap.get(key);
        if (targetDie) {
            inkMarkedDies.set(key, {
                ...targetDie,
                bin: { special: inkMarker }
            });
        }
    });

    const processedDies = dies.map(die => {
        const key = `${die.x},${die.y}`;
        return inkMarkedDies.has(key) ? inkMarkedDies.get(key)! : { ...die };
    });

    return { processedDies, inkedDies: Array.from(inkMarkedDies.values()) };
}

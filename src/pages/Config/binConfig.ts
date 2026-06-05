import type { BinValue } from '@/types/ipc';

export interface BinConfig {
    id: string;
    label: string;
    isGoodBin: boolean;
    order?: number;
}

export interface BinMappingRule {
    startNumber: number;
    startLetter: string;
}

export const BIN_MAPPING_RULE: BinMappingRule = {
    startNumber: 10,
    startLetter: 'A'
};

export function numberToBinLetter(num: number): string {
    const { startNumber, startLetter } = BIN_MAPPING_RULE;
    if (num < startNumber) {
        return num.toString();
    }
    const offset = num - startNumber;
    const startCode = startLetter.charCodeAt(0);
    const letterCode = startCode + offset;
    if (letterCode > 'Z'.charCodeAt(0)) {
        const first = Math.floor(offset / 26);
        const second = offset % 26;
        return String.fromCharCode(startCode + first - 1) + String.fromCharCode(startCode + second);
    }
    return String.fromCharCode(letterCode);
}

export function binLetterToNumber(letter: string): number | null {
    const { startNumber, startLetter } = BIN_MAPPING_RULE;
    if (/^\d+$/.test(letter)) {
        return parseInt(letter, 10);
    }
    const upperLetter = letter.toUpperCase();
    if (upperLetter.length === 1) {
        const code = upperLetter.charCodeAt(0);
        const startCode = startLetter.charCodeAt(0);
        if (code >= startCode && code <= 'Z'.charCodeAt(0)) {
            return startNumber + (code - startCode);
        }
    } else if (upperLetter.length === 2) {
        const firstCode = upperLetter.charCodeAt(0);
        const secondCode = upperLetter.charCodeAt(1);
        const startCode = startLetter.charCodeAt(0);
        if (firstCode >= startCode && secondCode >= startCode) {
            const offset = (firstCode - startCode + 1) * 26 + (secondCode - startCode);
            return startNumber + offset;
        }
    }
    return null;
}

export const BIN_VALUES_CONFIG: BinConfig[] = [
    { id: 'BIN 1', label: 'BIN 1', isGoodBin: true, order: 1 },
    { id: 'BIN 2', label: 'BIN 2', isGoodBin: false, order: 2 },
    { id: 'BIN 3', label: 'BIN 3', isGoodBin: false, order: 3 },
    { id: 'BIN 4', label: 'BIN 4', isGoodBin: false, order: 4 },
    { id: 'BIN 5', label: 'BIN 5', isGoodBin: false, order: 5 },
    { id: 'BIN 6', label: 'BIN 6', isGoodBin: false, order: 6 },
    { id: 'BIN 7', label: 'BIN 7', isGoodBin: false, order: 7 },
    { id: 'BIN 8', label: 'BIN 8', isGoodBin: false, order: 8 },
    { id: 'BIN 9', label: 'BIN 9', isGoodBin: false, order: 9 },
    { id: 'BIN 10', label: 'BIN 10', isGoodBin: false, order: 10 },
    { id: 'BIN 11', label: 'BIN 11', isGoodBin: false, order: 11 },
    { id: 'BIN 12', label: 'BIN 12', isGoodBin: false, order: 12 },
    { id: 'BIN 13', label: 'BIN 13', isGoodBin: false, order: 13 },
    { id: 'BIN 14', label: 'BIN 14', isGoodBin: false, order: 14 },
    { id: 'BIN 15', label: 'BIN 15', isGoodBin: false, order: 15 },
    { id: 'BIN 16', label: 'BIN 16', isGoodBin: true, order: 16 },
    { id: 'BIN 17', label: 'BIN 17', isGoodBin: true, order: 17 },
    { id: 'BIN 18', label: 'BIN 18', isGoodBin: true, order: 18 },
    { id: 'BIN 19', label: 'BIN 19', isGoodBin: true, order: 19 },
    { id: 'BIN 20', label: 'BIN 20', isGoodBin: false, order: 20 },
];

export const getGoodBinIds = (): string[] => {
    return BIN_VALUES_CONFIG.filter(bin => bin.isGoodBin).map(bin => bin.id);
};

export const binIdToPassValues = (binId: string): string[] => {
    const normalized = binId.trim();
    const match = normalized.match(/^BIN\s+(\d+)$/i);
    if (!match) return [normalized];

    const num = Number(match[1]);
    if (!Number.isFinite(num)) return [normalized];

    const values = new Set<string>([String(num)]);
    values.add(numberToBinLetter(num));
    return Array.from(values);
};

export const createPassValueSet = (binIds: string[]): Set<string> => {
    return new Set(binIds.flatMap(binIdToPassValues));
};

export const getGoodBinIdsFromConfig = (config: BinConfigFile): string[] => {
    return config.binValues.filter(bin => bin.isGoodBin).map(bin => bin.id);
};

export const getBadBinIdsFromConfig = (config: BinConfigFile): string[] => {
    return config.binValues.filter(bin => !bin.isGoodBin).map(bin => bin.id);
};

export const binValueToComparableValues = (bin: BinValue): string[] => {
    const values = new Set<string>();

    if ('number' in bin) {
        const numericValue = bin.number.toString();
        values.add(numericValue);
        values.add(numberToBinLetter(bin.number));
    } else {
        const specialValue = bin.special || '';
        if (specialValue) {
            values.add(specialValue);
        }
        if (/^[A-Z]+$/i.test(specialValue)) {
            const numericValue = binLetterToNumber(specialValue);
            if (numericValue !== null) {
                values.add(numericValue.toString());
                values.add(numberToBinLetter(numericValue));
            }
        }
    }

    return Array.from(values);
};

export const binValueMatchesValues = (bin: BinValue, values: Set<string>): boolean => {
    return binValueToComparableValues(bin).some(value => values.has(value));
};

export const getAllBinIds = (): string[] => {
    return BIN_VALUES_CONFIG.map(bin => bin.id);
};

export const getBinConfigById = (id: string): BinConfig | undefined => {
    return BIN_VALUES_CONFIG.find(bin => bin.id === id);
};

export const isGoodBin = (binId: string): boolean => {
    const config = getBinConfigById(binId);
    return config?.isGoodBin ?? false;
};

export const getBinDisplayName = (binNumber: number | string): string => {
    const num = typeof binNumber === 'string' ? parseInt(binNumber.replace('BIN ', ''), 10) : binNumber;
    const letter = numberToBinLetter(num);
    return `BIN ${num} (${letter})`;
};

export const updateBinConfig = (newConfigs: BinConfig[]) => {
    console.log('Update bin config:', newConfigs);
};

export const generateBinConfigs = (count: number, goodBinNumbers: number[] = []): BinConfig[] => {
    const configs: BinConfig[] = [];
    for (let i = 1; i <= count; i++) {
        configs.push({
            id: `BIN ${i}`,
            label: `BIN ${i}`,
            isGoodBin: goodBinNumbers.includes(i),
            order: i
        });
    }
    return configs;
};

export const DEFAULT_BIN_VALUES_CONFIG: BinConfig[] = BIN_VALUES_CONFIG;
export const DEFAULT_MAPPING_RULE: BinMappingRule = BIN_MAPPING_RULE;

export interface BinConfigFile {
    binMappingRule: BinMappingRule;
    binValues: BinConfig[];
}

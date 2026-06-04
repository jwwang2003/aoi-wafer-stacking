import { describe, expect, it } from 'vitest';

import {
    binIdToPassValues,
    binLetterToNumber,
    createPassValueSet,
    numberToBinLetter,
} from './binConfig';

describe('binConfig', () => {
    it('keeps single digit bin numbers as strings', () => {
        expect(numberToBinLetter(1)).toBe('1');
        expect(numberToBinLetter(9)).toBe('9');
    });

    it('maps bin numbers from 10 onward to letters', () => {
        expect(numberToBinLetter(10)).toBe('A');
        expect(numberToBinLetter(16)).toBe('G');
        expect(numberToBinLetter(20)).toBe('K');
        expect(numberToBinLetter(36)).toBe('AA');
    });

    it('maps bin letters back to numbers', () => {
        expect(binLetterToNumber('A')).toBe(10);
        expect(binLetterToNumber('g')).toBe(16);
        expect(binLetterToNumber('AA')).toBe(36);
        expect(binLetterToNumber('!')).toBeNull();
    });

    it('expands BIN ids to numeric and letter pass values without duplicates', () => {
        const bin16PassValues = binIdToPassValues('BIN 16');

        expect(bin16PassValues).toHaveLength(2);
        expect(new Set(bin16PassValues)).toEqual(new Set(['16', 'G']));
        expect(binIdToPassValues('bin 1')).toEqual(['1']);
    });

    it('creates pass value sets from bin ids and manual values', () => {
        expect(createPassValueSet(['BIN 1', 'BIN 16', 'manual'])).toEqual(
            new Set(['1', '16', 'G', 'manual']),
        );
    });
});

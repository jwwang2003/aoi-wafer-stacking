import { describe, expect, it } from 'vitest';

import { createPassValueSet } from '../Config/binConfig';
import { AsciiDie } from '@/types/ipc';
import { processInkRules } from './inkRuleProcessor';

describe('processInkRules', () => {
    it('converts a good center die touching at least two fail dies to ink marker without mutating input', () => {
        const dies: AsciiDie[] = [
            { x: 0, y: 0, bin: { number: 16 } },
            { x: -1, y: 0, bin: { number: 2 } },
            { x: 1, y: 0, bin: { number: 3 } },
        ];
        const originalDies = dies.map(die => ({ ...die, bin: { ...die.bin } }));

        const { processedDies, filteredDies } = processInkRules(dies, {
            goodValues: createPassValueSet(['BIN 16']),
        });

        expect(processedDies.find(die => die.x === 0 && die.y === 0)?.bin).toEqual({ special: 'z' });
        expect(filteredDies).toHaveLength(3);
        expect(dies).toEqual(originalDies);
    });

    it('treats special G as good from BIN 16 pass values and marks it when adjacent to two fail dies', () => {
        const dies: AsciiDie[] = [
            { x: 0, y: 0, bin: { special: 'G' } },
            { x: -1, y: 0, bin: { number: 2 } },
            { x: 1, y: 0, bin: { number: 3 } },
        ];

        const { processedDies } = processInkRules(dies, {
            goodValues: createPassValueSet(['BIN 16']),
        });

        expect(processedDies.find(die => die.x === 0 && die.y === 0)?.bin).toEqual({ special: 'z' });
    });

    it('does not count S or star alignment markers as fails', () => {
        const dies: AsciiDie[] = [
            { x: 0, y: 0, bin: { number: 16 } },
            { x: -1, y: 0, bin: { special: 'S' } },
            { x: 0, y: -1, bin: { special: '*' } },
            { x: 1, y: 0, bin: { number: 2 } },
        ];

        const { processedDies } = processInkRules(dies, {
            goodValues: createPassValueSet(['BIN 16']),
        });

        expect(processedDies.find(die => die.x === 0 && die.y === 0)?.bin).toEqual({ number: 16 });
    });

    it('only counts selected fail bins when failValues are provided', () => {
        const dies: AsciiDie[] = [
            { x: 0, y: 0, bin: { number: 16 } },
            { x: -1, y: 0, bin: { number: 2 } },
            { x: 1, y: 0, bin: { number: 3 } },
        ];

        const { processedDies } = processInkRules(dies, {
            goodValues: createPassValueSet(['BIN 16']),
            failValues: createPassValueSet(['BIN 2']),
        });

        expect(processedDies.find(die => die.x === 0 && die.y === 0)?.bin).toEqual({ number: 16 });
    });
});

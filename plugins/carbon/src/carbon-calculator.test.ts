import {
    getModelConfig,
    calculateEnergy,
    calculateCO2FromEnergy,
    calculateRecordCarbon,
    calculateSessionCarbon,
    calculateCarbonFromTokens,
    calculateEquivalents,
    formatCO2,
    formatEnergy
} from './carbon-calculator';

describe('getModelConfig', () => {
    it('returns config for a known model ID', () => {
        const config = getModelConfig('claude-opus-4-5-20251101');
        expect(config.whPer1000Tokens).toBe(0.03);
        expect(config.family).toBe('opus');
        expect(config.displayName).toBe('Claude Opus 4.5');
    });

    it('returns config for each model family', () => {
        expect(getModelConfig('claude-sonnet-4-20250514').family).toBe('sonnet');
        expect(getModelConfig('claude-3-5-haiku-20241022').family).toBe('haiku');
    });

    it('falls back to family-based config for unknown opus model', () => {
        const config = getModelConfig('claude-opus-99');
        expect(config.family).toBe('opus');
        expect(config.whPer1000Tokens).toBe(0.028);
    });

    it('falls back to family-based config for unknown sonnet model', () => {
        const config = getModelConfig('claude-sonnet-99');
        expect(config.family).toBe('sonnet');
        expect(config.whPer1000Tokens).toBe(0.015);
    });

    it('falls back to family-based config for unknown haiku model', () => {
        const config = getModelConfig('claude-haiku-99');
        expect(config.family).toBe('haiku');
        expect(config.whPer1000Tokens).toBe(0.005);
    });

    it('returns default config for completely unknown model', () => {
        const config = getModelConfig('gpt-4');
        expect(config.family).toBe('unknown');
        expect(config.whPer1000Tokens).toBe(0.015);
    });
});

describe('calculateEnergy', () => {
    it('calculates energy with PUE factor', () => {
        const config = getModelConfig('claude-opus-4-5-20251101');
        const result = calculateEnergy(10000, config);
        // 10000/1000 * 0.03 * 1.2 = 0.36 Wh
        expect(result.energyWh).toBeCloseTo(0.36);
        expect(result.energyKwh).toBeCloseTo(0.00036);
    });

    it('returns zero for zero tokens', () => {
        const result = calculateEnergy(0);
        expect(result.energyWh).toBe(0);
        expect(result.energyKwh).toBe(0);
    });

    it('uses default model config when none provided', () => {
        const result = calculateEnergy(1000);
        // 1000/1000 * 0.015 * 1.2 = 0.018 Wh
        expect(result.energyWh).toBeCloseTo(0.018);
    });
});

describe('calculateCO2FromEnergy', () => {
    it('converts energy to CO2 grams', () => {
        // 1 Wh = 0.001 kWh * 300 gCO2/kWh = 0.3g
        expect(calculateCO2FromEnergy(1)).toBeCloseTo(0.3);
    });

    it('returns zero for zero energy', () => {
        expect(calculateCO2FromEnergy(0)).toBe(0);
    });

    it('handles large energy values', () => {
        // 1000 Wh = 1 kWh * 300 = 300g
        expect(calculateCO2FromEnergy(1000)).toBeCloseTo(300);
    });
});

describe('calculateRecordCarbon', () => {
    it('calculates carbon for a single record', () => {
        const result = calculateRecordCarbon({
            requestId: 'test',
            model: 'claude-opus-4-5-20251101',
            inputTokens: 5000,
            outputTokens: 3000,
            cacheCreationTokens: 1000,
            cacheReadTokens: 1000,
            timestamp: new Date()
        });

        // Total tokens: 10000
        // Energy: 10000/1000 * 0.03 * 1.2 = 0.36 Wh
        // CO2: 0.36/1000 * 300 = 0.108g
        expect(result.energy.energyWh).toBeCloseTo(0.36);
        expect(result.co2Grams).toBeCloseTo(0.108);
        expect(result.co2Kg).toBeCloseTo(0.000108);
        expect(result.modelBreakdown).toHaveProperty('opus');
    });
});

describe('calculateSessionCarbon', () => {
    it('aggregates across multiple models', () => {
        const result = calculateSessionCarbon({
            sessionId: 'test',
            projectPath: '/test',
            records: [],
            totals: {
                inputTokens: 10000,
                outputTokens: 5000,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                totalTokens: 15000
            },
            modelBreakdown: {
                'claude-opus-4-5-20251101': 10000,
                'claude-3-5-haiku-20241022': 5000
            },
            primaryModel: 'claude-opus-4-5-20251101',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Opus: 10000/1000 * 0.03 * 1.2 = 0.36 Wh
        // Haiku: 5000/1000 * 0.006 * 1.2 = 0.036 Wh
        // Total: 0.396 Wh
        expect(result.energy.energyWh).toBeCloseTo(0.396);
        expect(result.modelBreakdown).toHaveProperty('opus');
        expect(result.modelBreakdown).toHaveProperty('haiku');
        expect(result.co2Grams).toBeGreaterThan(0);
    });

    it('groups models by family', () => {
        const result = calculateSessionCarbon({
            sessionId: 'test',
            projectPath: '/test',
            records: [],
            totals: {
                inputTokens: 10000,
                outputTokens: 0,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                totalTokens: 10000
            },
            modelBreakdown: {
                'claude-3-5-sonnet-20241022': 5000,
                'claude-sonnet-4-20250514': 5000
            },
            primaryModel: 'claude-3-5-sonnet-20241022',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Both are sonnet family, should be grouped
        expect(result.modelBreakdown).toHaveProperty('sonnet');
        expect(Object.keys(result.modelBreakdown)).toHaveLength(1);
    });
});

describe('calculateCarbonFromTokens', () => {
    it('calculates from raw token counts', () => {
        const result = calculateCarbonFromTokens(5000, 3000, 1000, 1000, 'claude-opus-4-5-20251101');
        expect(result.energy.energyWh).toBeCloseTo(0.36);
        expect(result.co2Grams).toBeCloseTo(0.108);
    });

    it('uses defaults for optional parameters', () => {
        const result = calculateCarbonFromTokens(1000, 500);
        // 1500 tokens, unknown model (0.015 Wh/1K), PUE 1.2
        // 1500/1000 * 0.015 * 1.2 = 0.027 Wh
        expect(result.energy.energyWh).toBeCloseTo(0.027);
    });
});

describe('calculateEquivalents', () => {
    it('calculates relatable equivalents', () => {
        const eq = calculateEquivalents(120);
        expect(eq.kmDriven).toBeCloseTo(1); // 120g / 120g per km
        expect(eq.phoneCharges).toBeCloseTo(15); // 120g / 8g per charge
        expect(eq.ledLightHours).toBeCloseTo(40); // 120g / 3g per hour
        expect(eq.cupsOfCoffee).toBeCloseTo(120 / 21);
        expect(eq.googleSearches).toBeCloseTo(600); // 120g / 0.2g per search
    });

    it('returns zero equivalents for zero CO2', () => {
        const eq = calculateEquivalents(0);
        expect(eq.kmDriven).toBe(0);
        expect(eq.phoneCharges).toBe(0);
    });
});

describe('formatCO2', () => {
    it('formats very small amounts', () => {
        expect(formatCO2(0.005)).toBe('< 0.01g');
    });

    it('formats sub-gram amounts', () => {
        expect(formatCO2(0.15)).toBe('0.15g');
    });

    it('formats gram amounts', () => {
        expect(formatCO2(5.678)).toBe('5.68g');
    });

    it('formats kilogram amounts', () => {
        expect(formatCO2(1500)).toBe('1.500kg');
    });

    it('handles boundary at 1g', () => {
        expect(formatCO2(0.99)).toBe('0.99g');
        expect(formatCO2(1.0)).toBe('1.00g');
    });

    it('handles boundary at 1000g', () => {
        expect(formatCO2(999.99)).toBe('999.99g');
        expect(formatCO2(1000)).toBe('1.000kg');
    });
});

describe('formatEnergy', () => {
    it('formats very small amounts', () => {
        expect(formatEnergy(0.0005)).toBe('< 0.001 Wh');
    });

    it('formats sub-Wh amounts', () => {
        expect(formatEnergy(0.123)).toBe('0.123 Wh');
    });

    it('formats Wh amounts', () => {
        expect(formatEnergy(5.678)).toBe('5.68 Wh');
    });

    it('formats kWh amounts', () => {
        expect(formatEnergy(1500)).toBe('1.500 kWh');
    });
});

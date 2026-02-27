import { describe, expect, it } from 'bun:test';

import {
    calculateCarbonFromTokens,
    calculateCO2FromEnergy,
    calculateEnergy,
    calculateRecordCarbon,
    calculateSessionCarbon,
    formatCO2,
    formatEnergy,
    getModelConfig
} from './carbon-calculator';

describe('getModelConfig', () => {
    it('returns config for a known model ID', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        expect(config.family).toBe('sonnet');
        expect(config.displayName).toBe('Claude 4.5 Sonnet');
        expect(config.medianTps).toBe(81);
        expect(config.medianTtftSeconds).toBe(1.27);
        expect(config.pue).toBe(1.14);
        expect(config.cif).toBe(0.3);
    });

    it('returns config for each model family', () => {
        expect(getModelConfig('claude-opus-4-20250514').family).toBe('opus');
        expect(getModelConfig('claude-haiku-4-5-20251001').family).toBe('haiku');
    });

    it('falls back to family-based config for unknown opus model', () => {
        const config = getModelConfig('claude-opus-99');
        expect(config.family).toBe('opus');
        expect(config.medianTps).toBe(58); // Claude Opus 4.1 defaults
    });

    it('falls back to family-based config for unknown sonnet model', () => {
        const config = getModelConfig('claude-sonnet-99');
        expect(config.family).toBe('sonnet');
        expect(config.medianTps).toBe(81); // Claude 4.5 Sonnet defaults
    });

    it('falls back to family-based config for unknown haiku model', () => {
        const config = getModelConfig('claude-haiku-99');
        expect(config.family).toBe('haiku');
        expect(config.medianTps).toBe(148); // Claude 4.5 Haiku defaults
    });

    it('returns default config for completely unknown model', () => {
        const config = getModelConfig('gpt-4');
        expect(config.family).toBe('unknown');
        // Defaults to Sonnet-level
        expect(config.medianTps).toBe(81);
    });
});

describe('calculateEnergy', () => {
    it('calculates energy using Jegham formula', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        // 1000 output tokens
        // inferenceTime = (1.27 + 1000/81) / 3600 ≈ 0.003783 hours
        // powerMin = 5.6*0.055 + 4.6*0.0625 = 0.5955 kW
        // powerMax = 5.6*0.075 + 4.6*0.0625 = 0.7075 kW
        // energyMin = 0.003783 * 0.5955 * 1.14 * 1000 ≈ 2.568 Wh
        // energyMax = 0.003783 * 0.7075 * 1.14 * 1000 ≈ 3.051 Wh
        // expected = 0.5 * (2.568 + 3.051) ≈ 2.810 Wh
        const result = calculateEnergy(1000, config);
        expect(result.energyWh).toBeCloseTo(2.81, 1);
        expect(result.energyKwh).toBeCloseTo(0.00281, 4);
    });

    it('returns TTFT-only energy for zero output tokens', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        // With 0 output tokens, still incurs TTFT cost
        // inferenceTime = 1.27 / 3600 ≈ 0.000353 hours
        const result = calculateEnergy(0, config);
        expect(result.energyWh).toBeGreaterThan(0);
        expect(result.energyWh).toBeCloseTo(0.262, 1);
    });

    it('uses default model config when none provided', () => {
        // Default is Sonnet 4.5 level
        const result = calculateEnergy(1000);
        expect(result.energyWh).toBeCloseTo(2.81, 1);
    });

    it('scales with output token count', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        const small = calculateEnergy(100, config);
        const large = calculateEnergy(10000, config);
        expect(large.energyWh).toBeGreaterThan(small.energyWh);
    });
});

describe('calculateCO2FromEnergy', () => {
    it('converts energy to CO2 grams using model CIF', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        // CIF = 0.300 kgCO2e/kWh
        // 1 Wh → (1/1000) * 0.300 * 1000 = 0.3g
        expect(calculateCO2FromEnergy(1, config)).toBeCloseTo(0.3);
    });

    it('returns zero for zero energy', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        expect(calculateCO2FromEnergy(0, config)).toBe(0);
    });

    it('handles large energy values', () => {
        const config = getModelConfig('claude-sonnet-4-5-20250929');
        // 1000 Wh * 0.300 = 300g
        expect(calculateCO2FromEnergy(1000, config)).toBeCloseTo(300);
    });
});

describe('calculateRecordCarbon', () => {
    it('calculates carbon for a single record using output tokens', () => {
        const result = calculateRecordCarbon({
            requestId: 'test',
            model: 'claude-opus-4-20250514',
            inputTokens: 5000,
            outputTokens: 3000,
            cacheCreationTokens: 1000,
            cacheReadTokens: 1000,
            timestamp: new Date()
        });

        // Only outputTokens (3000) affect energy via TPS
        // TPS=55, TTFT=1.19
        // inferenceTime = (1.19 + 3000/55) / 3600 ≈ 0.01548 hours
        // Energy ≈ 11.5 Wh, CO2 ≈ 3.45g
        expect(result.energy.energyWh).toBeCloseTo(11.5, 0);
        expect(result.co2Grams).toBeCloseTo(3.45, 0);
        expect(result.co2Kg).toBeCloseTo(0.00345, 3);
        expect(result.modelBreakdown).toHaveProperty('opus');
    });
});

describe('calculateSessionCarbon', () => {
    it('aggregates across multiple records', () => {
        const result = calculateSessionCarbon({
            sessionId: 'test',
            projectPath: '/test',
            projectIdentifier: 'test',
            records: [
                {
                    requestId: 'r1',
                    model: 'claude-opus-4-20250514',
                    inputTokens: 5000,
                    outputTokens: 1000,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 0,
                    timestamp: new Date()
                },
                {
                    requestId: 'r2',
                    model: 'claude-haiku-4-5-20251001',
                    inputTokens: 2000,
                    outputTokens: 500,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 0,
                    timestamp: new Date()
                }
            ],
            totals: {
                inputTokens: 7000,
                outputTokens: 1500,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                totalTokens: 8500
            },
            modelBreakdown: {
                'claude-opus-4-20250514': 6000,
                'claude-haiku-4-5-20251001': 2500
            },
            primaryModel: 'claude-opus-4-20250514',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Each record gets its own TTFT cost
        expect(result.energy.energyWh).toBeGreaterThan(0);
        expect(result.modelBreakdown).toHaveProperty('opus');
        expect(result.modelBreakdown).toHaveProperty('haiku');
        expect(result.co2Grams).toBeGreaterThan(0);
    });

    it('groups models by family', () => {
        const result = calculateSessionCarbon({
            sessionId: 'test',
            projectPath: '/test',
            projectIdentifier: 'test',
            records: [
                {
                    requestId: 'r1',
                    model: 'claude-sonnet-4-5-20250929',
                    inputTokens: 3000,
                    outputTokens: 500,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 0,
                    timestamp: new Date()
                },
                {
                    requestId: 'r2',
                    model: 'claude-sonnet-4-20250514',
                    inputTokens: 2000,
                    outputTokens: 500,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 0,
                    timestamp: new Date()
                }
            ],
            totals: {
                inputTokens: 5000,
                outputTokens: 1000,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                totalTokens: 6000
            },
            modelBreakdown: {
                'claude-sonnet-4-5-20250929': 3500,
                'claude-sonnet-4-20250514': 2500
            },
            primaryModel: 'claude-sonnet-4-5-20250929',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Both are sonnet family, should be grouped
        expect(result.modelBreakdown).toHaveProperty('sonnet');
        expect(Object.keys(result.modelBreakdown)).toHaveLength(1);
    });
});

describe('calculateCarbonFromTokens', () => {
    it('calculates from raw token counts using output tokens', () => {
        const result = calculateCarbonFromTokens(5000, 3000, 1000, 1000, 'claude-opus-4-20250514');
        // Same as calculateRecordCarbon with 3000 output tokens
        expect(result.energy.energyWh).toBeCloseTo(11.5, 0);
        expect(result.co2Grams).toBeCloseTo(3.45, 0);
    });

    it('uses defaults for optional parameters', () => {
        const result = calculateCarbonFromTokens(1000, 500);
        // Default (Sonnet 4.5), 500 output tokens
        // inferenceTime = (1.27 + 500/81) / 3600 ≈ 0.002067 hours
        // Energy ≈ 1.54 Wh
        expect(result.energy.energyWh).toBeCloseTo(1.54, 1);
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

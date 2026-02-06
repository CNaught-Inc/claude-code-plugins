/**
 * Carbon Calculator
 *
 * Converts token usage into CO2 estimates using the ecologits.ai methodology.
 * Reference: https://ecologits.ai/latest/methodology/llm_inference
 *
 * The calculation considers:
 * 1. Energy consumption per token (varies by model size)
 * 2. Carbon intensity of electricity (gCO2/kWh)
 * 3. Power Usage Effectiveness (PUE) of data centers
 */

import type { SessionUsage, TokenUsageRecord } from './session-parser.js';

/**
 * Model configuration for energy consumption
 * Based on ecologits.ai methodology and model specifications
 */
interface ModelConfig {
    /** Energy per 1000 tokens in Wh (varies by model size) */
    whPer1000Tokens: number;
    /** Human-readable name */
    displayName: string;
    /** Model family */
    family: 'opus' | 'sonnet' | 'haiku' | 'unknown';
}

/**
 * Model configurations
 *
 * Energy consumption estimates based on:
 * - Model parameter counts (Opus ~175B, Sonnet ~70B, Haiku ~20B estimated)
 * - GPU power consumption for inference
 * - Typical tokens per second throughput
 *
 * Using ecologits.ai methodology:
 * Energy (kWh) = (GPU_Power * Time) / Efficiency
 *
 * Estimated values (Wh per 1000 tokens):
 * - Opus 4.5: ~0.030 Wh/1K tokens (largest, most capable)
 * - Sonnet 4: ~0.015 Wh/1K tokens (medium)
 * - Haiku 3.5: ~0.005 Wh/1K tokens (smallest, fastest)
 */
const MODEL_CONFIGS: Record<string, ModelConfig> = {
    // Opus models
    'claude-opus-4-5-20251101': {
        whPer1000Tokens: 0.03,
        displayName: 'Claude Opus 4.5',
        family: 'opus'
    },
    'claude-opus-4-20250514': {
        whPer1000Tokens: 0.028,
        displayName: 'Claude Opus 4',
        family: 'opus'
    },
    'claude-3-opus-20240229': {
        whPer1000Tokens: 0.025,
        displayName: 'Claude 3 Opus',
        family: 'opus'
    },

    // Sonnet models
    'claude-sonnet-4-20250514': {
        whPer1000Tokens: 0.015,
        displayName: 'Claude Sonnet 4',
        family: 'sonnet'
    },
    'claude-3-5-sonnet-20241022': {
        whPer1000Tokens: 0.014,
        displayName: 'Claude 3.5 Sonnet',
        family: 'sonnet'
    },
    'claude-3-5-sonnet-20240620': {
        whPer1000Tokens: 0.014,
        displayName: 'Claude 3.5 Sonnet',
        family: 'sonnet'
    },
    'claude-3-sonnet-20240229': {
        whPer1000Tokens: 0.012,
        displayName: 'Claude 3 Sonnet',
        family: 'sonnet'
    },

    // Haiku models
    'claude-3-5-haiku-20241022': {
        whPer1000Tokens: 0.006,
        displayName: 'Claude 3.5 Haiku',
        family: 'haiku'
    },
    'claude-3-haiku-20240307': {
        whPer1000Tokens: 0.005,
        displayName: 'Claude 3 Haiku',
        family: 'haiku'
    }
};

/**
 * Default model config for unknown models
 */
const DEFAULT_MODEL_CONFIG: ModelConfig = {
    whPer1000Tokens: 0.015, // Assume Sonnet-level consumption
    displayName: 'Unknown Model',
    family: 'unknown'
};

/**
 * Get model configuration
 */
export function getModelConfig(modelId: string): ModelConfig {
    // Direct match
    if (MODEL_CONFIGS[modelId]) {
        return MODEL_CONFIGS[modelId];
    }

    // Try to match by family
    const lowerModel = modelId.toLowerCase();
    if (lowerModel.includes('opus')) {
        return { ...DEFAULT_MODEL_CONFIG, family: 'opus', whPer1000Tokens: 0.028 };
    }
    if (lowerModel.includes('sonnet')) {
        return { ...DEFAULT_MODEL_CONFIG, family: 'sonnet', whPer1000Tokens: 0.015 };
    }
    if (lowerModel.includes('haiku')) {
        return { ...DEFAULT_MODEL_CONFIG, family: 'haiku', whPer1000Tokens: 0.005 };
    }

    return DEFAULT_MODEL_CONFIG;
}

/**
 * Carbon intensity factors
 *
 * Global average: ~475 gCO2/kWh
 * US average: ~380 gCO2/kWh
 * Cloud providers (with renewables): ~200-300 gCO2/kWh
 *
 * We use a conservative estimate for cloud data centers
 * that have committed to renewable energy
 */
const CARBON_INTENSITY_GCO2_PER_KWH = 300;

/**
 * Power Usage Effectiveness (PUE)
 *
 * PUE accounts for cooling, lighting, and other data center overhead
 * Modern data centers: 1.1-1.3
 * We use 1.2 as a reasonable estimate
 */
const PUE = 1.2;

/**
 * Energy calculation result
 */
export interface EnergyResult {
    /** Energy in watt-hours */
    energyWh: number;
    /** Energy in kilowatt-hours */
    energyKwh: number;
}

/**
 * Carbon calculation result
 */
export interface CarbonResult {
    /** Energy consumption */
    energy: EnergyResult;
    /** CO2 emissions in grams */
    co2Grams: number;
    /** CO2 emissions in kilograms */
    co2Kg: number;
    /** Breakdown by model family */
    modelBreakdown: Record<string, { energyWh: number; co2Grams: number }>;
}

/**
 * Calculate energy consumption for a token count
 */
export function calculateEnergy(
    tokens: number,
    modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG
): EnergyResult {
    const energyWh = (tokens / 1000) * modelConfig.whPer1000Tokens * PUE;
    return {
        energyWh,
        energyKwh: energyWh / 1000
    };
}

/**
 * Calculate CO2 emissions from energy consumption
 */
export function calculateCO2FromEnergy(energyWh: number): number {
    // Convert Wh to kWh and multiply by carbon intensity
    return (energyWh / 1000) * CARBON_INTENSITY_GCO2_PER_KWH;
}

/**
 * Calculate carbon emissions for a single token usage record
 */
export function calculateRecordCarbon(record: TokenUsageRecord): CarbonResult {
    const modelConfig = getModelConfig(record.model);
    const totalTokens =
        record.inputTokens +
        record.outputTokens +
        record.cacheCreationTokens +
        record.cacheReadTokens;

    const energy = calculateEnergy(totalTokens, modelConfig);
    const co2Grams = calculateCO2FromEnergy(energy.energyWh);

    return {
        energy,
        co2Grams,
        co2Kg: co2Grams / 1000,
        modelBreakdown: {
            [modelConfig.family]: {
                energyWh: energy.energyWh,
                co2Grams
            }
        }
    };
}

/**
 * Calculate carbon emissions for an entire session
 */
export function calculateSessionCarbon(session: SessionUsage): CarbonResult {
    const modelBreakdown: Record<string, { energyWh: number; co2Grams: number }> = {};
    let totalEnergyWh = 0;
    let totalCO2 = 0;

    // Calculate per-model totals
    for (const [model, tokens] of Object.entries(session.modelBreakdown)) {
        const modelConfig = getModelConfig(model);
        const energy = calculateEnergy(tokens, modelConfig);
        const co2 = calculateCO2FromEnergy(energy.energyWh);

        totalEnergyWh += energy.energyWh;
        totalCO2 += co2;

        const family = modelConfig.family;
        if (!modelBreakdown[family]) {
            modelBreakdown[family] = { energyWh: 0, co2Grams: 0 };
        }
        modelBreakdown[family].energyWh += energy.energyWh;
        modelBreakdown[family].co2Grams += co2;
    }

    return {
        energy: {
            energyWh: totalEnergyWh,
            energyKwh: totalEnergyWh / 1000
        },
        co2Grams: totalCO2,
        co2Kg: totalCO2 / 1000,
        modelBreakdown
    };
}

/**
 * Calculate carbon for token counts directly
 * Useful for statusline display when we have cumulative tokens
 */
export function calculateCarbonFromTokens(
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number = 0,
    cacheReadTokens: number = 0,
    model: string = 'unknown'
): CarbonResult {
    const modelConfig = getModelConfig(model);
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    const energy = calculateEnergy(totalTokens, modelConfig);
    const co2Grams = calculateCO2FromEnergy(energy.energyWh);

    return {
        energy,
        co2Grams,
        co2Kg: co2Grams / 1000,
        modelBreakdown: {
            [modelConfig.family]: {
                energyWh: energy.energyWh,
                co2Grams
            }
        }
    };
}

/**
 * Relatable carbon equivalents
 */
export interface CarbonEquivalents {
    /** Kilometers driven in an average car */
    kmDriven: number;
    /** Number of smartphone full charges */
    phoneCharges: number;
    /** Hours of LED light (10W) usage */
    ledLightHours: number;
    /** Cups of coffee produced */
    cupsOfCoffee: number;
    /** Google searches */
    googleSearches: number;
}

/**
 * Convert CO2 grams to relatable equivalents
 *
 * Sources:
 * - Average car: ~120g CO2/km
 * - Smartphone charge: ~8g CO2 (0.01kWh * 800 gCO2/kWh grid average)
 * - LED bulb (10W): ~3g CO2/hour (10Wh * 300 gCO2/kWh)
 * - Cup of coffee: ~21g CO2 (production + brewing)
 * - Google search: ~0.2g CO2
 */
export function calculateEquivalents(co2Grams: number): CarbonEquivalents {
    return {
        kmDriven: co2Grams / 120,
        phoneCharges: co2Grams / 8,
        ledLightHours: co2Grams / 3,
        cupsOfCoffee: co2Grams / 21,
        googleSearches: co2Grams / 0.2
    };
}

/**
 * Format CO2 amount for display
 */
export function formatCO2(grams: number): string {
    if (grams < 0.01) {
        return '< 0.01g';
    }
    if (grams < 1) {
        return `${grams.toFixed(2)}g`;
    }
    if (grams < 1000) {
        return `${grams.toFixed(2)}g`;
    }
    return `${(grams / 1000).toFixed(3)}kg`;
}

/**
 * Format energy for display
 */
export function formatEnergy(wh: number): string {
    if (wh < 0.001) {
        return '< 0.001 Wh';
    }
    if (wh < 1) {
        return `${wh.toFixed(3)} Wh`;
    }
    if (wh < 1000) {
        return `${wh.toFixed(2)} Wh`;
    }
    return `${(wh / 1000).toFixed(3)} kWh`;
}

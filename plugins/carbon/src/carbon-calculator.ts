/**
 * Carbon Calculator
 *
 * Converts token usage into energy and CO2 estimates using the Jegham et al.
 * methodology ("How Hungry is AI?", arXiv 2505.09598v6, Nov 2025).
 *
 * The calculation uses a physics-based formula:
 *   Energy = inference_time × (GPU_power × utilization + nonGPU_power × utilization) × PUE
 *   Carbon = Energy × CIF
 *
 * All hardware, infrastructure, and performance parameters are model-specific,
 * sourced from Jegham's infrastructure-aware benchmarking framework.
 */

import type { SessionUsage, TokenUsageRecord } from './session-parser.js';

/**
 * Model configuration based on Jegham et al. infrastructure-aware methodology.
 *
 * Each config captures the full hardware/infrastructure context:
 * - GPU and non-GPU subsystem power draws
 * - Per-request utilization bounds (derived from model size class and batch size 8)
 * - Provider-specific PUE and carbon intensity factor
 * - Median performance benchmarks from Artificial Analysis
 */
export interface ModelConfig {
    displayName: string;
    family: 'opus' | 'sonnet' | 'haiku' | 'unknown';
    /** GPU subsystem rated power (kW) */
    gpuPowerKw: number;
    /** Non-GPU subsystem rated power (kW) — CPUs, SSDs, network, cooling control */
    nonGpuPowerKw: number;
    /** Minimum GPU utilization fraction per request */
    minGpuUtilization: number;
    /** Maximum GPU utilization fraction per request */
    maxGpuUtilization: number;
    /** Non-GPU utilization fraction per request */
    nonGpuUtilization: number;
    /** Power Usage Effectiveness — datacenter overhead multiplier */
    pue: number;
    /** Carbon Intensity Factor (kgCO2e/kWh) — provider/datacenter specific */
    cif: number;
    /** Median tokens per second (from Artificial Analysis benchmarks) */
    medianTps: number;
    /** Median time to first token in seconds (from Artificial Analysis benchmarks) */
    medianTtftSeconds: number;
}

// All Anthropic models are hosted on DGX H200/H100 on AWS infrastructure.
// Hardware class: Large (8 GPUs, 5.50-7.50% GPU util, 6.25% non-GPU util)
// Source: Jegham et al. Table 1 + Artificial Analysis median benchmarks
const ANTHROPIC_LARGE_BASE = {
    gpuPowerKw: 5.6,
    nonGpuPowerKw: 4.6,
    minGpuUtilization: 0.055,
    maxGpuUtilization: 0.075,
    nonGpuUtilization: 0.0625,
    pue: 1.14,
    cif: 0.300,
} as const;

const MODEL_CONFIGS: Record<string, ModelConfig> = {
    // Haiku models
    'claude-3-haiku-20240307': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude 3 Haiku',
        family: 'haiku',
        medianTps: 109,
        medianTtftSeconds: 0.37,
    },
    'claude-3-5-haiku-20241022': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude 3.5 Haiku',
        family: 'haiku',
        medianTps: 70,
        medianTtftSeconds: 0.54,
    },
    'claude-haiku-4-5-20251001': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude 4.5 Haiku',
        family: 'haiku',
        medianTps: 148,
        medianTtftSeconds: 0.52,
    },

    // Sonnet models
    'claude-sonnet-4-20250514': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude Sonnet 4',
        family: 'sonnet',
        medianTps: 75,
        medianTtftSeconds: 1.01,
    },
    'claude-sonnet-4-5-20250929': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude 4.5 Sonnet',
        family: 'sonnet',
        medianTps: 81,
        medianTtftSeconds: 1.27,
    },

    // Opus models
    'claude-opus-4-20250514': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude Opus 4',
        family: 'opus',
        medianTps: 55,
        medianTtftSeconds: 1.19,
    },
    'claude-opus-4-1-20250805': {
        ...ANTHROPIC_LARGE_BASE,
        displayName: 'Claude Opus 4.1',
        family: 'opus',
        medianTps: 58,
        medianTtftSeconds: 1.38,
    },
};

/** Family-level fallback configs for unrecognized model IDs */
const FAMILY_DEFAULTS: Record<string, ModelConfig> = {
    haiku: { ...MODEL_CONFIGS['claude-haiku-4-5-20251001'], displayName: 'Unknown Haiku' },
    sonnet: { ...MODEL_CONFIGS['claude-sonnet-4-5-20250929'], displayName: 'Unknown Sonnet' },
    opus: { ...MODEL_CONFIGS['claude-opus-4-1-20250805'], displayName: 'Unknown Opus' },
};

const DEFAULT_MODEL_CONFIG: ModelConfig = {
    ...FAMILY_DEFAULTS.sonnet,
    displayName: 'Unknown Model',
    family: 'unknown',
};

/**
 * Get model configuration by API model ID.
 * Falls back to family-based config, then to Sonnet-level defaults.
 */
export function getModelConfig(modelId: string): ModelConfig {
    if (MODEL_CONFIGS[modelId]) {
        return MODEL_CONFIGS[modelId];
    }

    const lowerModel = modelId.toLowerCase();
    if (lowerModel.includes('opus')) {
        return { ...FAMILY_DEFAULTS.opus, family: 'opus' };
    }
    if (lowerModel.includes('sonnet')) {
        return { ...FAMILY_DEFAULTS.sonnet, family: 'sonnet' };
    }
    if (lowerModel.includes('haiku')) {
        return { ...FAMILY_DEFAULTS.haiku, family: 'haiku' };
    }

    return DEFAULT_MODEL_CONFIG;
}

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
 * Calculate per-query energy consumption using Jegham Equations 1-2.
 *
 * Equation 1: E = inferenceTime × (P_GPU × U_GPU + P_nonGPU × U_nonGPU) × PUE
 *   where inferenceTime = TTFT + outputTokens / TPS
 *
 * Equation 2: E_expected = 0.5 × E_max + 0.5 × E_min
 *   (weighted average of min/max GPU utilization bounds)
 */
export function calculateEnergy(
    outputTokens: number,
    modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG
): EnergyResult {
    // Total inference time: prefill (TTFT) + generation (output / TPS)
    const inferenceTimeHours =
        (modelConfig.medianTtftSeconds + outputTokens / modelConfig.medianTps) / 3600;

    // System power at min and max GPU utilization bounds
    const powerMinKw =
        modelConfig.gpuPowerKw * modelConfig.minGpuUtilization +
        modelConfig.nonGpuPowerKw * modelConfig.nonGpuUtilization;
    const powerMaxKw =
        modelConfig.gpuPowerKw * modelConfig.maxGpuUtilization +
        modelConfig.nonGpuPowerKw * modelConfig.nonGpuUtilization;

    // Energy at each bound (Wh = hours × kW × 1000)
    const energyMinWh = inferenceTimeHours * powerMinKw * modelConfig.pue * 1000;
    const energyMaxWh = inferenceTimeHours * powerMaxKw * modelConfig.pue * 1000;

    // Eq 2: expected energy as weighted average (w_max = 0.5)
    const energyWh = 0.5 * energyMaxWh + 0.5 * energyMinWh;

    return {
        energyWh,
        energyKwh: energyWh / 1000,
    };
}

/**
 * Calculate CO2 emissions from energy consumption (Jegham Equation 5).
 *
 * Carbon (kgCO2e) = E_query × CIF
 * Returns grams: (energyWh / 1000) × CIF × 1000 = energyWh × CIF
 */
export function calculateCO2FromEnergy(
    energyWh: number,
    modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG
): number {
    return energyWh * modelConfig.cif;
}

/**
 * Calculate carbon emissions for a single token usage record (one API request).
 * Each request incurs one TTFT cost plus generation time for output tokens.
 */
export function calculateRecordCarbon(record: TokenUsageRecord): CarbonResult {
    const modelConfig = getModelConfig(record.model);
    const energy = calculateEnergy(record.outputTokens, modelConfig);
    const co2Grams = calculateCO2FromEnergy(energy.energyWh, modelConfig);

    return {
        energy,
        co2Grams,
        co2Kg: co2Grams / 1000,
        modelBreakdown: {
            [modelConfig.family]: {
                energyWh: energy.energyWh,
                co2Grams,
            },
        },
    };
}

/**
 * Calculate carbon emissions for an entire session.
 * Iterates over individual records so each API request gets its own TTFT cost.
 */
export function calculateSessionCarbon(session: SessionUsage): CarbonResult {
    const modelBreakdown: Record<string, { energyWh: number; co2Grams: number }> = {};
    let totalEnergyWh = 0;
    let totalCO2 = 0;

    for (const record of session.records) {
        const result = calculateRecordCarbon(record);

        totalEnergyWh += result.energy.energyWh;
        totalCO2 += result.co2Grams;

        const modelConfig = getModelConfig(record.model);
        const family = modelConfig.family;
        if (!modelBreakdown[family]) {
            modelBreakdown[family] = { energyWh: 0, co2Grams: 0 };
        }
        modelBreakdown[family].energyWh += result.energy.energyWh;
        modelBreakdown[family].co2Grams += result.co2Grams;
    }

    return {
        energy: {
            energyWh: totalEnergyWh,
            energyKwh: totalEnergyWh / 1000,
        },
        co2Grams: totalCO2,
        co2Kg: totalCO2 / 1000,
        modelBreakdown,
    };
}

/**
 * Calculate carbon for token counts directly.
 * Used by the statusline which has cumulative tokens, not per-request records.
 * Approximates as a single inference (one TTFT + all output tokens / TPS).
 */
export function calculateCarbonFromTokens(
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number = 0,
    cacheReadTokens: number = 0,
    model: string = 'unknown'
): CarbonResult {
    const modelConfig = getModelConfig(model);
    const energy = calculateEnergy(outputTokens, modelConfig);
    const co2Grams = calculateCO2FromEnergy(energy.energyWh, modelConfig);

    return {
        energy,
        co2Grams,
        co2Kg: co2Grams / 1000,
        modelBreakdown: {
            [modelConfig.family]: {
                energyWh: energy.energyWh,
                co2Grams,
            },
        },
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
        googleSearches: co2Grams / 0.2,
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

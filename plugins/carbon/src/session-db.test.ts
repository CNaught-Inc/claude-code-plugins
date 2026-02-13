import { Database } from 'bun:sqlite';

import { initializeDatabase, getSession } from './data-store';
import { saveSessionToDb } from './session-db';
import type { SessionUsage } from './session-parser';
import type { CarbonResult } from './carbon-calculator';

function createTestDb(): Database {
    const db = new Database(':memory:');
    initializeDatabase(db);
    return db;
}

function makeSessionUsage(overrides: Partial<SessionUsage> = {}): SessionUsage {
    return {
        sessionId: 'session-1',
        projectPath: '/test/project',
        records: [],
        totals: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationTokens: 200,
            cacheReadTokens: 100,
            totalTokens: 1800,
        },
        modelBreakdown: { 'claude-sonnet-4-20250514': 1800 },
        primaryModel: 'claude-sonnet-4-20250514',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T01:00:00Z'),
        ...overrides,
    };
}

function makeCarbonResult(overrides: Partial<CarbonResult> = {}): CarbonResult {
    return {
        energy: { energyWh: 0.05, energyKwh: 0.00005 },
        co2Grams: 0.015,
        co2Kg: 0.000015,
        modelBreakdown: { sonnet: { energyWh: 0.05, co2Grams: 0.015 } },
        ...overrides,
    };
}

describe('saveSessionToDb', () => {
    it('saves session usage and carbon result to the database', () => {
        const db = createTestDb();
        const usage = makeSessionUsage();
        const carbon = makeCarbonResult();

        saveSessionToDb(db, 'session-1', usage, carbon);

        const record = getSession(db, 'session-1');
        expect(record).not.toBeNull();
        expect(record!.sessionId).toBe('session-1');
        expect(record!.projectPath).toBe('/test/project');
        expect(record!.inputTokens).toBe(1000);
        expect(record!.outputTokens).toBe(500);
        expect(record!.cacheCreationTokens).toBe(200);
        expect(record!.cacheReadTokens).toBe(100);
        expect(record!.totalTokens).toBe(1800);
        expect(record!.energyWh).toBeCloseTo(0.05);
        expect(record!.co2Grams).toBeCloseTo(0.015);
        expect(record!.primaryModel).toBe('claude-sonnet-4-20250514');

        db.close();
    });

    it('updates an existing session on re-save', () => {
        const db = createTestDb();
        const usage = makeSessionUsage();
        const carbon = makeCarbonResult();

        saveSessionToDb(db, 'session-1', usage, carbon);

        // Update with more tokens
        const updatedUsage = makeSessionUsage({
            totals: {
                inputTokens: 2000,
                outputTokens: 1000,
                cacheCreationTokens: 400,
                cacheReadTokens: 200,
                totalTokens: 3600,
            },
            updatedAt: new Date('2025-01-01T02:00:00Z'),
        });
        const updatedCarbon = makeCarbonResult({
            energy: { energyWh: 0.10, energyKwh: 0.0001 },
            co2Grams: 0.030,
        });

        saveSessionToDb(db, 'session-1', updatedUsage, updatedCarbon);

        const record = getSession(db, 'session-1');
        expect(record!.inputTokens).toBe(2000);
        expect(record!.totalTokens).toBe(3600);
        expect(record!.energyWh).toBeCloseTo(0.10);
        expect(record!.co2Grams).toBeCloseTo(0.030);
        // createdAt preserved from original insert
        expect(record!.createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');

        db.close();
    });

    it('uses the provided sessionId, not the one from usage', () => {
        const db = createTestDb();
        const usage = makeSessionUsage({ sessionId: 'from-usage' });
        const carbon = makeCarbonResult();

        saveSessionToDb(db, 'explicit-id', usage, carbon);

        expect(getSession(db, 'explicit-id')).not.toBeNull();
        expect(getSession(db, 'from-usage')).toBeNull();

        db.close();
    });
});

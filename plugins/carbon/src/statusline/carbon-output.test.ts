import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock data-store to control DB responses
// biome-ignore lint/suspicious/noExplicitAny: Used to mock different return types
const mockQueryReadonlyDb = mock((): any => null);

mock.module('../data-store.js', () => ({
    queryReadonlyDb: mockQueryReadonlyDb
}));

mock.module('../project-identifier.js', () => ({
    resolveProjectIdentifier: () => `abcd1234`
}));

const { getCarbonOutput } = await import('./carbon-output');

beforeEach(() => {
    mockQueryReadonlyDb.mockReset();
    mockQueryReadonlyDb.mockReturnValue(null);
});

describe('getCarbonOutput', () => {
    it('returns empty string when no usage and no DB data', () => {
        const result = getCarbonOutput({});
        expect(result).toBe('');
    });

    it('returns empty string when tokens are zero and DB returns null', () => {
        const result = getCarbonOutput({
            context_window: {
                current_usage: {
                    input_tokens: 0,
                    output_tokens: 0
                }
            }
        });
        expect(result).toBe('');
    });

    it('shows climate impact from live tokens', () => {
        const result = getCarbonOutput({
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 10000,
                    output_tokens: 5000
                }
            }
        });

        expect(result).toContain('Climate Impact:');
        expect(result).toContain('CO\u2082');
        expect(result).toContain('Energy');
    });

    it('uses DB session stats without adding live estimate', () => {
        // Call 1: getSessionStatsFromDb returns {co2: 1.5g, energy: 0.5Wh}
        // Call 2: getTotalCO2FromDb returns null
        // Call 3: getTotalEnergyFromDb returns null
        // Call 4: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.5, energyWh: 0.5 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null);

        const result = getCarbonOutput({
            session_id: 'test-session',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500
                }
            }
        });

        expect(result).toContain('Climate Impact:');
        expect(result).toContain('CO\u2082');
        expect(result).toContain('kg');
    });

    it('shows total CO2 when DB has project data', () => {
        // Call 1: getSessionStatsFromDb returns {co2: 0.5g, energy: 0.2Wh}
        // Call 2: getTotalCO2FromDb returns 10g
        // Call 3: getTotalEnergyFromDb returns 5
        // Call 4: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 0.5, energyWh: 0.2 })
            .mockReturnValueOnce(10)
            .mockReturnValueOnce(5)
            .mockReturnValueOnce(null);

        const result = getCarbonOutput({
            session_id: 'test-session',
            project_path: '/my/project',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500
                }
            }
        });

        expect(result).toContain('Climate Impact:');
        expect(result).toContain('CO\u2082');
        expect(result).toContain('0.01kg');
    });

    it('falls back to cwd when project_path is not set', () => {
        // No session_id, so getSessionStatsFromDb is skipped.
        // Call 1: getTotalCO2FromDb returns 5g
        // Call 2: getTotalEnergyFromDb returns 2
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb.mockReturnValueOnce(5).mockReturnValueOnce(2).mockReturnValueOnce(null);

        const result = getCarbonOutput({
            cwd: '/my/project',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500
                }
            }
        });

        expect(result).toContain('Climate Impact:');
    });

    it('handles null current_usage', () => {
        const result = getCarbonOutput({
            context_window: { current_usage: null }
        });
        expect(result).toBe('');
    });

    it('shows CO2 from DB only when no live tokens', () => {
        // Call 1: getSessionStatsFromDb returns {co2: 2g, energy: 0.8Wh}
        // Call 2: getTotalCO2FromDb returns null
        // Call 3: getTotalEnergyFromDb returns null
        // Call 4: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 2.0, energyWh: 0.8 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null);

        const result = getCarbonOutput({
            session_id: 'test-session'
        });

        expect(result).toContain('Climate Impact:');
        expect(result).toContain('CO\u2082');
    });

    it('handles cache tokens in calculation', () => {
        const result = getCarbonOutput({
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500,
                    cache_creation_input_tokens: 2000,
                    cache_read_input_tokens: 3000
                }
            }
        });

        // 6500 total tokens should produce non-zero CO2
        expect(result).toContain('Climate Impact:');
        expect(result).not.toBe('');
    });
});

describe('getCarbonOutput sync display', () => {
    it('shows green arrows when sync_status is synced', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.0, energyWh: 0.3 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                organization: 'Curious Penguin',
                userId: 'abcd1234-5678'
            })
            .mockReturnValueOnce('synced');

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
        expect(result).toContain('\x1b[38;2;50;205;50m'); // lime green
    });

    it('shows green arrows when sync_status is dirty', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.0, energyWh: 0.3 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                organization: 'Curious Penguin',
                userId: 'abcd1234-5678'
            })
            .mockReturnValueOnce('dirty');

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
        expect(result).toContain('\x1b[38;2;50;205;50m'); // lime green
    });

    it('shows red arrows when sync_status is failed', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.0, energyWh: 0.3 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                organization: 'Swift Falcon',
                userId: 'efgh5678-9012'
            })
            .mockReturnValueOnce('failed');

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
        expect(result).toContain('\x1b[38;2;208;83;63m'); // brand orange
    });

    it('shows no arrows when sync_status is pending', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.0, energyWh: 0.3 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                organization: 'Swift Falcon',
                userId: 'efgh5678-9012'
            })
            .mockReturnValueOnce('pending');

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).not.toContain('\u21C4');
    });

    it('does not show sync info when sync is disabled', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.0, energyWh: 0.3 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({ enabled: false, organization: null, userId: null });

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).not.toContain('\u21C4');
    });

    it('does not show sync arrows when no session_id', () => {
        // No session_id, so getSessionStatsFromDb is skipped
        // Call 1: getTotalCO2FromDb returns 5g
        // Call 2: getTotalEnergyFromDb returns 2
        // Call 3: getSyncInfo returns enabled
        mockQueryReadonlyDb.mockReturnValueOnce(5).mockReturnValueOnce(2).mockReturnValueOnce({
            enabled: true,
            organization: 'Curious Penguin',
            userId: 'abcd1234-5678'
        });

        const result = getCarbonOutput({
            cwd: '/my/project',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500
                }
            }
        });

        // No session_id means getSessionSyncStatus not called, so no arrows
        expect(result).not.toContain('\u21C4');
    });

    it('shows sync arrows even when organization is missing', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce({ co2Grams: 1.0, energyWh: 0.3 })
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({ enabled: true, organization: null, userId: 'abcd1234' })
            .mockReturnValueOnce('synced');

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
    });
});

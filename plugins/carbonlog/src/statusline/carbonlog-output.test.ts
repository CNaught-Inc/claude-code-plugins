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

const { getCarbonlogOutput } = await import('./carbonlog-output');

beforeEach(() => {
    mockQueryReadonlyDb.mockReset();
    mockQueryReadonlyDb.mockReturnValue(null);
});

describe('getCarbonlogOutput', () => {
    it('returns empty string when no DB data', () => {
        const result = getCarbonlogOutput({});
        expect(result).toBe('');
    });

    it('returns empty string when DB returns null', () => {
        const result = getCarbonlogOutput({
            context_window: {
                current_usage: {
                    input_tokens: 0,
                    output_tokens: 0
                }
            }
        });
        expect(result).toBe('');
    });

    it('returns empty string when only live tokens present but no DB data', () => {
        const result = getCarbonlogOutput({
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 10000,
                    output_tokens: 5000
                }
            }
        });
        expect(result).toBe('');
    });

    it('shows climate impact from DB totals', () => {
        // Call 1: getTotalCO2FromDb returns 5000g
        // Call 2: getTotalEnergyFromDb returns 2000Wh
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(5000)
            .mockReturnValueOnce(2000)
            .mockReturnValueOnce(null);

        const result = getCarbonlogOutput({
            model: { id: 'claude-sonnet-4-20250514' }
        });

        expect(result).toContain('Climate Impact:');
        expect(result).toContain('CO\u2082');
        expect(result).toContain('Energy');
    });

    it('shows total CO2 when DB has data', () => {
        // Call 1: getTotalCO2FromDb returns 10g
        // Call 2: getTotalEnergyFromDb returns 5Wh
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(10)
            .mockReturnValueOnce(5)
            .mockReturnValueOnce(null);

        const result = getCarbonlogOutput({
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
        // Call 1: getTotalCO2FromDb returns 5g
        // Call 2: getTotalEnergyFromDb returns 2Wh
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb.mockReturnValueOnce(5).mockReturnValueOnce(2).mockReturnValueOnce(null);

        const result = getCarbonlogOutput({
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
        const result = getCarbonlogOutput({
            context_window: { current_usage: null }
        });
        expect(result).toBe('');
    });

    it('shows CO2 from DB even when no live tokens', () => {
        // Call 1: getTotalCO2FromDb returns 2000g
        // Call 2: getTotalEnergyFromDb returns 800Wh
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(2000)
            .mockReturnValueOnce(800)
            .mockReturnValueOnce(null);

        const result = getCarbonlogOutput({
            session_id: 'test-session'
        });

        expect(result).toContain('Climate Impact:');
        expect(result).toContain('CO\u2082');
    });

    it('returns empty string when context has cache tokens but no DB data', () => {
        const result = getCarbonlogOutput({
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

        expect(result).toBe('');
    });
});

describe('getCarbonlogOutput sync display', () => {
    it('shows green arrows when sync_status is synced', () => {
        // Call 1: getTotalCO2FromDb returns 1000g
        // Call 2: getTotalEnergyFromDb returns 300Wh
        // Call 3: getSyncInfo returns enabled
        // Call 4: getSessionSyncStatus returns 'synced'
        mockQueryReadonlyDb
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce({
                enabled: true,
                team: 'Curious Penguin',
                userId: 'abcd1234-5678'
            })
            .mockReturnValueOnce('synced');

        const result = getCarbonlogOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
        expect(result).toContain('\x1b[38;2;50;205;50m'); // lime green
    });

    it('shows green arrows when sync_status is dirty', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce({
                enabled: true,
                team: 'Curious Penguin',
                userId: 'abcd1234-5678'
            })
            .mockReturnValueOnce('dirty');

        const result = getCarbonlogOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
        expect(result).toContain('\x1b[38;2;50;205;50m'); // lime green
    });

    it('shows red arrows when sync_status is failed', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce({
                enabled: true,
                team: 'Swift Falcon',
                userId: 'efgh5678-9012'
            })
            .mockReturnValueOnce('failed');

        const result = getCarbonlogOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
        expect(result).toContain('\x1b[38;2;208;83;63m'); // brand orange
    });

    it('shows no arrows when sync_status is pending', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce({
                enabled: true,
                team: 'Swift Falcon',
                userId: 'efgh5678-9012'
            })
            .mockReturnValueOnce('pending');

        const result = getCarbonlogOutput({ session_id: 'test-session' });

        expect(result).not.toContain('\u21C4');
    });

    it('does not show sync info when sync is disabled', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce({ enabled: false, team: null, userId: null });

        const result = getCarbonlogOutput({ session_id: 'test-session' });

        expect(result).not.toContain('\u21C4');
    });

    it('does not show sync arrows when no session_id', () => {
        // No session_id, so getSessionSyncStatus is never called
        // Call 1: getTotalCO2FromDb returns 5g
        // Call 2: getTotalEnergyFromDb returns 2Wh
        // Call 3: getSyncInfo returns enabled
        mockQueryReadonlyDb.mockReturnValueOnce(5).mockReturnValueOnce(2).mockReturnValueOnce({
            enabled: true,
            team: 'Curious Penguin',
            userId: 'abcd1234-5678'
        });

        const result = getCarbonlogOutput({
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

    it('shows sync arrows even when team is missing', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(300)
            .mockReturnValueOnce({ enabled: true, team: null, userId: 'abcd1234' })
            .mockReturnValueOnce('synced');

        const result = getCarbonlogOutput({ session_id: 'test-session' });

        expect(result).toContain('\u21C4');
    });
});

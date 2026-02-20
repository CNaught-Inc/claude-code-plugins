import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock data-store to control DB responses
const mockQueryReadonlyDb = mock((fn: any): any => null);

mock.module('../data-store.js', () => ({
    queryReadonlyDb: mockQueryReadonlyDb
}));

mock.module('../project-identifier.js', () => ({
    resolveProjectIdentifier: (p: string) => `test_project_abcd1234`
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

    it('shows session CO2 from live tokens', () => {
        const result = getCarbonOutput({
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 10000,
                    output_tokens: 5000
                }
            }
        });

        expect(result).toContain('Session:');
        expect(result).toContain('CO\u2082');
        expect(result).toStartWith('\u{1F331}');
    });

    it('uses DB session CO2 without adding live estimate', () => {
        // Call 1: getSessionCO2FromDb returns 1.5g
        // Call 2: getTotalCO2FromDb returns null
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.5)
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

        expect(result).toContain('Session:');
        expect(result).toContain('1.50g');
        // Should not contain total since getTotalCO2FromDb returned null
        expect(result).not.toContain('/');
    });

    it('shows total CO2 when DB has project data', () => {
        // Call 1: getSessionCO2FromDb returns 0.5g
        // Call 2: getTotalCO2FromDb returns 10g
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(0.5)
            .mockReturnValueOnce(10)
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

        expect(result).toContain('Session:');
        expect(result).toContain('/');
    });

    it('falls back to cwd when project_path is not set', () => {
        // No session_id, so getSessionCO2FromDb is skipped.
        // Call 1: getTotalCO2FromDb returns 5g
        // Call 2: getSyncInfo returns null
        mockQueryReadonlyDb.mockReturnValueOnce(5).mockReturnValueOnce(null);

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

        expect(result).toContain('/');
    });

    it('handles null current_usage', () => {
        const result = getCarbonOutput({
            context_window: { current_usage: null }
        });
        expect(result).toBe('');
    });

    it('shows session CO2 from DB only when no live tokens', () => {
        // Call 1: getSessionCO2FromDb returns 2g
        // Call 2: getTotalCO2FromDb returns null
        // Call 3: getSyncInfo returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(2.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null);

        const result = getCarbonOutput({
            session_id: 'test-session'
        });

        expect(result).toContain('Session:');
        expect(result).toContain('2.00g');
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
        expect(result).toContain('Session:');
        expect(result).not.toBe('');
    });
});

describe('getCarbonOutput sync display', () => {
    it('shows sync name when sync is enabled', () => {
        // Call 1: getSessionCO2FromDb returns 1g
        // Call 2: getTotalCO2FromDb returns null
        // Call 3: getSyncInfo returns enabled config
        // Call 4: getSessionSynced returns true
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                userName: 'Curious Penguin',
                userId: 'abcd1234-5678'
            })
            .mockReturnValueOnce(true);

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('Curious Penguin');
    });

    it('shows green checkmark and synced when session is synced', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                userName: 'Curious Penguin',
                userId: 'abcd1234-5678'
            })
            .mockReturnValueOnce(true);

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('\u2713 synced');
        expect(result).toContain('\x1b[32m'); // green
    });

    it('shows yellow circle and pending when session is not synced', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                enabled: true,
                userName: 'Swift Falcon',
                userId: 'efgh5678-9012'
            })
            .mockReturnValueOnce(false);

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).toContain('\u25cb pending');
        expect(result).toContain('\x1b[33m'); // yellow
    });

    it('does not show sync info when sync is disabled', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({ enabled: false, userName: null, userId: null });

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).not.toContain('synced');
        expect(result).not.toContain('pending');
    });

    it('does not show sync status when no session_id', () => {
        // No session_id, so getSessionCO2FromDb is skipped
        // Call 1: getTotalCO2FromDb returns 5g
        // Call 2: getSyncInfo returns enabled
        mockQueryReadonlyDb
            .mockReturnValueOnce(5)
            .mockReturnValueOnce({
                enabled: true,
                userName: 'Curious Penguin',
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

        // Name should be shown but no synced/pending status
        expect(result).toContain('Curious Penguin');
        expect(result).not.toContain('synced');
        expect(result).not.toContain('pending');
    });

    it('does not show sync info when userName is missing', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({ enabled: true, userName: null, userId: 'abcd1234' });

        const result = getCarbonOutput({ session_id: 'test-session' });

        expect(result).not.toContain('\u00b7 \x1b[2m\x1b[1m');
    });

    it('renders name with bold and dim ANSI codes', () => {
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.0)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({ enabled: true, userName: 'Test User', userId: 'abcd1234-5678' })
            .mockReturnValueOnce(true);

        const result = getCarbonOutput({ session_id: 'test-session' });

        // bold = \x1b[1m, dim = \x1b[2m
        expect(result).toContain('\x1b[2m\x1b[1mTest User\x1b[0m');
    });
});

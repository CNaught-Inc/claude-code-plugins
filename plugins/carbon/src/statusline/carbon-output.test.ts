import { mock, describe, it, expect, beforeEach } from 'bun:test';

// Mock data-store to control DB responses
const mockQueryReadonlyDb = mock((fn: any) => null);

mock.module('../data-store.js', () => ({
    encodeProjectPath: (p: string) => p.replace(/\//g, '-'),
    queryReadonlyDb: mockQueryReadonlyDb,
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
                    output_tokens: 0,
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
                    output_tokens: 5000,
                }
            }
        });

        expect(result).toContain('session:');
        expect(result).toContain('CO\u2082');
        expect(result).toStartWith('\u{1F331}');
    });

    it('combines DB session CO2 with live CO2', () => {
        // First call: getSessionCO2FromDb returns 1.5g
        // Second call: getTotalCO2FromDb returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(1.5)
            .mockReturnValueOnce(null);

        const result = getCarbonOutput({
            session_id: 'test-session',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500,
                }
            }
        });

        expect(result).toContain('session:');
        // Should not contain total since getTotalCO2FromDb returned null
        expect(result).not.toContain('total:');
    });

    it('shows total CO2 when DB has project data', () => {
        // First call: getSessionCO2FromDb returns 0.5g
        // Second call: getTotalCO2FromDb returns 10g
        mockQueryReadonlyDb
            .mockReturnValueOnce(0.5)
            .mockReturnValueOnce(10);

        const result = getCarbonOutput({
            session_id: 'test-session',
            project_path: '/my/project',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500,
                }
            }
        });

        expect(result).toContain('session:');
        expect(result).toContain('total:');
        expect(result).toContain('\u00b7');
    });

    it('falls back to cwd when project_path is not set', () => {
        // No session_id, so getSessionCO2FromDb is skipped.
        // Only getTotalCO2FromDb is called (1 queryReadonlyDb call).
        mockQueryReadonlyDb.mockReturnValueOnce(5);

        const result = getCarbonOutput({
            cwd: '/my/project',
            model: { id: 'claude-sonnet-4-20250514' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500,
                }
            }
        });

        expect(result).toContain('total:');
    });

    it('handles null current_usage', () => {
        const result = getCarbonOutput({
            context_window: { current_usage: null }
        });
        expect(result).toBe('');
    });

    it('shows session CO2 from DB only when no live tokens', () => {
        // getSessionCO2FromDb returns 2g, getTotalCO2FromDb returns null
        mockQueryReadonlyDb
            .mockReturnValueOnce(2.0)
            .mockReturnValueOnce(null);

        const result = getCarbonOutput({
            session_id: 'test-session',
        });

        expect(result).toContain('session:');
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
                    cache_read_input_tokens: 3000,
                }
            }
        });

        // 6500 total tokens should produce non-zero CO2
        expect(result).toContain('session:');
        expect(result).not.toBe('');
    });
});

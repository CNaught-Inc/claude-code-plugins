import { mock, beforeEach, describe, it, expect } from 'bun:test';
import * as path from 'path';

// Mock fs before importing session-parser
const mockExistsSync = mock(() => false);
const mockReadFileSync = mock(() => '');
const mockReaddirSync = mock(() => [] as string[]);
const mockStatSync = mock(() => ({
    birthtime: new Date('2025-01-01T00:00:00Z'),
    mtime: new Date('2025-01-01T01:00:00Z')
}));

mock.module('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync
}));

const {
    getClaudeProjectsDir,
    getSessionIdFromPath,
    findTranscriptPath,
    findAllTranscripts,
    parseSession
} = await import('./session-parser');

beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
    mockReaddirSync.mockReturnValue([] as string[]);
    mockStatSync.mockReturnValue({
        birthtime: new Date('2025-01-01T00:00:00Z'),
        mtime: new Date('2025-01-01T01:00:00Z')
    });
    process.env.HOME = '/home/testuser';
});

describe('getClaudeProjectsDir', () => {
    it('returns path under HOME', () => {
        expect(getClaudeProjectsDir()).toBe('/home/testuser/.claude/projects');
    });

    it('uses USERPROFILE when HOME is not set', () => {
        delete process.env.HOME;
        process.env.USERPROFILE = 'C:\\Users\\test';
        expect(getClaudeProjectsDir()).toBe(
            path.join('C:\\Users\\test', '.claude', 'projects')
        );
    });
});

describe('getSessionIdFromPath', () => {
    it('extracts session ID from transcript path', () => {
        expect(getSessionIdFromPath('/path/to/abc-123.jsonl')).toBe('abc-123');
    });

    it('handles deeply nested paths', () => {
        expect(
            getSessionIdFromPath('/home/user/.claude/projects/my-project/session-uuid.jsonl')
        ).toBe('session-uuid');
    });
});

describe('findTranscriptPath', () => {
    it('finds transcript by encoded project path', () => {
        mockExistsSync.mockImplementation((p: unknown) => {
            return (
                String(p) ===
                '/home/testuser/.claude/projects/-test-project/session-1.jsonl'
            );
        });

        const result = findTranscriptPath('session-1', '/test/project');
        expect(result).toBe(
            '/home/testuser/.claude/projects/-test-project/session-1.jsonl'
        );
    });

    it('searches all project directories when no project path given', () => {
        mockExistsSync.mockImplementation((p: unknown) => {
            const s = String(p);
            if (s === '/home/testuser/.claude/projects') return true;
            if (s === '/home/testuser/.claude/projects/proj-a/session-1.jsonl') return false;
            if (s === '/home/testuser/.claude/projects/proj-b/session-1.jsonl') return true;
            return false;
        });
        mockReaddirSync.mockReturnValue(['proj-a', 'proj-b'] as any);

        const result = findTranscriptPath('session-1');
        expect(result).toBe(
            '/home/testuser/.claude/projects/proj-b/session-1.jsonl'
        );
    });

    it('returns null when transcript not found', () => {
        mockExistsSync.mockReturnValue(false);

        const result = findTranscriptPath('nonexistent', '/test/project');
        expect(result).toBeNull();
    });
});

describe('parseSession', () => {
    const transcriptDir = '/home/testuser/.claude/projects/-test-project';
    const transcriptPath = `${transcriptDir}/session-1.jsonl`;

    function makeJsonl(entries: object[]): string {
        return entries.map((e) => JSON.stringify(e)).join('\n');
    }

    beforeEach(() => {
        // Default: no subagent directory
        mockExistsSync.mockImplementation((p: unknown) => {
            if (String(p) === transcriptPath) return true;
            return false;
        });
        mockStatSync.mockReturnValue({
            birthtime: new Date('2025-01-01T00:00:00Z'),
            mtime: new Date('2025-01-01T01:00:00Z')
        } as any);
    });

    it('parses assistant messages with usage data', () => {
        mockReadFileSync.mockReturnValue(
            makeJsonl([
                {
                    type: 'assistant',
                    uuid: 'req-1',
                    message: {
                        model: 'claude-sonnet-4-20250514',
                        usage: {
                            input_tokens: 1000,
                            output_tokens: 500,
                            cache_creation_input_tokens: 200,
                            cache_read_input_tokens: 100
                        }
                    }
                }
            ])
        );

        const result = parseSession(transcriptPath);
        expect(result.sessionId).toBe('session-1');
        expect(result.records).toHaveLength(1);
        expect(result.totals.inputTokens).toBe(1000);
        expect(result.totals.outputTokens).toBe(500);
        expect(result.totals.cacheCreationTokens).toBe(200);
        expect(result.totals.cacheReadTokens).toBe(100);
        expect(result.totals.totalTokens).toBe(1800);
        expect(result.primaryModel).toBe('claude-sonnet-4-20250514');
    });

    it('deduplicates entries by UUID', () => {
        mockReadFileSync.mockReturnValue(
            makeJsonl([
                {
                    type: 'assistant',
                    uuid: 'req-1',
                    message: {
                        model: 'claude-sonnet-4-20250514',
                        usage: { input_tokens: 500, output_tokens: 200 }
                    }
                },
                {
                    type: 'assistant',
                    uuid: 'req-1', // duplicate
                    message: {
                        model: 'claude-sonnet-4-20250514',
                        usage: { input_tokens: 500, output_tokens: 200 }
                    }
                }
            ])
        );

        const result = parseSession(transcriptPath);
        expect(result.records).toHaveLength(1);
    });

    it('skips non-assistant messages', () => {
        mockReadFileSync.mockReturnValue(
            makeJsonl([
                {
                    type: 'human',
                    uuid: 'req-1',
                    message: { content: 'hello' }
                },
                {
                    type: 'assistant',
                    uuid: 'req-2',
                    message: {
                        model: 'claude-sonnet-4-20250514',
                        usage: { input_tokens: 100, output_tokens: 50 }
                    }
                }
            ])
        );

        const result = parseSession(transcriptPath);
        expect(result.records).toHaveLength(1);
    });

    it('skips malformed JSON lines', () => {
        mockReadFileSync.mockReturnValue(
            'not valid json\n' +
            JSON.stringify({
                type: 'assistant',
                uuid: 'req-1',
                message: {
                    model: 'claude-sonnet-4-20250514',
                    usage: { input_tokens: 100, output_tokens: 50 }
                }
            })
        );

        const result = parseSession(transcriptPath);
        expect(result.records).toHaveLength(1);
    });

    it('calculates model breakdown and primary model', () => {
        mockReadFileSync.mockReturnValue(
            makeJsonl([
                {
                    type: 'assistant',
                    uuid: 'req-1',
                    message: {
                        model: 'claude-opus-4-5-20251101',
                        usage: { input_tokens: 5000, output_tokens: 2000 }
                    }
                },
                {
                    type: 'assistant',
                    uuid: 'req-2',
                    message: {
                        model: 'claude-3-5-haiku-20241022',
                        usage: { input_tokens: 100, output_tokens: 50 }
                    }
                }
            ])
        );

        const result = parseSession(transcriptPath);
        expect(result.modelBreakdown['claude-opus-4-5-20251101']).toBe(7000);
        expect(result.modelBreakdown['claude-3-5-haiku-20241022']).toBe(150);
        expect(result.primaryModel).toBe('claude-opus-4-5-20251101');
    });

    it('handles empty transcript', () => {
        mockReadFileSync.mockReturnValue('');

        const result = parseSession(transcriptPath);
        expect(result.records).toHaveLength(0);
        expect(result.totals.totalTokens).toBe(0);
        expect(result.primaryModel).toBe('unknown');
    });
});

describe('findAllTranscripts', () => {
    it('returns empty array when projects dir does not exist', () => {
        mockExistsSync.mockReturnValue(false);
        const result = findAllTranscripts();
        expect(result).toEqual([]);
    });

    it('finds jsonl files across project directories', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockImplementation((p: unknown) => {
            const dir = String(p);
            if (dir.endsWith('projects')) return ['project-a', 'project-b'] as any;
            if (dir.endsWith('project-a')) return ['session-1.jsonl', 'session-2.jsonl'] as any;
            if (dir.endsWith('project-b')) return ['session-3.jsonl', 'notes.txt'] as any;
            return [] as any;
        });
        mockStatSync.mockReturnValue({ isDirectory: () => true } as any);

        const result = findAllTranscripts();
        expect(result).toHaveLength(3);
        expect(result.some(p => p.includes('session-1.jsonl'))).toBe(true);
        expect(result.some(p => p.includes('session-2.jsonl'))).toBe(true);
        expect(result.some(p => p.includes('session-3.jsonl'))).toBe(true);
        // notes.txt should not be included
        expect(result.some(p => p.includes('notes.txt'))).toBe(false);
    });

    it('skips non-directory entries in projects dir', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockImplementation((p: unknown) => {
            const dir = String(p);
            if (dir.endsWith('projects')) return ['file.txt', 'project-a'] as any;
            if (dir.endsWith('project-a')) return ['session-1.jsonl'] as any;
            return [] as any;
        });
        mockStatSync.mockImplementation((p: unknown) => {
            const s = String(p);
            return {
                isDirectory: () => s.endsWith('project-a'),
                birthtime: new Date('2025-01-01'),
                mtime: new Date('2025-01-01')
            } as any;
        });

        const result = findAllTranscripts();
        expect(result).toHaveLength(1);
        expect(result[0]).toContain('session-1.jsonl');
    });
});

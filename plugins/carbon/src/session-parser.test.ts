import * as fs from 'fs';
import * as path from 'path';

import {
    getClaudeProjectsDir,
    getSessionIdFromPath,
    findTranscriptPath,
    parseSession
} from './session-parser';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
    jest.resetAllMocks();
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
        mockFs.existsSync.mockImplementation((p) => {
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
        mockFs.existsSync.mockImplementation((p) => {
            const s = String(p);
            if (s === '/home/testuser/.claude/projects') return true;
            if (s === '/home/testuser/.claude/projects/proj-a/session-1.jsonl') return false;
            if (s === '/home/testuser/.claude/projects/proj-b/session-1.jsonl') return true;
            return false;
        });
        (mockFs.readdirSync as jest.Mock).mockReturnValue(['proj-a', 'proj-b']);

        const result = findTranscriptPath('session-1');
        expect(result).toBe(
            '/home/testuser/.claude/projects/proj-b/session-1.jsonl'
        );
    });

    it('returns null when transcript not found', () => {
        mockFs.existsSync.mockReturnValue(false);

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
        mockFs.existsSync.mockImplementation((p) => {
            if (String(p) === transcriptPath) return true;
            return false;
        });
        mockFs.statSync.mockReturnValue({
            birthtime: new Date('2025-01-01T00:00:00Z'),
            mtime: new Date('2025-01-01T01:00:00Z')
        } as fs.Stats);
    });

    it('parses assistant messages with usage data', () => {
        mockFs.readFileSync.mockReturnValue(
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
        mockFs.readFileSync.mockReturnValue(
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
        mockFs.readFileSync.mockReturnValue(
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
        mockFs.readFileSync.mockReturnValue(
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
        mockFs.readFileSync.mockReturnValue(
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
        mockFs.readFileSync.mockReturnValue('');

        const result = parseSession(transcriptPath);
        expect(result.records).toHaveLength(0);
        expect(result.totals.totalTokens).toBe(0);
        expect(result.primaryModel).toBe('unknown');
    });
});

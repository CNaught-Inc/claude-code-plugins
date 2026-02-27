import { describe, expect, it, spyOn } from 'bun:test';

import {
    log,
    logError,
    SessionStartInputSchema,
    StatuslineInputSchema,
    StopInputSchema,
    writeStdout
} from './stdin';

describe('SessionStartInputSchema', () => {
    it('parses valid input with all fields', () => {
        const input = { session_id: 'abc', project_path: '/foo', cwd: '/bar' };
        const result = SessionStartInputSchema.parse(input);
        expect(result.session_id).toBe('abc');
        expect(result.project_path).toBe('/foo');
        expect(result.cwd).toBe('/bar');
    });

    it('parses input with only required fields', () => {
        const input = { session_id: 'abc' };
        const result = SessionStartInputSchema.parse(input);
        expect(result.session_id).toBe('abc');
        expect(result.project_path).toBeUndefined();
    });

    it('rejects input missing session_id', () => {
        expect(() => SessionStartInputSchema.parse({})).toThrow();
    });
});

describe('StopInputSchema', () => {
    it('parses valid input with all fields', () => {
        const input = {
            session_id: 'abc',
            project_path: '/foo',
            cwd: '/bar',
            transcript_path: '/path/to/transcript.jsonl'
        };
        const result = StopInputSchema.parse(input);
        expect(result.session_id).toBe('abc');
        expect(result.transcript_path).toBe('/path/to/transcript.jsonl');
    });

    it('parses input with only required fields', () => {
        const result = StopInputSchema.parse({ session_id: 'abc' });
        expect(result.transcript_path).toBeUndefined();
    });

    it('rejects input missing session_id', () => {
        expect(() => StopInputSchema.parse({ transcript_path: '/foo' })).toThrow();
    });
});

describe('StatuslineInputSchema', () => {
    it('parses full statusline input', () => {
        const input = {
            session_id: 'abc',
            project_path: '/foo',
            cwd: '/bar',
            model: { id: 'claude-sonnet-4-20250514', display_name: 'Sonnet' },
            context_window: {
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 500,
                    cache_creation_input_tokens: 200,
                    cache_read_input_tokens: 100
                }
            }
        };
        const result = StatuslineInputSchema.parse(input);
        expect(result.model?.id).toBe('claude-sonnet-4-20250514');
        expect(result.context_window?.current_usage?.input_tokens).toBe(1000);
    });

    it('parses empty input (all fields optional)', () => {
        const result = StatuslineInputSchema.parse({});
        expect(result.session_id).toBeUndefined();
        expect(result.model).toBeUndefined();
        expect(result.context_window).toBeUndefined();
    });

    it('handles null current_usage', () => {
        const result = StatuslineInputSchema.parse({
            context_window: { current_usage: null }
        });
        expect(result.context_window?.current_usage).toBeNull();
    });

    it('strips unknown fields', () => {
        const result = StatuslineInputSchema.parse({
            session_id: 'abc',
            unknown_field: 'should be stripped'
        });
        expect(result.session_id).toBe('abc');
        expect((result as any).unknown_field).toBeUndefined();
    });
});

describe('log', () => {
    it('writes prefixed message to stderr', () => {
        const spy = spyOn(console, 'error').mockImplementation(() => {});
        log('test message');
        expect(spy).toHaveBeenCalledWith('[carbon-tracker] test message');
        spy.mockRestore();
    });
});

describe('logError', () => {
    it('writes error with details to stderr', () => {
        const spy = spyOn(console, 'error').mockImplementation(() => {});
        logError('something failed', new Error('bad thing'));
        expect(spy).toHaveBeenCalledWith('[carbon-tracker] ERROR: something failed - bad thing');
        spy.mockRestore();
    });

    it('handles non-Error objects', () => {
        const spy = spyOn(console, 'error').mockImplementation(() => {});
        logError('failed', 'string error');
        expect(spy).toHaveBeenCalledWith('[carbon-tracker] ERROR: failed - string error');
        spy.mockRestore();
    });

    it('works without error argument', () => {
        const spy = spyOn(console, 'error').mockImplementation(() => {});
        logError('just a message');
        expect(spy).toHaveBeenCalledWith('[carbon-tracker] ERROR: just a message');
        spy.mockRestore();
    });
});

describe('writeStdout', () => {
    it('writes JSON to stdout via console.log', () => {
        const spy = spyOn(console, 'log').mockImplementation(() => {});
        writeStdout({ key: 'value', num: 42 });
        expect(spy).toHaveBeenCalledWith('{"key":"value","num":42}');
        spy.mockRestore();
    });
});

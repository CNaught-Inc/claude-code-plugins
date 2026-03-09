import { describe, expect, it, mock } from 'bun:test';
import * as crypto from 'node:crypto';

// Re-register the real module to clear any mock.module leaks from other test files
mock.module('./project-identifier.js', () => ({
    shortHash: (input: string) =>
        crypto.createHash('sha256').update(input).digest('hex').slice(0, 8),
    resolveProjectIdentifier: (rawPath: string) =>
        crypto.createHash('sha256').update(rawPath).digest('hex').slice(0, 8)
}));

const { resolveProjectIdentifier, shortHash } = await import('./project-identifier');

describe('shortHash', () => {
    it('returns 8 hex characters', () => {
        const hash = shortHash('/Users/jason/my-project');
        expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('is deterministic', () => {
        expect(shortHash('/foo/bar')).toBe(shortHash('/foo/bar'));
    });

    it('differs for different inputs', () => {
        expect(shortHash('/foo/bar')).not.toBe(shortHash('/foo/baz'));
    });
});

describe('resolveProjectIdentifier', () => {
    it('returns the short hash of the path', () => {
        const id = resolveProjectIdentifier('/Users/jason/my-project');
        expect(id).toBe(shortHash('/Users/jason/my-project'));
    });

    it('returns 8 hex characters', () => {
        const id = resolveProjectIdentifier('/foo/bar');
        expect(id).toMatch(/^[a-f0-9]{8}$/);
    });
});

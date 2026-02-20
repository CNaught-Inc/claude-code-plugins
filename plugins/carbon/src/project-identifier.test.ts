import { describe, expect, it } from 'bun:test';

import { parseGitRemote, shortHash } from './project-identifier';

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

describe('parseGitRemote', () => {
    it('parses HTTPS URLs with .git suffix', () => {
        const result = parseGitRemote('https://github.com/cnaught/claude-code-plugins.git');
        expect(result).toEqual({ org: 'cnaught', repo: 'claude-code-plugins' });
    });

    it('parses HTTPS URLs without .git suffix', () => {
        const result = parseGitRemote('https://github.com/cnaught/claude-code-plugins');
        expect(result).toEqual({ org: 'cnaught', repo: 'claude-code-plugins' });
    });

    it('parses SSH URLs with .git suffix', () => {
        const result = parseGitRemote('git@github.com:cnaught/claude-code-plugins.git');
        expect(result).toEqual({ org: 'cnaught', repo: 'claude-code-plugins' });
    });

    it('parses SSH URLs without .git suffix', () => {
        const result = parseGitRemote('git@github.com:cnaught/claude-code-plugins');
        expect(result).toEqual({ org: 'cnaught', repo: 'claude-code-plugins' });
    });

    it('handles GitLab URLs', () => {
        const result = parseGitRemote('https://gitlab.com/myorg/myrepo.git');
        expect(result).toEqual({ org: 'myorg', repo: 'myrepo' });
    });

    it('handles SSH URLs with custom hosts', () => {
        const result = parseGitRemote('git@gitlab.company.com:team/project.git');
        expect(result).toEqual({ org: 'team', repo: 'project' });
    });

    it('returns null for unrecognized URLs', () => {
        expect(parseGitRemote('not-a-url')).toBeNull();
        expect(parseGitRemote('')).toBeNull();
    });
});


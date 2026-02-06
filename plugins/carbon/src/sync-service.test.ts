jest.mock('./config', () => ({
    CONFIG: {
        auth0Domain: 'test.auth0.com',
        auth0ClientId: 'test-client-id',
        auth0Audience: 'https://test-api',
        apiUrl: 'https://api.test.com'
    }
}));

import { formatRelativeTime } from './sync-service';

describe('formatRelativeTime', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('returns "never" for null', () => {
        expect(formatRelativeTime(null)).toBe('never');
    });

    it('returns "just now" for less than 60 seconds ago', () => {
        const date = new Date('2025-06-15T11:59:30Z'); // 30s ago
        expect(formatRelativeTime(date)).toBe('just now');
    });

    it('returns singular minute', () => {
        const date = new Date('2025-06-15T11:59:00Z'); // 1 minute ago
        expect(formatRelativeTime(date)).toBe('1 minute ago');
    });

    it('returns plural minutes', () => {
        const date = new Date('2025-06-15T11:45:00Z'); // 15 minutes ago
        expect(formatRelativeTime(date)).toBe('15 minutes ago');
    });

    it('returns singular hour', () => {
        const date = new Date('2025-06-15T11:00:00Z'); // 1 hour ago
        expect(formatRelativeTime(date)).toBe('1 hour ago');
    });

    it('returns plural hours', () => {
        const date = new Date('2025-06-15T06:00:00Z'); // 6 hours ago
        expect(formatRelativeTime(date)).toBe('6 hours ago');
    });

    it('returns singular day', () => {
        const date = new Date('2025-06-14T12:00:00Z'); // 1 day ago
        expect(formatRelativeTime(date)).toBe('1 day ago');
    });

    it('returns plural days', () => {
        const date = new Date('2025-06-10T12:00:00Z'); // 5 days ago
        expect(formatRelativeTime(date)).toBe('5 days ago');
    });
});

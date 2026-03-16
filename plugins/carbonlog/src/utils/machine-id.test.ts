import { describe, expect, it } from 'bun:test';

import { generateMachineUserId } from './machine-id';

describe('generateMachineUserId', () => {
    it('returns a UUID-formatted string', () => {
        const id = generateMachineUserId();
        // UUID format: 8-4-4-4-12 hex chars
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('is deterministic — same result on repeated calls', () => {
        const id1 = generateMachineUserId();
        const id2 = generateMachineUserId();
        expect(id1).toBe(id2);
    });
});

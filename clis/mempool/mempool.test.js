import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import './tx.js';
import './block.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('mempool tx adapter', () => {
    const cmd = getRegistry().get('mempool/tx');

    it('rejects malformed txids before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(cmd.func({ txid: '' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ txid: 'beef' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ txid: 'g'.repeat(64) })).rejects.toThrow(ArgumentError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps HTTP 404 to EmptyResultError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
        await expect(cmd.func({ txid: '0'.repeat(64) })).rejects.toThrow(EmptyResultError);
    });

    it('sums vout values and exposes confirmed status as ISO timestamp', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            txid: 'a'.repeat(64), version: 2, locktime: 0, size: 250, weight: 1000, fee: 5000,
            vin: [{}, {}], vout: [{ value: 1234 }, { value: 5678 }],
            status: { confirmed: true, block_height: 800000, block_hash: 'b'.repeat(64), block_time: 1700000000 },
        }), { status: 200 })));
        const rows = await cmd.func({ txid: 'a'.repeat(64) });
        expect(rows[0]).toMatchObject({
            txid: 'a'.repeat(64), version: 2, vinCount: 2, voutCount: 2, totalOutputSats: 6912,
            confirmed: true, blockHeight: 800000, url: `https://mempool.space/tx/${'a'.repeat(64)}`,
        });
        expect(rows[0].blockTime).toBe('2023-11-14T22:13:20.000Z');
    });
});

describe('mempool block adapter', () => {
    const cmd = getRegistry().get('mempool/block');

    it('rejects refs that are neither 64-hex nor integer', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(cmd.func({ ref: '' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ ref: 'not-a-block' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ ref: '-1' })).rejects.toThrow(ArgumentError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps HTTP 404 (block-height resolver) to EmptyResultError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
        await expect(cmd.func({ ref: '99999999' })).rejects.toThrow(EmptyResultError);
    });

    it('resolves height → hash → block in two fetches', async () => {
        // First fetch returns plain hash text (block-height endpoint), second
        // returns the block JSON. We use mockImplementation so each call gets a
        // fresh Response (mockResolvedValue would re-use one body and the second
        // .text()/.json() would throw "Body has already been read").
        const calls = [];
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
            calls.push(url);
            if (url.includes('/api/block-height/')) {
                return Promise.resolve(new Response('c'.repeat(64), { status: 200 }));
            }
            return Promise.resolve(new Response(JSON.stringify({
                id: 'c'.repeat(64), height: 800000, version: 1, tx_count: 1234, size: 1024, weight: 4096,
                merkle_root: 'd'.repeat(64), previousblockhash: 'e'.repeat(64),
                timestamp: 1700000000, mediantime: 1699999000, nonce: 42, bits: 386015216, difficulty: 12345,
            }), { status: 200 }));
        }));
        const rows = await cmd.func({ ref: '800000' });
        expect(rows[0]).toMatchObject({
            id: 'c'.repeat(64), height: 800000, txCount: 1234, nonce: 42,
            url: `https://mempool.space/block/${'c'.repeat(64)}`,
        });
        expect(calls.length).toBe(2);
        expect(calls[0]).toContain('/api/block-height/800000');
    });
});

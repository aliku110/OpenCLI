// mempool block — fetch a Bitcoin block by hash or height.
//
// Wraps `/api/block/<hash>`. If the user passes a numeric height we first hit
// `/api/block-height/<n>` to resolve the hash, then the block endpoint.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import {
    MEMPOOL_BASE, isoFromUnix, mempoolFetch, requireBlockRef,
} from './utils.js';

cli({
    site: 'mempool',
    name: 'block',
    access: 'read',
    description: 'Fetch a Bitcoin block by hash or height (one row)',
    domain: 'mempool.space',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'ref', positional: true, required: true, help: 'Block hash (64-hex) or height (integer)' },
    ],
    columns: [
        'id', 'height', 'version', 'timestamp', 'txCount', 'size', 'weight',
        'merkleRoot', 'previousBlockHash', 'mediantime', 'nonce', 'bits', 'difficulty', 'url',
    ],
    func: async (args) => {
        const ref = requireBlockRef(args.ref);
        let hash = ref.value;
        if (ref.kind === 'height') {
            // Returns plain text body — the canonical hash for that height.
            hash = await mempoolFetch(`${MEMPOOL_BASE}/api/block-height/${ref.value}`, 'mempool block-height', { expect: 'text' });
            if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) {
                throw new EmptyResultError('mempool block', `No block at height ${ref.value}.`);
            }
        }
        const body = await mempoolFetch(`${MEMPOOL_BASE}/api/block/${hash}`, 'mempool block');
        if (!body || typeof body !== 'object' || typeof body.id !== 'string') {
            throw new EmptyResultError('mempool block', `Block "${hash}" not found.`);
        }
        return [{
            id: body.id,
            height: typeof body.height === 'number' ? body.height : null,
            version: typeof body.version === 'number' ? body.version : null,
            timestamp: isoFromUnix(body.timestamp),
            txCount: typeof body.tx_count === 'number' ? body.tx_count : null,
            size: typeof body.size === 'number' ? body.size : null,
            weight: typeof body.weight === 'number' ? body.weight : null,
            merkleRoot: typeof body.merkle_root === 'string' ? body.merkle_root : null,
            previousBlockHash: typeof body.previousblockhash === 'string' ? body.previousblockhash : null,
            mediantime: isoFromUnix(body.mediantime),
            nonce: typeof body.nonce === 'number' ? body.nonce : null,
            bits: typeof body.bits === 'number' ? body.bits : null,
            difficulty: typeof body.difficulty === 'number' ? body.difficulty : null,
            url: `${MEMPOOL_BASE}/block/${body.id}`,
        }];
    },
});

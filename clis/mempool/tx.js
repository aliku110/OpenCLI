// mempool tx — fetch a Bitcoin transaction by txid.
//
// Wraps `/api/tx/<txid>`. We surface counts + total output value rather than
// dumping vin/vout arrays so rows stay scannable.
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
    MEMPOOL_BASE, isoFromUnix, mempoolFetch, requireTxid, sumVoutValues,
} from './utils.js';

cli({
    site: 'mempool',
    name: 'tx',
    access: 'read',
    description: 'Fetch a Bitcoin transaction by txid (one row)',
    domain: 'mempool.space',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'txid', positional: true, required: true, help: 'Bitcoin transaction id (64-char hex)' },
    ],
    columns: [
        'txid', 'version', 'locktime', 'size', 'weight', 'fee',
        'vinCount', 'voutCount', 'totalOutputSats',
        'confirmed', 'blockHeight', 'blockHash', 'blockTime', 'url',
    ],
    func: async (args) => {
        const txid = requireTxid(args.txid);
        const url = `${MEMPOOL_BASE}/api/tx/${txid}`;
        const body = await mempoolFetch(url, 'mempool tx');
        if (!body || typeof body !== 'object' || typeof body.txid !== 'string') {
            // mempool.space returns 200 + text "Transaction not found" on some
            // edge cases; mempoolFetch already errors on bad JSON, but if the
            // shape is wrong (e.g. an empty `{}`) we treat it as Empty.
            throw new (await import('@jackwener/opencli/errors')).EmptyResultError('mempool tx', `Transaction "${txid}" not found.`);
        }
        const status = body.status && typeof body.status === 'object' ? body.status : {};
        return [{
            txid: body.txid,
            version: typeof body.version === 'number' ? body.version : null,
            locktime: typeof body.locktime === 'number' ? body.locktime : null,
            size: typeof body.size === 'number' ? body.size : null,
            weight: typeof body.weight === 'number' ? body.weight : null,
            fee: typeof body.fee === 'number' ? body.fee : null,
            vinCount: Array.isArray(body.vin) ? body.vin.length : null,
            voutCount: Array.isArray(body.vout) ? body.vout.length : null,
            totalOutputSats: sumVoutValues(body.vout),
            confirmed: typeof status.confirmed === 'boolean' ? status.confirmed : null,
            blockHeight: typeof status.block_height === 'number' ? status.block_height : null,
            blockHash: typeof status.block_hash === 'string' ? status.block_hash : null,
            blockTime: isoFromUnix(status.block_time),
            url: `${MEMPOOL_BASE}/tx/${body.txid}`,
        }];
    },
});

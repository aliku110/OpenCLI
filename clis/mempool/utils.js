// Shared helpers for the mempool.space adapters.
//
// mempool.space exposes a public Esplora-compatible REST API for Bitcoin
// transactions and blocks. No API key.
//   • /api/tx/<txid>          — tx detail (json object)
//   • /api/block/<hash>       — block detail by hash
//   • /api/block-height/<n>   — returns the block hash as a plain string
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

export const MEMPOOL_BASE = 'https://mempool.space';

const TXID_PATTERN = /^[0-9a-fA-F]{64}$/;
const BLOCK_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;

export function requireTxid(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) throw new ArgumentError('mempool txid is required');
    if (!TXID_PATTERN.test(raw)) {
        throw new ArgumentError(
            `mempool txid "${value}" is not a valid 64-char hex string`,
        );
    }
    return raw;
}

// Block reference: either a 64-char hex block hash, or a non-negative integer
// height. Returns `{kind: 'hash'|'height', value: string}`.
export function requireBlockRef(value) {
    const raw = String(value ?? '').trim();
    if (!raw) throw new ArgumentError('mempool block id (hash or height) is required');
    if (BLOCK_HASH_PATTERN.test(raw)) {
        return { kind: 'hash', value: raw.toLowerCase() };
    }
    if (/^\d+$/.test(raw)) {
        const h = Number(raw);
        if (!Number.isInteger(h) || h < 0) {
            throw new ArgumentError(`mempool block height "${value}" must be a non-negative integer`);
        }
        return { kind: 'height', value: String(h) };
    }
    throw new ArgumentError(
        `mempool block ref "${value}" is neither a 64-hex hash nor a non-negative integer height`,
    );
}

export async function mempoolFetch(url, label, { expect = 'json' } = {}) {
    let resp;
    try {
        resp = await fetch(url, { headers: { accept: expect === 'json' ? 'application/json' : 'text/plain' } });
    }
    catch (err) {
        throw new CommandExecutionError(
            `${label} request failed: ${err?.message ?? err}`,
            'Check that mempool.space is reachable from this network.',
        );
    }
    if (resp.status === 404) {
        throw new EmptyResultError(label, `mempool.space returned 404 for ${url}.`);
    }
    if (resp.status === 429) {
        throw new CommandExecutionError(
            `${label} returned HTTP 429 (rate limited)`,
            'mempool.space caps anonymous traffic; back off and retry.',
        );
    }
    if (!resp.ok) {
        throw new CommandExecutionError(`${label} returned HTTP ${resp.status}`);
    }
    if (expect === 'text') {
        return (await resp.text()).trim();
    }
    let body;
    try {
        body = await resp.json();
    }
    catch (err) {
        // mempool.space returns plain "Transaction not found" text on the json
        // endpoint when a tx is unknown — surface as EmptyResultError.
        throw new CommandExecutionError(`${label} returned malformed JSON: ${err?.message ?? err}`);
    }
    return body;
}

// `vin` / `vout` arrays can be huge; we only surface counts and aggregate values.
export function sumVoutValues(vout) {
    if (!Array.isArray(vout)) return null;
    let total = 0;
    for (const v of vout) {
        if (typeof v?.value === 'number' && Number.isFinite(v.value)) total += v.value;
    }
    return total;
}

export function isoFromUnix(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
    return new Date(seconds * 1000).toISOString();
}

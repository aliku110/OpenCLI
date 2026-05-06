# mempool.space

**Mode**: 🌐 Public · **Domain**: `mempool.space`

Bitcoin transaction and block lookup against mempool.space's Esplora-compatible REST API. No API key.

## Commands

| Command | Description |
|---------|-------------|
| `opencli mempool tx <txid>` | Fetch a Bitcoin transaction by 64-hex txid |
| `opencli mempool block <ref>` | Fetch a block by 64-hex hash or integer height |

## Usage Examples

```bash
# Tx detail
opencli mempool tx 4ae286f67e24e41bfa0d0ad491b2669dc0e166cb9d4f54bc1661f37c69b79735

# Block by hash
opencli mempool block 000000000000000000000978c2de1ec6d5fca5f23d25bb92c1d2ae6b24c88883

# Block by height (resolved internally via /api/block-height)
opencli mempool block 800000
opencli mempool block 0          # genesis block
```

## Output Columns

| Command | Columns |
|---------|---------|
| `tx` | `txid, version, locktime, size, weight, fee, vinCount, voutCount, totalOutputSats, confirmed, blockHeight, blockHash, blockTime, url` |
| `block` | `id, height, version, timestamp, txCount, size, weight, merkleRoot, previousBlockHash, mediantime, nonce, bits, difficulty, url` |

The `blockHash` from a `tx` row round-trips into `mempool block <hash>`.

## Options

### `tx`

| Option | Description |
|--------|-------------|
| `txid` (positional) | Bitcoin transaction id (64-char lowercase hex) |

### `block`

| Option | Description |
|--------|-------------|
| `ref` (positional) | Block hash (64-hex) **or** non-negative integer height |

## Notes

- **Two-fetch height resolution.** `block <height>` first hits `/api/block-height/<n>` (returns the canonical hash as plain text), then `/api/block/<hash>` for the JSON. Hash inputs skip the first hop. The contract test exercises both call sites with `mockImplementation` to avoid the "Body has already been read" trap of `mockResolvedValue`.
- **`vin` / `vout` counts only**, not the full input/output arrays. `vout` arrays can be hundreds of entries long for high-fanout txs; we surface counts + `totalOutputSats` (sum of all output values) so a single row stays scannable.
- **`fee` and `totalOutputSats` are in satoshis** (1 BTC = 100,000,000 sats). Convert at the call site if you need BTC.
- **`confirmed: false`** indicates a tx still in the mempool; `blockHeight` / `blockHash` / `blockTime` are `null` until inclusion.
- **`timestamp` and `mediantime` are normalised** from unix-seconds to ISO. Genesis (`height: 0`) has `timestamp: '2009-01-03T18:15:05.000Z'`.
- **Difficulty.** `difficulty` is a float (Bitcoin Core's published difficulty number). For raw nBits, use the `bits` column.
- **No API key required.** mempool.space's public REST is free for everyone; bursts → `CommandExecutionError`.
- **Errors.** Bad txid (not 64-hex) / bad block ref / negative height → `ArgumentError`; HTTP 404 (unknown txid/hash/height) → `EmptyResultError`; transport / 429 / non-200 → `CommandExecutionError`.

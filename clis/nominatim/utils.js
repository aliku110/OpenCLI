// Shared helpers for the Nominatim (OpenStreetMap) adapters.
//
// Nominatim is OSM's public geocoder. Two endpoints we care about:
//   • `/search?q=...` for forward geocode (text → coords)
//   • `/reverse?lat=&lon=` for reverse geocode (coords → address)
// No API key. Their usage policy *requires* a real User-Agent and recommends
// <= 1 req/s for anonymous traffic; we set a polite UA and surface 429 verbatim.
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const UA = 'opencli-nominatim-adapter/1.0 (+https://github.com/jackwener/opencli)';

export function requireString(value, label) {
    const s = String(value ?? '').trim();
    if (!s) throw new ArgumentError(`nominatim ${label} cannot be empty`);
    return s;
}

export function requireBoundedInt(value, defaultValue, maxValue, label = 'limit') {
    const raw = value ?? defaultValue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new ArgumentError(`nominatim ${label} must be a positive integer`);
    }
    if (n > maxValue) {
        throw new ArgumentError(`nominatim ${label} must be <= ${maxValue}`);
    }
    return n;
}

// Latitude in [-90, 90], longitude in [-180, 180]. Reject NaN explicitly so
// callers see ArgumentError instead of a 400 from upstream.
export function requireCoord(value, kind) {
    const raw = value ?? '';
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) {
        throw new ArgumentError(`nominatim ${kind} "${value}" is not a finite number`);
    }
    if (kind === 'lat' && (n < -90 || n > 90)) {
        throw new ArgumentError(`nominatim lat ${n} is out of range [-90, 90]`);
    }
    if (kind === 'lon' && (n < -180 || n > 180)) {
        throw new ArgumentError(`nominatim lon ${n} is out of range [-180, 180]`);
    }
    return n;
}

// Country-code filter: ISO 3166-1 alpha-2, comma-separated, lowercased.
export function normalizeCountryCodes(value) {
    if (value === undefined || value === null || value === '') return null;
    const parts = String(value).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return null;
    for (const p of parts) {
        if (!/^[a-z]{2}$/.test(p)) {
            throw new ArgumentError(`nominatim countrycode "${p}" is not a 2-letter ISO 3166-1 alpha-2 code`);
        }
    }
    return parts.join(',');
}

export async function nominatimFetch(url, label) {
    let resp;
    try {
        resp = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    }
    catch (err) {
        throw new CommandExecutionError(
            `${label} request failed: ${err?.message ?? err}`,
            'Check that nominatim.openstreetmap.org is reachable from this network.',
        );
    }
    if (resp.status === 404) {
        throw new EmptyResultError(label, `Nominatim returned 404 for ${url}.`);
    }
    if (resp.status === 429) {
        throw new CommandExecutionError(
            `${label} returned HTTP 429 (rate limited)`,
            'OSM Nominatim caps anonymous traffic at ~1 req/s; back off and retry.',
        );
    }
    if (resp.status === 403) {
        throw new CommandExecutionError(
            `${label} returned HTTP 403`,
            'Nominatim usage policy blocks bare User-Agent traffic; ensure UA is set.',
        );
    }
    if (!resp.ok) {
        throw new CommandExecutionError(`${label} returned HTTP ${resp.status}`);
    }
    let body;
    try {
        body = await resp.json();
    }
    catch (err) {
        throw new CommandExecutionError(`${label} returned malformed JSON: ${err?.message ?? err}`);
    }
    return body;
}

// Project Nominatim's nested address blob into a flat row. Nominatim's address
// keys are not stable per row (a `village` may be present where `city` is not),
// so we fall through a precedence list rather than picking exactly one key.
export function pickCity(address) {
    if (!address || typeof address !== 'object') return null;
    return address.city || address.town || address.village || address.hamlet
        || address.municipality || address.county || null;
}

export function placeUrl(osmType, osmId) {
    if (!osmType || !osmId) return null;
    // OSM's URL prefix is the first letter of the osm_type (node/way/relation).
    const prefix = osmType[0].toUpperCase();
    return `https://www.openstreetmap.org/${osmType}/${osmId}`;
}

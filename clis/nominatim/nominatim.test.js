import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import './geocode.js';
import './reverse.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('nominatim geocode adapter', () => {
    const cmd = getRegistry().get('nominatim/geocode');

    it('rejects bad args before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(cmd.func({ query: '' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ query: 'paris', limit: 999 })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ query: 'paris', countrycodes: 'xx,!!' })).rejects.toThrow(ArgumentError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps HTTP 429 to CommandExecutionError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('throttled', { status: 429 })));
        await expect(cmd.func({ query: 'paris', limit: 5 })).rejects.toThrow(CommandExecutionError);
    });

    it('throws EmptyResultError on empty array response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
        await expect(cmd.func({ query: 'no-such-place' })).rejects.toThrow(EmptyResultError);
    });

    it('coerces lat/lon strings to numbers and resolves OSM url', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
            place_id: 12345, osm_type: 'way', osm_id: 5013364,
            lat: '48.8582599', lon: '2.2945006', class: 'man_made', type: 'tower',
            importance: 0.62, display_name: 'Tour Eiffel, Paris, France',
            address: { country: 'France', country_code: 'fr', city: 'Paris', state: 'Île-de-France', postcode: '75007' },
        }]), { status: 200 })));
        const rows = await cmd.func({ query: 'eiffel tower', limit: 5 });
        expect(rows[0]).toMatchObject({
            rank: 1, lat: 48.8582599, lon: 2.2945006,
            country: 'France', countryCode: 'fr', city: 'Paris', state: 'Île-de-France',
            osmType: 'way', osmId: 5013364, placeId: 12345,
            url: 'https://www.openstreetmap.org/way/5013364',
        });
    });
});

describe('nominatim reverse adapter', () => {
    const cmd = getRegistry().get('nominatim/reverse');

    it('rejects malformed coords before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(cmd.func({ lat: 'NaN', lon: '0' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ lat: '91', lon: '0' })).rejects.toThrow(ArgumentError);
        await expect(cmd.func({ lat: '0', lon: '181' })).rejects.toThrow(ArgumentError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps HTTP 403 to CommandExecutionError (UA-policy violation)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('blocked', { status: 403 })));
        await expect(cmd.func({ lat: '0', lon: '0' })).rejects.toThrow(CommandExecutionError);
    });

    it('treats {error: ...} body as EmptyResultError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unable to geocode' }), { status: 200 })));
        await expect(cmd.func({ lat: '0', lon: '0' })).rejects.toThrow(EmptyResultError);
    });

    it('falls back through city precedence chain (town/village/hamlet)', async () => {
        // Some rural reverse hits have no `city` but have `village`; the picker
        // must surface it so the row's `city` column is not silently null.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            place_id: 1, osm_type: 'node', osm_id: 999,
            lat: '50.0', lon: '8.0', display_name: 'A village', type: 'house', class: 'place',
            address: { country: 'Germany', country_code: 'de', village: 'Kleindorf', state: 'Hessen', postcode: '00000' },
        }), { status: 200 })));
        const rows = await cmd.func({ lat: '50.0', lon: '8.0' });
        expect(rows[0]).toMatchObject({
            country: 'Germany', countryCode: 'de', city: 'Kleindorf', state: 'Hessen',
            url: 'https://www.openstreetmap.org/node/999',
        });
    });
});

// nominatim geocode — forward-geocode an address string into lat/lon + structured address rows.
//
// Wraps `/search` on nominatim.openstreetmap.org. Returns one row per match
// sorted by Nominatim's `importance` desc (their relevance ranking).
import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import {
    NOMINATIM_BASE, normalizeCountryCodes, nominatimFetch, pickCity, placeUrl,
    requireBoundedInt, requireString,
} from './utils.js';

cli({
    site: 'nominatim',
    name: 'geocode',
    access: 'read',
    description: 'Forward-geocode an address into lat/lon + structured address rows',
    domain: 'nominatim.openstreetmap.org',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'query', positional: true, required: true, help: 'Free-text address or place name' },
        { name: 'limit', type: 'int', default: 10, help: 'Max rows (1-50)' },
        { name: 'countrycodes', help: 'Comma-separated ISO-3166-1 alpha-2 country filter (e.g. "fr,de")' },
    ],
    columns: [
        'rank', 'displayName', 'lat', 'lon', 'type', 'class', 'importance',
        'country', 'countryCode', 'city', 'state', 'postcode',
        'osmType', 'osmId', 'placeId', 'url',
    ],
    func: async (args) => {
        const query = requireString(args.query, 'query');
        const limit = requireBoundedInt(args.limit, 10, 50);
        const countrycodes = normalizeCountryCodes(args.countrycodes);
        let url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}`
            + `&format=json&addressdetails=1&limit=${limit}`;
        if (countrycodes) url += `&countrycodes=${encodeURIComponent(countrycodes)}`;
        const body = await nominatimFetch(url, 'nominatim geocode');
        const list = Array.isArray(body) ? body : [];
        if (!list.length) {
            throw new EmptyResultError('nominatim geocode', `No matches for "${query}".`);
        }
        return list.slice(0, limit).map((hit, i) => {
            const addr = hit?.address && typeof hit.address === 'object' ? hit.address : {};
            return {
                rank: i + 1,
                displayName: typeof hit?.display_name === 'string' ? hit.display_name : null,
                lat: typeof hit?.lat === 'string' ? Number(hit.lat) : null,
                lon: typeof hit?.lon === 'string' ? Number(hit.lon) : null,
                type: typeof hit?.type === 'string' ? hit.type : null,
                class: typeof hit?.class === 'string' ? hit.class : null,
                importance: typeof hit?.importance === 'number' ? hit.importance : null,
                country: typeof addr.country === 'string' ? addr.country : null,
                countryCode: typeof addr.country_code === 'string' ? addr.country_code : null,
                city: pickCity(addr),
                state: typeof addr.state === 'string' ? addr.state : null,
                postcode: typeof addr.postcode === 'string' ? addr.postcode : null,
                osmType: typeof hit?.osm_type === 'string' ? hit.osm_type : null,
                osmId: typeof hit?.osm_id === 'number' ? hit.osm_id : null,
                placeId: typeof hit?.place_id === 'number' ? hit.place_id : null,
                url: placeUrl(hit?.osm_type, hit?.osm_id),
            };
        });
    },
});

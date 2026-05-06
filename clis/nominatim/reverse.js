// nominatim reverse — reverse-geocode lat/lon into a structured address row.
//
// Wraps `/reverse` on nominatim.openstreetmap.org. Returns exactly one row.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { EmptyResultError } from '@jackwener/opencli/errors';
import {
    NOMINATIM_BASE, nominatimFetch, pickCity, placeUrl, requireCoord,
} from './utils.js';

cli({
    site: 'nominatim',
    name: 'reverse',
    access: 'read',
    description: 'Reverse-geocode a lat/lon pair into a structured address',
    domain: 'nominatim.openstreetmap.org',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'lat', positional: true, required: true, help: 'Latitude in decimal degrees' },
        { name: 'lon', positional: true, required: true, help: 'Longitude in decimal degrees' },
    ],
    columns: [
        'displayName', 'lat', 'lon', 'type', 'class',
        'country', 'countryCode', 'city', 'state', 'suburb', 'road', 'houseNumber', 'postcode',
        'osmType', 'osmId', 'placeId', 'url',
    ],
    func: async (args) => {
        const lat = requireCoord(args.lat, 'lat');
        const lon = requireCoord(args.lon, 'lon');
        const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
        const body = await nominatimFetch(url, 'nominatim reverse');
        // Nominatim signals "no result" with `{error: 'Unable to geocode'}`.
        if (body?.error) {
            throw new EmptyResultError('nominatim reverse', `No address found for (${lat}, ${lon}).`);
        }
        const addr = body?.address && typeof body.address === 'object' ? body.address : {};
        return [{
            displayName: typeof body?.display_name === 'string' ? body.display_name : null,
            lat: typeof body?.lat === 'string' ? Number(body.lat) : null,
            lon: typeof body?.lon === 'string' ? Number(body.lon) : null,
            type: typeof body?.type === 'string' ? body.type : null,
            class: typeof body?.class === 'string' ? body.class : null,
            country: typeof addr.country === 'string' ? addr.country : null,
            countryCode: typeof addr.country_code === 'string' ? addr.country_code : null,
            city: pickCity(addr),
            state: typeof addr.state === 'string' ? addr.state : null,
            suburb: typeof addr.suburb === 'string' ? addr.suburb : null,
            road: typeof addr.road === 'string' ? addr.road : null,
            houseNumber: typeof addr.house_number === 'string' ? addr.house_number : null,
            postcode: typeof addr.postcode === 'string' ? addr.postcode : null,
            osmType: typeof body?.osm_type === 'string' ? body.osm_type : null,
            osmId: typeof body?.osm_id === 'number' ? body.osm_id : null,
            placeId: typeof body?.place_id === 'number' ? body.place_id : null,
            url: placeUrl(body?.osm_type, body?.osm_id),
        }];
    },
});

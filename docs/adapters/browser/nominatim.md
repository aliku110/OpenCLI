# Nominatim (OpenStreetMap)

**Mode**: 🌐 Public · **Domain**: `nominatim.openstreetmap.org`

Forward- and reverse-geocode addresses against OpenStreetMap's official Nominatim service. No API key; usage policy requires a real `User-Agent` and recommends ~1 req/s for anonymous traffic — the adapter sets a polite UA and surfaces 429 verbatim.

## Commands

| Command | Description |
|---------|-------------|
| `opencli nominatim geocode <query>` | Forward-geocode an address into lat/lon + structured rows |
| `opencli nominatim reverse <lat> <lon>` | Reverse-geocode a lat/lon pair into a structured address |

## Usage Examples

```bash
# Forward geocode
opencli nominatim geocode "eiffel tower" --limit 3
opencli nominatim geocode "1600 Pennsylvania Ave"
opencli nominatim geocode "tokyo" --countrycodes jp

# Reverse geocode
opencli nominatim reverse 48.8582 2.2945           # Eiffel Tower
opencli nominatim reverse 40.7484 -73.9857         # Empire State Building
```

## Output Columns

| Command | Columns |
|---------|---------|
| `geocode` | `rank, displayName, lat, lon, type, class, importance, country, countryCode, city, state, postcode, osmType, osmId, placeId, url` |
| `reverse` | `displayName, lat, lon, type, class, country, countryCode, city, state, suburb, road, houseNumber, postcode, osmType, osmId, placeId, url` |

The `osmType` + `osmId` pair round-trips into an `openstreetmap.org/<type>/<id>` URL.

## Options

### `geocode`

| Option | Description |
|--------|-------------|
| `query` (positional) | Free-text address or place name |
| `--limit` | Max rows (1–50, default: 10) |
| `--countrycodes` | Comma-separated ISO-3166-1 alpha-2 codes (e.g. `fr,de`) |

### `reverse`

| Option | Description |
|--------|-------------|
| `lat` (positional) | Latitude in decimal degrees, range `[-90, 90]` |
| `lon` (positional) | Longitude in decimal degrees, range `[-180, 180]` |

## Notes

- **`city` precedence chain.** Nominatim's address blob has stable schemas only for the largest cities. Rural reverse hits often have `village` / `town` / `hamlet` instead of `city`. The adapter falls through `city → town → village → hamlet → municipality → county` so the `city` column is never silently `null` when *some* settlement name is available.
- **`lat` / `lon` are coerced to numbers**, not the raw `string` Nominatim returns. Easier to feed straight into geo math without re-parsing.
- **`importance`** is Nominatim's relevance score in `[0, 1]`; useful for filtering noisy `geocode` queries.
- **Country filter**. `--countrycodes` is a server-side filter — passing `fr,de` skips non-FR/DE results before they're ranked, so the most-important hit returned is the most-important hit *in the filtered set*.
- **Usage policy.** Per [OSM Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/): set a real `User-Agent`, ≤1 req/s, no bulk geocoding. The adapter sets `User-Agent: opencli-nominatim-adapter/1.0`; HTTP 403 from the policy enforcer surfaces as `CommandExecutionError`.
- **Errors.** Empty query / bad limit / bad countrycode / out-of-range lat-lon → `ArgumentError`; empty result list (`[]`) or `{error: ...}` body → `EmptyResultError`; transport / 429 / 403 / non-200 → `CommandExecutionError`.

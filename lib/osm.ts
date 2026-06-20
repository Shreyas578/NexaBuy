/**
 * OpenStreetMap integration — Nominatim geocoding + Overpass POI search.
 * No API key needed. Caches Overpass results per session to avoid rate limits.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'NexaBuy/1.0 (hackathon project; contact: nexabuy@hackathon.dev)';

// Module-level cache: key = "lat,lng,category,radius" → stores[]
const overpassCache = new Map<string, NearbyStore[]>();

export interface GeoPoint {
  lat: number;
  lng: number;
  displayName: string;
}

export interface NearbyStore {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
  osmType: string; // e.g. 'shop=electronics'
  hasLiveData: boolean;
  livePrice?: number;
  liveAvailable?: boolean;
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

export async function geocode(location: string): Promise<GeoPoint | null> {
  try {
    const params = new URLSearchParams({ q: location, format: 'json', limit: '1' });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data[0]) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}

// ─── Category Mapping ─────────────────────────────────────────────────────────

// Maps product category keywords → OSM shop tags
const CATEGORY_OSM_MAP: Record<string, string[]> = {
  electronics: ['shop=electronics', 'shop=computer', 'shop=mobile_phone'],
  phone: ['shop=mobile_phone', 'shop=electronics'],
  laptop: ['shop=electronics', 'shop=computer'],
  computer: ['shop=computer', 'shop=electronics'],
  tv: ['shop=electronics'],
  camera: ['shop=electronics', 'shop=photo'],
  clothing: ['shop=clothes', 'shop=department_store'],
  shoes: ['shop=shoes', 'shop=clothes'],
  sports: ['shop=sports', 'shop=outdoor'],
  furniture: ['shop=furniture', 'shop=department_store'],
  grocery: ['shop=supermarket', 'shop=convenience'],
  book: ['shop=books'],
  toy: ['shop=toys'],
  jewelry: ['shop=jewelry'],
  default: ['shop=department_store', 'shop=supermarket', 'shop=mall'],
};

export function inferOsmCategory(productName: string): string[] {
  const lower = productName.toLowerCase();
  for (const [key, tags] of Object.entries(CATEGORY_OSM_MAP)) {
    if (lower.includes(key)) return tags;
  }
  return CATEGORY_OSM_MAP.default;
}

// ─── Overpass Query ───────────────────────────────────────────────────────────

export async function findNearbyStores(
  lat: number,
  lng: number,
  osmTags: string[],
  radiusMeters = 5000
): Promise<NearbyStore[]> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${osmTags.join('|')},${radiusMeters}`;
  if (overpassCache.has(cacheKey)) {
    return overpassCache.get(cacheKey)!;
  }

  // Build Overpass QL query — union of tag filters
  const tagFilters = osmTags
    .map(tag => {
      const [k, v] = tag.split('=');
      return `node["${k}"="${v}"](around:${radiusMeters},${lat},${lng});
way["${k}"="${v}"](around:${radiusMeters},${lat},${lng});
relation["${k}"="${v}"](around:${radiusMeters},${lat},${lng});`;
    })
    .join('\n');

  const query = `[out:json][timeout:25];
(
${tagFilters}
);
out center 20;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      overpassCache.set(cacheKey, []);
      return [];
    }

    const data = await res.json();
    const elements: Record<string, unknown>[] = data.elements ?? [];

    const stores: NearbyStore[] = elements.slice(0, 15).map((el, i) => {
      const tags = (el.tags ?? {}) as Record<string, string>;
      const center = (el.center ?? {}) as { lat?: number; lon?: number };
      const storeLat = (el.lat as number) ?? center.lat ?? lat;
      const storeLng = (el.lon as number) ?? center.lon ?? lng;

      return {
        id: i,
        name: tags.name ?? tags.brand ?? 'Unnamed Store',
        lat: storeLat,
        lng: storeLng,
        address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
          .filter(Boolean).join(', ') || 'Address not listed',
        phone: tags.phone ?? tags['contact:phone'],
        website: tags.website ?? tags['contact:website'],
        osmType: Object.keys(tags).find(k => k === 'shop' || k === 'amenity')
          ? `${Object.keys(tags).find(k => k === 'shop' || k === 'amenity')}=${tags[Object.keys(tags).find(k => k === 'shop' || k === 'amenity')!]}`
          : 'shop',
        hasLiveData: false, // Will be enriched later by Wire
      };
    });

    overpassCache.set(cacheKey, stores);
    return stores;
  } catch {
    overpassCache.set(cacheKey, []);
    return [];
  }
}

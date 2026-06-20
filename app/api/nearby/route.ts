import { NextRequest, NextResponse } from 'next/server';
import { geocode, findNearbyStores, inferOsmCategory } from '@/lib/osm';
import { getStoreStock } from '@/lib/wire';

export const maxDuration = 30;

// Big-box retailers Wire may have actions for
const BIG_BOX = ['walmart', 'bestbuy', 'target', 'costco', 'homedepot', 'lowes', 'macys'];

export async function POST(req: NextRequest) {
  try {
    const { location, productName, radiusMeters = 5000 } = await req.json();
    if (!location) return NextResponse.json({ error: 'location is required' }, { status: 400 });

    // Step 1: Geocode the user's location
    const geo = await geocode(location);
    if (!geo) {
      return NextResponse.json({ error: `Could not geocode location: "${location}"` }, { status: 422 });
    }

    // Step 2: Get OSM category tags from product name
    const osmTags = inferOsmCategory(productName ?? 'product');

    // Step 3: Find nearby stores via Overpass
    const stores = await findNearbyStores(geo.lat, geo.lng, osmTags, radiusMeters);

    // Step 4: For big-box stores, try Wire for live stock data
    const enriched = await Promise.all(
      stores.map(async (store) => {
        const nameLower = store.name.toLowerCase().replace(/\s+/g, '');
        const isBigBox = BIG_BOX.some(b => nameLower.includes(b));
        if (!isBigBox || !productName) return store;

        const stock = await getStoreStock(store.name, productName).catch(() => null);
        if (!stock) return store;

        return {
          ...store,
          hasLiveData: true,
          livePrice: stock.price,
          liveAvailable: stock.available,
        };
      })
    );

    return NextResponse.json({
      geo,
      stores: enriched,
      osmTags,
      totalFound: enriched.length,
    });
  } catch (e) {
    console.error('[/api/nearby]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

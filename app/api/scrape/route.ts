import { NextRequest, NextResponse } from 'next/server';
import { scrapePage } from '@/lib/scraper';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

    const result = await scrapePage(url);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getCatalog } from '@/lib/wire';

export async function GET(req: NextRequest) {
  const service = req.nextUrl.searchParams.get('service');
  if (!service) return NextResponse.json({ error: 'service query param required' }, { status: 400 });

  const result = await getCatalog(service);
  return NextResponse.json(result);
}

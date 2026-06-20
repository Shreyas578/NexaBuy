import { NextRequest, NextResponse } from 'next/server';
import { runTask } from '@/lib/wire';

export async function POST(req: NextRequest) {
  try {
    const { action_id, params } = await req.json();
    if (!action_id) return NextResponse.json({ error: 'action_id is required' }, { status: 400 });

    const result = await runTask(action_id, params ?? {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

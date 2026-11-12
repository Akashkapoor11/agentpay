import { NextResponse } from 'next/server';
import { getRecentLedger } from '../../../lib/db.js';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const mandateId = request.nextUrl.searchParams.get('mandateId');
    if (!mandateId) return NextResponse.json({ error: 'mandateId is required.' }, { status: 400 });
    const rows = await getRecentLedger({ mandateId });
    return NextResponse.json({
      events: rows.map((row) => ({
        id: row.id,
        time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stage: row.stage,
        action: row.action,
        result: row.result,
        metadata: row.metadata,
        event_hash: row.event_hash || null,
        previous_event_hash: row.previous_event_hash || null
      }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Could not load the audit ledger.' }, { status: 500 });
  }
}

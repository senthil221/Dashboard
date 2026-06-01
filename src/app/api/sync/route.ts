import { type NextRequest } from 'next/server';
import { runFullSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min max

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const skipInboxes = body?.skipInboxes === true;
  const skipWarmupStats = body?.skipWarmupStats === true;

  try {
    const result = await runFullSync({ skipInboxes, skipWarmupStats });
    return Response.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, error: msg, recordsSynced: 0, warnings: [] }, { status: 500 });
  }
}

export async function GET() {
  const { getDb, getLastSync } = await import('@/lib/db');
  const db = getDb();
  const lastSync = getLastSync(db, 'full');
  const running = db.prepare(
    `SELECT * FROM sync_log WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
  ).get();

  return Response.json({
    lastSync: lastSync ?? null,
    isRunning: !!running,
  });
}

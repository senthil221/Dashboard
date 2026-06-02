export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    lastSync: new Date().toISOString(),
    isRunning: false,
  });
}

export async function POST() {
  return Response.json({
    success: true,
    message: 'Live data mode — all data is fetched directly from Smartlead on each request.',
    recordsSynced: 0,
    warnings: [],
  });
}

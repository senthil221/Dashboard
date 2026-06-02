export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ error: 'Use the dashboard page directly — live data mode.' }, { status: 404 });
}

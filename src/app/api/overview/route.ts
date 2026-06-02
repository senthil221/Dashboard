export const dynamic = 'force-dynamic';

// Data is now fetched server-side on app/page.tsx — this route is not used by the UI.
export async function GET() {
  return Response.json({ error: 'Use the dashboard page directly — live data mode.' }, { status: 404 });
}

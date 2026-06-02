export const dynamic = 'force-dynamic';

// Alerts are computed live from Smartlead data — no persistence layer.
// PATCH returns success so the UI resolve button still works visually,
// but the resolved state is not persisted across page loads.
export async function PATCH() {
  return Response.json({ success: true });
}

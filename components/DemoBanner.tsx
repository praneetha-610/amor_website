import { dbStatus } from "@/lib/db";

/** Only shown when something needs attention. Never shown with a real database connected. */
export function DemoBanner() {
  if (dbStatus === "live") return null;
  if (dbStatus === "not-connected") {
    return (
      <div className="demo-banner demo-banner--alert" role="alert">
        <strong>SETUP NEEDED</strong> — the database isn&apos;t connected, so reservations are switched off. Add the Supabase keys in Vercel.
      </div>
    );
  }
  return (
    <div className="demo-banner" role="note">
      <strong>DEMO MODE</strong> — bookings are stored in temporary memory and are not real.
    </div>
  );
}

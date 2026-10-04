import { isDemoMode } from "@/lib/db";

/** Shown whenever the in-memory demo store is active. Never shown with a real database. */
export function DemoBanner() {
  if (!isDemoMode) return null;
  return (
    <div className="demo-banner" role="note">
      <strong>DEMO MODE</strong> — bookings are stored in temporary memory and are not real.
    </div>
  );
}

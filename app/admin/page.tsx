import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { isDemoMode } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { adminPassword, isAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return <AdminLogin configured={adminPassword() !== null} demoHint={!process.env.ADMIN_PASSWORD && isDemoMode} />;
  }
  return <AdminDashboard today={todayIST()} demo={isDemoMode} />;
}

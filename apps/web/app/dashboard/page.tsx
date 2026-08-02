import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "My library" };

export default function DashboardPage() {
  return <Dashboard />;
}

import { redirect } from "next/navigation";
// "/" is now handled by app/page.tsx which redirects to /dashboard.
// This file redirects in case the route group is somehow hit directly.
export default function DashboardGroupIndex() {
  redirect("/dashboard");
}

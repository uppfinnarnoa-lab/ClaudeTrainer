import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Root route: redirect authenticated users to dashboard, others to login.
export default async function RootPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}

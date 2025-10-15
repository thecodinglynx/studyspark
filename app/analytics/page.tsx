import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export default async function AnalyticsPage() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <AnalyticsView userId={session.user.id} />;
}

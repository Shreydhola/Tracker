import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { demoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (await db.shipment.count({ where: { demo: !demoMode() } }))
    throw new Error(
      "Database mode mismatch. Use separate demo/live databases.",
    );
  return (
    <Shell user={{ name: user.name, email: user.email }} demo={demoMode()}>
      {children}
    </Shell>
  );
}

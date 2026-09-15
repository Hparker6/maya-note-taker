import { connection } from "next/server";
import { AppShell } from "@/components/shell/AppShell";
import { activeProvider } from "@/lib/ai-config";
import { passwordRequired } from "@/lib/auth";
import { today } from "@/lib/day";
import { totalStats } from "@/lib/practice";
import { getTree } from "@/lib/repo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const practice = totalStats(await today());
  return (
    <AppShell tree={getTree()} aiProvider={activeProvider()} practiceDue={practice.due + practice.new} passwordEnabled={passwordRequired()}>
      {children}
    </AppShell>
  );
}

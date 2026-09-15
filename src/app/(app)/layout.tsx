import { connection } from "next/server";
import { AppShell } from "@/components/shell/AppShell";
import { activeProvider } from "@/lib/ai-config";
import { passwordRequired } from "@/lib/auth";
import { canvasStatus } from "@/lib/canvas";
import { today } from "@/lib/day";
import { totalStats } from "@/lib/practice";
import { getTree } from "@/lib/repo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const practice = totalStats(await today());
  const canvas = canvasStatus();
  return (
    <AppShell tree={getTree()} aiProvider={activeProvider()} practiceDue={practice.due + practice.new}
      canvas={{
        connected: Boolean(canvas.feedUrl || canvas.tokenHint),
        hasToken: Boolean(canvas.tokenHint),
        lastSyncAt: canvas.lastSync?.at ?? null,
        lastSyncOk: canvas.lastSync?.ok ?? null,
      }} passwordEnabled={passwordRequired()}>
      {children}
    </AppShell>
  );
}

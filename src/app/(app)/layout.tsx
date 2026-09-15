import { connection } from "next/server";
import { AppShell } from "@/components/shell/AppShell";
import { aiConfigured } from "@/lib/ai";
import { passwordRequired } from "@/lib/auth";
import { getTree } from "@/lib/repo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <AppShell tree={getTree()} aiReady={aiConfigured()} passwordEnabled={passwordRequired()}>
      {children}
    </AppShell>
  );
}

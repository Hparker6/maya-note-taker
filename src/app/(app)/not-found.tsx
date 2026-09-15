import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-20 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-sunken text-ink-3">
        <SearchX className="size-5" />
      </div>
      <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">This page isn&apos;t here</h1>
      <p className="mt-2 max-w-sm text-[15px] text-ink-3">It may have been deleted or moved.</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-6")}>
        Back to home
      </Link>
    </div>
  );
}

"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  BookMarked,
  Brain,
  CalendarDays,
  ChevronRight,
  FolderPlus,
  GraduationCap,
  Home,
  LogOut,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { APP_NAME } from "@/lib/brand";
import { classColor } from "@/lib/colors";
import { RelativeTime } from "../RelativeTime";
import type { ClassNode } from "@/lib/types";
import { useHydrated, useIsDarkTheme, useLocalStorage } from "@/lib/useStorage";
import { Button } from "../ui/Button";
import { Menu } from "../ui/Menu";
import { mod } from "../editor/palette";
import { useShell } from "./ShellContext";
import { useTreeActions } from "./useTreeActions";

const EXPANDED_KEY = "sidebar:expanded";

export function Sidebar({
  activeUnitId,
  passwordEnabled,
  onNavigate,
}: {
  activeUnitId: number | null;
  passwordEnabled: boolean;
  onNavigate?: () => void;
}) {
  const { tree, aiReady, aiProvider, openAiSettings, openCanvas, canvas, practiceDue, openUpload, openSearch, openClassDialog } = useShell();
  const actions = useTreeActions();
  const pathname = usePathname();
  const router = useRouter();
  const dark = useIsDarkTheme();
  const hydrated = useHydrated();
  const shortcut = hydrated && mod() === "⌘" ? "⌘K" : "Ctrl K";
  const [, setTheme] = useLocalStorage("theme");

  // Expanded rows the user chose (persisted) plus the path to whatever is open.
  const [storedExpanded, setStoredExpanded] = useLocalStorage(EXPANDED_KEY);
  const userExpanded = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(storedExpanded ?? "[]"));
    } catch {
      return new Set<string>();
    }
  }, [storedExpanded]);

  const routeUnit = pathname.match(/^\/units\/(\d+)/)?.[1];
  const routeSection = pathname.match(/^\/sections\/(\d+)/)?.[1];
  const routeClass = pathname.match(/^\/classes\/(\d+)/)?.[1];
  const currentUnit = activeUnitId ?? (routeUnit ? Number(routeUnit) : null);

  const pathKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of tree) {
      if (String(c.id) === routeClass) keys.add(`c${c.id}`);
      for (const s of c.sections) {
        if (String(s.id) === routeSection || s.units.some((u) => u.id === currentUnit)) {
          keys.add(`c${c.id}`);
          keys.add(`s${s.id}`);
        }
      }
    }
    return keys;
  }, [tree, currentUnit, routeSection, routeClass]);

  // Rows on the active path auto-open once per navigation, but can still be collapsed.
  const pathSignature = [...pathKeys].join(",");
  const [autoOpen, setAutoOpen] = useState({ signature: pathSignature, keys: pathKeys });
  if (autoOpen.signature !== pathSignature) setAutoOpen({ signature: pathSignature, keys: pathKeys });

  const expanded = useMemo(() => new Set([...userExpanded, ...autoOpen.keys]), [userExpanded, autoOpen]);

  const toggle = (key: string) => {
    const next = new Set(userExpanded);
    if (expanded.has(key)) {
      next.delete(key);
      if (autoOpen.keys.has(key)) {
        const keys = new Set(autoOpen.keys);
        keys.delete(key);
        setAutoOpen({ signature: autoOpen.signature, keys });
      }
    } else {
      next.add(key);
    }
    setStoredExpanded(JSON.stringify([...next]));
  };

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  const signOut = async () => {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  };

  const rowBase =
    "group flex h-8 items-center gap-1.5 rounded-lg pr-1 text-[13.5px] transition-colors hover:bg-hover [&_.row-menu]:opacity-0 hover:[&_.row-menu]:opacity-100 focus-within:[&_.row-menu]:opacity-100";
  const menuTrigger = "row-menu grid size-6 place-items-center rounded-md text-ink-3 hover:bg-card hover:text-ink aria-expanded:opacity-100";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <div className="grid size-8 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-[var(--shadow-sm)]">
          <BookMarked className="size-[17px]" />
        </div>
        <Link href="/" onClick={onNavigate} className="font-serif text-[17px] font-semibold tracking-tight">
          {APP_NAME}
        </Link>
      </div>

      <div className="space-y-1.5 px-3">
        <button
          onClick={openSearch}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-[13.5px] text-ink-3 shadow-[var(--shadow-sm)] transition-colors hover:border-line-strong hover:text-ink-2"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="hidden rounded border border-line px-1 text-[10.5px] font-medium [@media(hover:hover)]:inline">{shortcut}</kbd>
        </button>
        <Button variant="primary" className="w-full" onClick={() => openUpload({ unitId: currentUnit ?? undefined })}>
          <UploadCloud /> Upload PDFs
        </Button>
      </div>

      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <Link
          href="/"
          onClick={onNavigate}
          className={clsx(rowBase, "px-2", pathname === "/" ? "bg-hover font-medium text-ink" : "text-ink-2")}
        >
          <Home className="size-4 text-ink-3" /> Home
        </Link>
        <Link
          href="/calendar"
          onClick={onNavigate}
          className={clsx(rowBase, "px-2", pathname === "/calendar" ? "bg-hover font-medium text-ink" : "text-ink-2")}
        >
          <CalendarDays className="size-4 text-ink-3" /> Calendar
        </Link>
        <Link
          href="/practice"
          onClick={onNavigate}
          className={clsx(rowBase, "px-2", pathname === "/practice" ? "bg-hover font-medium text-ink" : "text-ink-2")}
        >
          <Brain className="size-4 text-ink-3" /> <span className="flex-1">Practice</span>
          {practiceDue > 0 && (
            <span className="rounded-full bg-[var(--tc-orange)] px-1.5 py-px text-[10.5px] font-bold text-white tabular-nums dark:text-[#1a1208]" title={`${practiceDue} cards to review`}>
              {practiceDue > 99 ? "99+" : practiceDue}
            </span>
          )}
        </Link>
        <Link
          href="/grades"
          onClick={onNavigate}
          className={clsx(rowBase, "px-2", pathname === "/grades" ? "bg-hover font-medium text-ink" : "text-ink-2")}
        >
          <Award className="size-4 text-ink-3" /> Grades
        </Link>

        <div className="mt-5 mb-1 flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Classes</span>
          <button
            onClick={() => openClassDialog()}
            className="grid size-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
            title="New class"
            aria-label="New class"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {!tree.length && (
          <button
            onClick={() => openClassDialog()}
            className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-left text-[13px] text-ink-3 hover:border-accent hover:text-accent"
          >
            <GraduationCap className="size-4" /> Add your first class
          </button>
        )}

        <ul className="space-y-px">
          {tree.map((c, ci) => (
            <ClassItem
              key={c.id}
              klass={c}
              first={ci === 0}
              last={ci === tree.length - 1}
              expanded={expanded}
              toggle={toggle}
              pathname={pathname}
              currentUnit={currentUnit}
              rowBase={rowBase}
              menuTrigger={menuTrigger}
              actions={actions}
              onNavigate={onNavigate}
              openUpload={openUpload}
              openClassDialog={openClassDialog}
            />
          ))}
        </ul>
      </nav>

      <div className="border-t border-line px-3 pt-2">
        <button
          onClick={openCanvas}
          className={clsx(
            "-ml-1.5 flex h-8 w-[calc(100%+0.75rem)] min-w-0 items-center gap-1.5 truncate rounded-lg px-1.5 text-left text-xs transition-colors hover:bg-hover",
            canvas.connected ? (canvas.lastSyncOk === false ? "text-[var(--tc-orange)]" : "text-ink-3 hover:text-ink") : "text-[var(--tc-orange)]",
          )}
          title="Canvas sync settings"
        >
          {canvas.connected && canvas.lastSyncOk === false ? <AlertTriangle className="size-3.5 shrink-0" /> : <RefreshCw className="size-3.5 shrink-0" />}
          <span className="truncate">
            {!canvas.connected ? (
              "Connect Canvas"
            ) : canvas.lastSyncOk === false ? (
              "Canvas: sync problem"
            ) : canvas.lastSyncAt ? (
              <>
                Canvas · <RelativeTime iso={canvas.lastSyncAt} prefix="synced " />
              </>
            ) : (
              "Canvas connected"
            )}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-1 px-3 pt-0.5 pb-2.5">
        <button
          onClick={openAiSettings}
          className={clsx(
            "-ml-1.5 flex h-8 min-w-0 flex-1 items-center gap-1.5 truncate rounded-lg px-1.5 text-left text-xs transition-colors hover:bg-hover",
            aiReady ? "text-ink-3 hover:text-ink" : "text-[var(--tc-orange)]",
          )}
          title="AI settings"
        >
          <Sparkles className="size-3.5 shrink-0" />
          <span className="truncate">{aiReady ? `AI: ${aiProvider === "gemini" ? "Gemini (free)" : "Claude"}` : "Set up free AI"}</span>
        </button>
        <button
          onClick={toggleTheme}
          className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        {passwordEnabled && (
          <button
            onClick={signOut}
            className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ClassItem({
  klass: c,
  first,
  last,
  expanded,
  toggle,
  pathname,
  currentUnit,
  rowBase,
  menuTrigger,
  actions,
  onNavigate,
  openUpload,
  openClassDialog,
}: {
  klass: ClassNode;
  first: boolean;
  last: boolean;
  expanded: Set<string>;
  toggle: (key: string) => void;
  pathname: string;
  currentUnit: number | null;
  rowBase: string;
  menuTrigger: string;
  actions: ReturnType<typeof useTreeActions>;
  onNavigate?: () => void;
  openUpload: ReturnType<typeof useShell>["openUpload"];
  openClassDialog: ReturnType<typeof useShell>["openClassDialog"];
}) {
  const open = expanded.has(`c${c.id}`);
  const color = classColor(c.color);

  return (
    <li>
      <div className={clsx(rowBase, pathname === `/classes/${c.id}` ? "bg-hover text-ink" : "text-ink")}>
        <button
          onClick={() => toggle(`c${c.id}`)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:text-ink"
          aria-label={open ? "Collapse" : "Expand"}
          aria-expanded={open}
        >
          <ChevronRight className={clsx("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <Link href={`/classes/${c.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate font-medium">{c.name}</span>
        </Link>
        <Menu
          triggerClassName={menuTrigger}
          trigger={<MoreHorizontal className="size-4" />}
          items={[
            { label: "Edit class", icon: <Pencil />, onSelect: () => openClassDialog(c) },
            { label: "Add section", icon: <FolderPlus />, onSelect: () => actions.addSection(c) },
            { label: "Move up", icon: <ArrowUp />, onSelect: () => actions.move("classes", c.id, "up"), disabled: first, separatorBefore: true },
            { label: "Move down", icon: <ArrowDown />, onSelect: () => actions.move("classes", c.id, "down"), disabled: last },
            { label: "Delete class", icon: <Trash2 />, onSelect: () => actions.deleteClass(c, pathname.startsWith(`/classes/${c.id}`)), danger: true, separatorBefore: true },
          ]}
        />
      </div>

      {open && (
        <ul className="ml-[15px] border-l border-line pl-1.5">
          {c.sections.map((s, si) => {
            const sOpen = expanded.has(`s${s.id}`);
            return (
              <li key={s.id}>
                <div className={clsx(rowBase, pathname === `/sections/${s.id}` ? "bg-hover text-ink" : "text-ink-2")}>
                  <button
                    onClick={() => toggle(`s${s.id}`)}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:text-ink"
                    aria-label={sOpen ? "Collapse" : "Expand"}
                    aria-expanded={sOpen}
                  >
                    <ChevronRight className={clsx("size-3.5 transition-transform", sOpen && "rotate-90")} />
                  </button>
                  <Link href={`/sections/${s.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate">
                    {s.name}
                  </Link>
                  <Menu
                    triggerClassName={menuTrigger}
                    trigger={<MoreHorizontal className="size-4" />}
                    items={[
                      { label: "Rename section", icon: <Pencil />, onSelect: () => actions.renameSection(s) },
                      { label: "Add unit", icon: <Plus />, onSelect: () => actions.addUnit(s) },
                      { label: "Move up", icon: <ArrowUp />, onSelect: () => actions.move("sections", s.id, "up"), disabled: si === 0, separatorBefore: true },
                      { label: "Move down", icon: <ArrowDown />, onSelect: () => actions.move("sections", s.id, "down"), disabled: si === c.sections.length - 1 },
                      { label: "Delete section", icon: <Trash2 />, onSelect: () => actions.deleteSection(s, pathname === `/sections/${s.id}`), danger: true, separatorBefore: true },
                    ]}
                  />
                </div>
                {sOpen && (
                  <ul className="ml-[15px] border-l border-line pl-1.5">
                    {s.units.map((u, ui) => (
                      <li key={u.id}>
                        <div
                          className={clsx(
                            rowBase,
                            "pl-2",
                            currentUnit === u.id ? "bg-accent-soft font-medium text-accent" : "text-ink-2",
                          )}
                        >
                          <Link href={`/units/${u.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate">
                            {u.name}
                          </Link>
                          {u.doc_count + u.note_count > 0 && (
                            <span className="text-[11px] text-ink-3 tabular-nums group-hover:hidden">{u.doc_count + u.note_count}</span>
                          )}
                          <Menu
                            triggerClassName={menuTrigger}
                            trigger={<MoreHorizontal className="size-4" />}
                            items={[
                              { label: "Upload PDFs here", icon: <UploadCloud />, onSelect: () => openUpload({ unitId: u.id }) },
                              { label: "Rename unit", icon: <Pencil />, onSelect: () => actions.renameUnit(u) },
                              { label: "Move up", icon: <ArrowUp />, onSelect: () => actions.move("units", u.id, "up"), disabled: ui === 0, separatorBefore: true },
                              { label: "Move down", icon: <ArrowDown />, onSelect: () => actions.move("units", u.id, "down"), disabled: ui === s.units.length - 1 },
                              {
                                label: "Delete unit",
                                icon: <Trash2 />,
                                onSelect: () => actions.deleteUnit(u, currentUnit === u.id ? `/sections/${s.id}` : undefined),
                                danger: true,
                                separatorBefore: true,
                              },
                            ]}
                          />
                        </div>
                      </li>
                    ))}
                    <li>
                      <button
                        onClick={() => actions.addUnit(s)}
                        className="flex h-7 w-full items-center gap-1.5 rounded-lg pl-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink-2"
                      >
                        <Plus className="size-3.5" /> Add unit
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            );
          })}
          <li>
            <button
              onClick={() => actions.addSection(c)}
              className="flex h-7 w-full items-center gap-1.5 rounded-lg pl-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink-2"
            >
              <Plus className="size-3.5" /> Add section
            </button>
          </li>
        </ul>
      )}
    </li>
  );
}

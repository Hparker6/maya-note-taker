"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/client";
import type { ClassRow, SectionRow, UnitRow } from "@/lib/types";
import { useFeedback } from "../ui/feedback";

/** Create / rename / reorder / delete for classes, sections and units. */
export function useTreeActions() {
  const router = useRouter();
  const { toast, confirm, prompt } = useFeedback();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await fn();
        if (success) toast(success);
        router.refresh();
        return result;
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong", "error");
        return undefined;
      }
    },
    [router, toast],
  );

  return useMemo(
    () => ({
      async addSection(klass: Pick<ClassRow, "id" | "name">) {
        const name = await prompt({
          title: "New section",
          description: `Sections group units inside ${klass.name} — e.g. "Module 2", "Midterm block".`,
          label: "Section name",
          placeholder: "Module 1",
          confirmLabel: "Create section",
        });
        if (!name) return;
        const res = await run(() => api<{ id: number }>("/api/sections", { json: { class_id: klass.id, name } }));
        return res?.id;
      },

      async addUnit(section: Pick<SectionRow, "id" | "name">, navigate = true) {
        const name = await prompt({
          title: "New unit",
          description: `Units hold the PDFs and notes for one topic in ${section.name}.`,
          label: "Unit name",
          placeholder: "Unit 1 — Foundations",
          confirmLabel: "Create unit",
        });
        if (!name) return;
        const res = await run(() => api<{ id: number }>("/api/units", { json: { section_id: section.id, name } }));
        if (res && navigate) router.push(`/units/${res.id}`);
        return res?.id;
      },

      async renameSection(section: Pick<SectionRow, "id" | "name">) {
        const name = await prompt({ title: "Rename section", label: "Section name", initial: section.name });
        if (name && name !== section.name) await run(() => api(`/api/sections/${section.id}`, { method: "PATCH", json: { name } }), "Section renamed");
      },

      async renameUnit(unit: Pick<UnitRow, "id" | "name">) {
        const name = await prompt({ title: "Rename unit", label: "Unit name", initial: unit.name });
        if (name && name !== unit.name) await run(() => api(`/api/units/${unit.id}`, { method: "PATCH", json: { name } }), "Unit renamed");
      },

      move(kind: "classes" | "sections" | "units", id: number, dir: "up" | "down") {
        return run(() => api(`/api/${kind}/${id}`, { method: "PATCH", json: { move: dir } }));
      },

      async deleteClass(klass: Pick<ClassRow, "id" | "name">, redirect = false) {
        const ok = await confirm({
          title: `Delete ${klass.name}?`,
          message: "This permanently deletes the class with all of its sections, units, PDFs, notes and study sheets.",
          confirmLabel: "Delete class",
          danger: true,
        });
        if (!ok) return;
        await run(() => api(`/api/classes/${klass.id}`, { method: "DELETE" }), "Class deleted");
        if (redirect) router.push("/");
      },

      async deleteSection(section: Pick<SectionRow, "id" | "name" | "class_id">, redirect = false) {
        const ok = await confirm({
          title: `Delete ${section.name}?`,
          message: "This permanently deletes the section and every unit, PDF, note and sheet inside it.",
          confirmLabel: "Delete section",
          danger: true,
        });
        if (!ok) return;
        await run(() => api(`/api/sections/${section.id}`, { method: "DELETE" }), "Section deleted");
        if (redirect) router.push(`/classes/${section.class_id}`);
      },

      async deleteUnit(unit: Pick<UnitRow, "id" | "name">, redirectTo?: string) {
        const ok = await confirm({
          title: `Delete ${unit.name}?`,
          message: "This permanently deletes the unit with its PDFs, notes and study sheet.",
          confirmLabel: "Delete unit",
          danger: true,
        });
        if (!ok) return;
        await run(() => api(`/api/units/${unit.id}`, { method: "DELETE" }), "Unit deleted");
        if (redirectTo) router.push(redirectTo);
      },
    }),
    [confirm, prompt, router, run],
  );
}

import "server-only";
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Automatic copies of the database (notes, handwriting, flashcards, quizzes, study history).
// PDFs aren't copied: they live unchanged in data/files and can be re-uploaded.

const KEEP_DAILY = 14;
const KEEP_LABELED = 5;
const EVERY_MS = 20 * 60 * 60 * 1000;

export const backupDir = (dataDir: string) => path.join(dataDir, "backups");

function backups(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^maya-[\dT-]+(-[a-z-]+)?\.db$/.test(name))
    .sort()
    .reverse();
}

/** Writes a consistent copy of the live database. The copy only gets its final name once complete. */
export function backupDatabase(conn: Database.Database, dataDir: string, label?: string): string {
  const dir = backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const file = path.join(dir, `maya-${stamp}${label ? `-${label}` : ""}.db`);
  const partial = `${file}.partial`;
  fs.rmSync(partial, { force: true });
  conn.exec(`VACUUM INTO '${partial.replace(/'/g, "''")}'`);
  fs.renameSync(partial, file);

  const all = backups(dir);
  const stale = [...all.filter((n) => !/-[a-z-]+\.db$/.test(n)).slice(KEEP_DAILY), ...all.filter((n) => /-[a-z-]+\.db$/.test(n)).slice(KEEP_LABELED)];
  for (const name of stale) fs.rmSync(path.join(dir, name), { force: true });
  return file;
}

declare global {
  var __mayaBackupTimer: ReturnType<typeof setInterval> | undefined;
}

/** Backs up shortly after start and then about once a day while the app runs. */
export function scheduleBackups(conn: Database.Database, dataDir: string) {
  if (globalThis.__mayaBackupTimer) return;
  const run = () => {
    try {
      const latest = backups(backupDir(dataDir)).find((n) => !/-[a-z-]+\.db$/.test(n));
      const age = latest ? Date.now() - fs.statSync(path.join(backupDir(dataDir), latest)).mtimeMs : Infinity;
      if (age >= EVERY_MS) backupDatabase(conn, dataDir);
    } catch (err) {
      console.error("[backup] couldn't back up the database:", err);
    }
  };
  globalThis.__mayaBackupTimer = setInterval(run, 60 * 60 * 1000);
  globalThis.__mayaBackupTimer.unref?.();
  setTimeout(run, 5_000).unref?.();
}

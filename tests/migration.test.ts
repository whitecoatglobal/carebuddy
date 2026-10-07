import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { emptyState } from "care-buddy-shared";
import { AccountStore } from "../backend/src/accountStore";
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
it("requires a reviewed mapping hash and leaves the legacy source intact", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "carebuddy-migration-"));
  folders.push(folder);
  const file = path.join(folder, "test.db");
  const store = new AccountStore(file);
  const user = store.createAccount(
    "migration-qa",
    "QA",
    "Asia/Kuala_Lumpur",
    "test-salt",
    "00".repeat(64),
  );
  const legacy = emptyState();
  legacy.started = true;
  legacy.selectedProfileId = "p-me";
  legacy.profiles = [
    {
      id: "p-me",
      displayName: "Me",
      relationship: "Self",
      canView: true,
      canManage: true,
    },
  ];
  legacy.preferences.spokenReminders = true;
  store.db.exec(
    "CREATE TABLE state_snapshots(client_id TEXT PRIMARY KEY,state_json TEXT,updated_at TEXT)",
  );
  store.db
    .prepare("INSERT INTO state_snapshots VALUES(?,?,?)")
    .run("legacy-qa", JSON.stringify(legacy), legacy.now);
  store.close();
  const args = [
    "scripts/migrate-account.mjs",
    "--db",
    file,
    "--client-id",
    "legacy-qa",
    "--username",
    "migration-qa",
  ];
  const preview = JSON.parse(
    execFileSync(process.execPath, args, { encoding: "utf8" }),
  );
  expect(preview.action).toBe("PREVIEW_ONLY");
  let check = new AccountStore(file);
  expect(check.snapshot(user.id).state.preferences.spokenReminders).toBe(false);
  check.close();
  expect(() =>
    execFileSync(process.execPath, [...args, "--confirm", "wrong-hash"], {
      stdio: "pipe",
    }),
  ).toThrow();
  const done = JSON.parse(
    execFileSync(
      process.execPath,
      [...args, "--confirm", preview.confirmation],
      { encoding: "utf8" },
    ),
  );
  expect(done.action).toBe("IMPORTED");
  check = new AccountStore(file);
  expect(check.snapshot(user.id).state.preferences.spokenReminders).toBe(true);
  expect(
    check.db
      .prepare("SELECT client_id FROM state_snapshots WHERE client_id=?")
      .get("legacy-qa"),
  ).toBeTruthy();
  check.close();
});

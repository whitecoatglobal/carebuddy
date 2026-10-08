import { STORAGE_KEY, validateState } from "care-buddy-shared";

type BrowserStore = Pick<Storage, "getItem" | "setItem">;
const RECOVERY_KEY = "carebuddy.public-records-recovered-v1";
const LEGACY_KEY = "carebuddy.legacy-unclaimed-v1";

// The account screen backed up the previous browser state before clearing it.
// Reconnect only this browser's own saved care space, once, in the public app.
export function restorePreviousBrowserRecords(storage: BrowserStore): boolean {
  if (storage.getItem(RECOVERY_KEY)) return false;
  const legacy = storage.getItem(LEGACY_KEY);
  if (!legacy) return false;
  try {
    let current: unknown = null;
    try {
      current = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    } catch {
      // An unreadable current cache can still be restored from a valid backup.
    }
    if (validateState(current) && current.profiles.length) {
      storage.setItem(RECOVERY_KEY, "true");
      return false;
    }
    const backup = JSON.parse(legacy);
    const previous = JSON.parse(backup.raw);
    if (!validateState(previous)) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(previous));
    if (
      typeof backup.reference === "string" &&
      /^client-[a-z0-9-]{1,90}$/i.test(backup.reference)
    ) {
      storage.setItem("care-buddy.client-id", backup.reference);
    }
    storage.setItem(RECOVERY_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

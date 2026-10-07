import path from "node:path";
import { createHash } from "node:crypto";
import { AccountStore } from "../backend/dist/accountStore.js";
import { validateState } from "care-buddy-shared";

const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i], value = process.argv[i + 1];
  if (!["--db", "--client-id", "--username", "--confirm"].includes(name) || !value || flags.has(name)) throw new Error("Usage: node scripts/migrate-account.mjs --db /absolute/care-buddy.db --client-id SOURCE --username DESTINATION [--confirm PREVIEW_HASH]");
  flags.set(name, value);
}
if (!flags.get("--db") || !path.isAbsolute(flags.get("--db")) || !flags.get("--client-id") || !flags.get("--username")) throw new Error("An absolute database path, source client ID and destination username are required.");
const store = new AccountStore(flags.get("--db"));
try {
  store.db.transaction(() => {
    const source = store.db.prepare("SELECT state_json,updated_at FROM state_snapshots WHERE client_id = ?").get(flags.get("--client-id"));
    if (!source) throw new Error("Legacy source was not found.");
    const account = store.findAccount(flags.get("--username").toLowerCase());
    if (!account) throw new Error("Destination account was not found. Create the account first.");
    const state = JSON.parse(source.state_json);
    if (!validateState(state)) throw new Error("Legacy source does not pass state validation. No import performed.");
    const destination = store.snapshot(account.id);
    const counts = Object.fromEntries(["profiles","reminders","appointments","benefits","chats","notifications","activity"].map(name=>[name,state[name].length]));
    const sourceHash = createHash("sha256").update(source.state_json).digest("hex");
    const preview = { sourceClientId: flags.get("--client-id"), destinationUsername: account.username, destinationAccountId: account.id, destinationRevision: destination.revision, sourceUpdatedAt: source.updated_at, sourceTimeZone: state.timeZone || "Asia/Singapore", destinationTimeZone: account.time_zone, sourceHash, counts };
    const confirmation = createHash("sha256").update(JSON.stringify(preview)).digest("hex");
    if (!flags.has("--confirm")) {
      console.log(JSON.stringify({ ...preview, confirmation, action: "PREVIEW_ONLY", note: "Review the source/destination mapping before running again with --confirm and this hash." },null,2));
      return;
    }
    if (flags.get("--confirm") !== confirmation) throw new Error("Preview changed or confirmation hash is incorrect. Preview and review again.");
    const result = store.migrate(account.id,state,destination.revision,`legacy-migration:${confirmation}`);
    console.log(JSON.stringify({ action:"IMPORTED",destinationUsername:account.username,revision:result.revision,counts,legacySourcePreserved:true },null,2));
  })();
} finally { store.close(); }

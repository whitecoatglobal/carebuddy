import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { pluginFiles, zipFiles } from "../backend/src/pluginBundle";
import type { NotificationConnection } from "../backend/src/notificationConnections";
const connection: NotificationConnection = {
  id: "fixture-id",
  clientId: "client-private-fixture",
  target: "codex",
  profileIds: ["me"],
  includeHealth: true,
  createdAt: "2026-10-08T12:00:00Z",
  expiresAt: "2027-01-06T12:00:00Z",
  revokedAt: null,
};
it("exports both host manifests, remote MCP configs and a scoped monitoring skill", () => {
  const files = pluginFiles(connection, "fixture-only-secret");
  const root = "care-buddy-export/plugins/care-buddy/";
  expect(JSON.parse(files[root + "plugin.json"]).name).toBe("care-buddy");
  expect(JSON.parse(files[root + ".claude-plugin/plugin.json"]).name).toBe(
    "care-buddy",
  );
  expect(JSON.parse(files[root + ".codex-plugin/plugin.json"]).skills).toBe(
    "./skills/",
  );
  const portable = JSON.parse(files[root + "mcp.json"]).mcpServers[
    "care-buddy"
  ];
  expect(portable.type).toBe("streamable-http");
  expect(portable.headers.Authorization).toBe("Bearer fixture-only-secret");
  expect(
    JSON.parse(files[root + ".mcp.json"]).mcpServers["care-buddy"].type,
  ).toBe("http");
  expect(files[root + "skills/care-monitor/SKILL.md"]).toContain(
    "acknowledge_notifications",
  );
  expect(Object.values(files).join("\n")).not.toContain(
    "client-private-fixture",
  );
  expect(files["care-buddy-export/.gitignore"]).toContain("mcp.json");
});
it("packages a valid ZIP readable by standard tooling, including CRCs and hidden files", () => {
  const files = pluginFiles(connection, "fixture-only-secret");
  const zip = zipFiles(files);
  const result = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({'bad':z.testzip(),'files':len(z.namelist()),'readme':z.read('care-buddy-export/README.md').decode()}))",
      ],
      { input: zip },
    ).toString(),
  );
  expect(result.bad).toBeNull();
  expect(result.files).toBe(Object.keys(files).length);
  expect(result.readme).toContain("Care Buddy for Codex");
  expect(result.readme).not.toContain("{{");
});
it("uses a nested marketplace for Codex and an upload-ready root plugin for Claude", () => {
  const codex = pluginFiles(connection, "fixture-only-secret");
  const files = pluginFiles(
    { ...connection, target: "claude" },
    "fixture-only-secret",
  );
  expect(
    JSON.parse(codex["care-buddy-export/.agents/plugins/marketplace.json"])
      .plugins[0].source.path,
  ).toBe("./plugins/care-buddy");
  expect(
    JSON.parse(files[".claude-plugin/marketplace.json"]).plugins[0].source,
  ).toBe("./");
  expect(JSON.parse(files[".claude-plugin/plugin.json"]).name).toBe(
    "care-buddy",
  );
  expect(files["README.md"]).toContain("Care Buddy for Claude");
  expect(files["README.md"]).not.toContain("{{");
  expect(files["skills/care-monitor/SKILL.md"]).toContain(
    "get_care_notifications",
  );
  const validated = execFileSync(
    "python3",
    [
      "-c",
      "import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert '.claude-plugin/plugin.json' in z.namelist(); print('valid')",
    ],
    { input: zipFiles(files) },
  )
    .toString()
    .trim();
  expect(validated).toBe("valid");
});
it("rejects archive paths that escape the bundle", () => {
  expect(() => zipFiles({ "../secret": "no" })).toThrow();
  expect(() => zipFiles({ "/secret": "no" })).toThrow();
});

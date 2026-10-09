import { readFileSync } from "node:fs";
import type { NotificationConnection } from "./notificationConnections.js";
import { PUBLIC_SITE } from "./notificationFeed.js";

// Small, dependency-free ZIP writer. Entries are UTF-8, stored (uncompressed),
// with CRC32 and a central directory so Finder and standard unzip can open them.
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFiles(files: Record<string, string>): Buffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [path, contents] of Object.entries(files)) {
    if (path.startsWith("/") || path.split("/").includes(".."))
      throw new Error("Invalid archive path");
    const name = Buffer.from(path),
      data = Buffer.from(contents),
      crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
export function pluginFiles(
  connection: NotificationConnection,
  token: string,
): Record<string, string> {
  const folder = "care-buddy-export/plugins/care-buddy/";
  const metadata = {
    name: "care-buddy",
    version: "1.0.0",
    description:
      "Care reminders and health-reading notifications from your connected Care Buddy profiles.",
    author: { name: "Care Buddy", url: PUBLIC_SITE },
    homepage: PUBLIC_SITE,
  };
  const remote = {
    url: `${PUBLIC_SITE}/api/integrations/mcp`,
    headers: { Authorization: `Bearer ${token}` },
  };
  const template = (file: string) =>
    readFileSync(
      new URL(`../../agent-plugin/${file}`, import.meta.url),
      "utf8",
    );
  const files: Record<string, string> = {
    "care-buddy-export/README.md": template("INSTALL.md")
      .replaceAll(
        "{{ASSISTANT}}",
        connection.target === "codex" ? "Codex" : "Claude Code",
      )
      .replaceAll("{{EXPIRES_AT}}", connection.expiresAt.slice(0, 10)),
    "care-buddy-export/.gitignore":
      "plugins/care-buddy/.mcp.json\nplugins/care-buddy/mcp.json\n",
    "care-buddy-export/.agents/plugins/marketplace.json": json({
      name: "care-buddy-personal",
      interface: { displayName: "Care Buddy personal export" },
      plugins: [
        {
          name: "care-buddy",
          source: { source: "local", path: "./plugins/care-buddy" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Productivity",
        },
      ],
    }),
    "care-buddy-export/.claude-plugin/marketplace.json": json({
      name: "care-buddy-personal",
      owner: { name: "Care Buddy" },
      plugins: [
        {
          name: "care-buddy",
          source: "./plugins/care-buddy",
          description: metadata.description,
          version: metadata.version,
        },
      ],
    }),
    [folder + "plugin.json"]: json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      ...metadata,
    }),
    [folder + "mcp.json"]: json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { "care-buddy": { type: "streamable-http", ...remote } },
    }),
    [folder + ".claude-plugin/plugin.json"]: json(metadata),
    [folder + ".codex-plugin/plugin.json"]: json({
      ...metadata,
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "Care Buddy",
        shortDescription: "Care notifications in your assistant",
        longDescription: metadata.description,
        developerName: "Care Buddy",
        category: "Productivity",
        capabilities: ["Read", "Write"],
      },
    }),
    [folder + ".mcp.json"]: json({
      mcpServers: { "care-buddy": { type: "http", ...remote } },
    }),
    [folder + "skills/care-monitor/SKILL.md"]: template(
      "skills/care-monitor/SKILL.md",
    ),
    [folder + "skills/care-monitor/references/scheduling.md"]: template(
      "skills/care-monitor/references/scheduling.md",
    ),
    "care-buddy-export/connection.json": json({
      id: connection.id,
      target: connection.target,
      profileIds: connection.profileIds,
      healthAlertsEnabled: connection.includeHealth,
      expiresAt: connection.expiresAt,
      permissions: [
        "Read care notifications for selected profiles",
        "Remember notification delivery only",
      ],
    }),
  };
  if (connection.target === "claude") {
    // Claude's upload surface expects one plugin at the archive root.
    const upload = Object.fromEntries(
      Object.entries(files)
        .filter(([path]) => path.startsWith(folder))
        .map(([path, contents]) => [path.slice(folder.length), contents]),
    );
    upload["README.md"] = template("INSTALL_CLAUDE.md").replaceAll(
      "{{EXPIRES_AT}}",
      connection.expiresAt.slice(0, 10),
    );
    upload[".gitignore"] = ".mcp.json\nmcp.json\n";
    upload["connection.json"] = files["care-buddy-export/connection.json"];
    upload[".claude-plugin/marketplace.json"] = json({
      name: "care-buddy-personal",
      owner: { name: "Care Buddy" },
      plugins: [
        {
          name: "care-buddy",
          source: "./",
          description: metadata.description,
          version: metadata.version,
        },
      ],
    });
    return upload;
  }
  return files;
}

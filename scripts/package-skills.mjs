import { build } from "esbuild";
import { writeFile, mkdir, readFile, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const compiled = await build({
  entryPoints: ["src/domain.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { seed } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const state = seed();
state.started = true;
const defs = [
  [
    "care-appointment-preparation",
    { appointmentId: "a-check-me", scheduledAt: "2026-09-30T12:00:00+08:00" },
  ],
  [
    "care-reminder-change",
    {
      reminderId: "r-bed-me",
      scheduledAt: "2026-09-30T21:30:00+08:00",
      scope: "occurrence",
      userRequestedTime: true,
    },
  ],
  ["care-sample-benefits", { category: "gp" }],
];
const hashes = [];
for (const [slug, detail] of defs) {
  const dir = `workbuddy-skills/${slug}`;
  await mkdir(`${dir}/fixtures`, { recursive: true });
  await copyFile("src/types.ts", `${dir}/references/types.ts`);
  await writeFile(
    `${dir}/fixtures/request.json`,
    JSON.stringify(
      {
        state,
        profileId: "p-me",
        expectedClock: state.now,
        actionId: `example-${slug}`,
        ...detail,
      },
      null,
      2,
    ) + "\n",
  );
  execFileSync("python3", [
    "-c",
    `import pathlib,zipfile
p=pathlib.Path(${JSON.stringify(dir)})
with zipfile.ZipFile(str(p)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(p.rglob('*')):
  if f.is_file():z.write(f,f.relative_to(p))
`,
  ]);
  const zip = await readFile(dir + ".zip");
  hashes.push(
    createHash("sha256").update(zip).digest("hex") + "  " + slug + ".zip",
  );
}
await writeFile("workbuddy-skills/SHA256SUMS", hashes.join("\n") + "\n");
console.log(
  "Three ZIPs created from current seed() and types.ts; SKILL.md is at ZIP root.",
);

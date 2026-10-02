import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
      ),
    )
  ).flat();
}
const paths = (await walk("dist")).filter((p) => !p.endsWith("/sw.js")).sort();
const hash = createHash("sha256");
for (const p of paths) hash.update(await readFile(p));
const version = "care-buddy-" + hash.digest("hex").slice(0, 16);
const urls = paths.map((p) => "./" + p.slice(5));
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(version)};const SHELL=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('care-buddy-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('./index.html',self.registration.scope).href))));return;}e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request,{ignoreVary:true}))||fetch(e.request)));});
`,
);
console.log(`Service worker ${version}; ${urls.length} local app-shell files`);

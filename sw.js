/* نظام التطوّر اليومي — service worker: يعمل التطبيق كاملاً بدون إنترنت */
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
const VERSION = "tatawwur-pwa-v7";
const DATA = "tatawwur-data";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./maskable-512.png", "./badge-96.png", "./apple-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => c.add(new Request(FONT_CSS, {mode: "no-cors"})).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function refresh(req, cache){
  return fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; });
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const key = req.mode === "navigate" ? "./index.html" : req;
    const hit = await cache.match(key, {ignoreSearch: req.mode === "navigate"});
    if (hit) {                       // cached first, updated in the background
      if (!fonts) e.waitUntil(refresh(req.mode === "navigate" ? new Request("./index.html") : req, cache).catch(() => {}));
      return hit;
    }
    try { return await refresh(req, cache); }
    catch (err) { return (await cache.match("./index.html")) || Response.error(); }
  }));
});

/* reminders */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const nd = e.notification.data || {};
  const target = (e.action && nd.urls && nd.urls[e.action]) || nd.url || "./";
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
    for (const c of list) { if ("focus" in c) { c.postMessage({goto: target}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
async function readJSON(name, fallback){
  try { const c = await caches.open(DATA); const r = await c.match(name); return r ? await r.json() : fallback; } catch (e) { return fallback; }
}
async function writeJSON(name, v){
  const c = await caches.open(DATA);
  await c.put(name, new Response(JSON.stringify(v), {headers: {"content-type": "application/json"}}));
}
/* best effort when the app is closed: Android may wake this a few times a day at most */
async function catchUp(){
  if (self.Notification && "showTrigger" in Notification.prototype) return;   // the system already holds the schedule
  const list = await readJSON("schedule.json", []), shown = await readJSON("shown.json", {});
  const t = Date.now(), due = list.filter(r => r.at <= t && t - r.at < 3 * 3600e3 && !shown[r.id]);
  if (!due.length) return;
  const last = due[due.length - 1];
  await self.registration.showNotification(due.length > 1 ? "فاتتك " + due.length + " تذكيرات" : last.title, {
    body: due.length > 1 ? due.map(r => r.title).join(" · ") : last.body,
    tag: "catchup", icon: "icon-192.png", badge: "badge-96.png", lang: "ar", dir: "rtl", data: {url: "./#today"}});
  due.forEach(r => shown[r.id] = t);
  Object.keys(shown).forEach(k => { if (t - shown[k] > 3 * 864e5) delete shown[k]; });
  await writeJSON("shown.json", shown);
}
self.addEventListener("periodicsync", e => { if (e.tag === "reminders") e.waitUntil(catchUp()); });
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

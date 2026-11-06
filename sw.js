const CACHE_PREFIX = "evidence-spotrebicu-";
const CACHE_NAME = CACHE_PREFIX + "v10-vyhledavani";

const SOUBORY = [
    "./index.html",
    "./style.css",
    "./app.js",
    "./pwa.js",
    "./manifest.webmanifest",
    "./vendor/sql-wasm.js",
    "./vendor/sql-wasm.wasm",
    "./vendor/exceljs.min.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png"
];

const URL_SOUBORU = new Set(
    SOUBORY.map(cesta => new URL(cesta, self.location.href).href)
);

// St�hne v�echny soubory pot�ebn� pro offline spu�t�n�.
self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        await cache.addAll(
            SOUBORY.map(cesta => new Request(
                new URL(cesta, self.location.href),
                { cache: "reload" }
            ))
        );
    })());
});

// Odstran� pouze star�� cache t�to aplikace.
self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const nazvy = await caches.keys();

        await Promise.all(
            nazvy
                .filter(nazev =>
                    nazev.startsWith(CACHE_PREFIX) &&
                    nazev !== CACHE_NAME
                )
                .map(nazev => caches.delete(nazev))
        );

        await self.clients.claim();
    })());
});

// Poskytuje ulo�en� soubory i bez internetu.
self.addEventListener("fetch", event => {
    const pozadavek = event.request;
    const url = new URL(pozadavek.url);

    if (pozadavek.method !== "GET") return;
    if (url.origin !== self.location.origin) return;

    const navigace =
        pozadavek.mode === "navigate" &&
        url.href.startsWith(self.registration.scope);

    if (!navigace && !URL_SOUBORU.has(url.href)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const ulozeny = await cache.match(
            navigace ? "./index.html" : pozadavek
        );

        return ulozeny || fetch(pozadavek);
    })());
});
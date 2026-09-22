/**
 * EEN KLEINE SERVICE WORKER, MET OPZET DOM
 *
 * Hij bewaart alleen wat een vaste naam met een hash heeft: de js- en
 * css-bestanden uit /assets en de pictogrammen. Die kunnen nooit verouderen,
 * want bij elke nieuwe versie krijgen ze een andere naam.
 *
 * Wat hij bewust NIET bewaart: de pagina zelf en alles wat naar Supabase gaat.
 * De pagina komt dus altijd vers van het net en verwijst naar de nieuwe
 * hashes; daarmee kan deze cache je nooit een oude app voorschotelen. En
 * mailgegevens horen niet in een schijfcache van de browser thuis.
 */
const CACHE = "benna-assets-v1";

/* Bij elke nieuwe versie krijgen de bestanden een nieuwe hash, dus de oude
   blijven achter zonder dat iets ze nog opvraagt. Zonder bovengrens groeit de
   cache dus eeuwig door. Zestig stuks is ruim: één versie van de app is er
   een stuk of acht. `cache.keys()` geeft ze op volgorde van toevoegen, dus de
   voorste zijn de oudste. */
const MAX = 60;

async function snoei(cache) {
  const sleutels = await cache.keys();
  for (const oud of sleutels.slice(0, sleutels.length - MAX)) await cache.delete(oud);
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const bewaarbaar = (url) =>
  url.origin === self.location.origin
  && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (!bewaarbaar(url)) return;

  e.respondWith(
    caches.match(e.request).then((gevonden) => {
      if (gevonden) return gevonden;
      return fetch(e.request).then((antwoord) => {
        // Alleen een volledig, gelukt antwoord is het bewaren waard.
        if (antwoord.ok && antwoord.status === 200) {
          const kopie = antwoord.clone();
          void caches.open(CACHE)
            .then((c) => c.put(e.request, kopie).then(() => snoei(c)))
            .catch(() => { /* geen ruimte of geen toestemming: dan gewoon zonder cache */ });
        }
        return antwoord;
      });
    }),
  );
});

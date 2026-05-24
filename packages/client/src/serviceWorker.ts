/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// STELLIS: skipWaiting + clientsClaim → new SW activates immediately and
// takes control of open windows. We DO NOT force-navigate clients here —
// previous attempt at clients.navigate() caused interactive state loss
// (buttons inert after iOS PWA woke up). Workbox's cleanupOutdatedCaches
// handles old precache purge; the user gets new assets on their next
// natural reload, and the update banner in main app prompts them when ready.
self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

interface ChannelPartial {
  channel_type: string;
  name?: string;
}

interface StoatPushNotification {
  title?: string;
  author?: string;
  body: string;
  icon?: string;
  channel?: ChannelPartial;
  url?: string;
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (typeof event.notification.data === "string") {
    event.waitUntil(self.clients.openWindow(event.notification.data));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.text();

  const notification: StoatPushNotification = JSON.parse(payload);

  if (!notification.title) {
    if (notification.channel) {
      if (notification.channel.channel_type === "DirectMessage") {
        notification.title = notification.author || "Stoat";
      } else {
        notification.title = `${notification.author} in ${notification.channel.name}`;
      }
    } else {
      notification.title = "Stoat";
    }
  }

  notification.url ||= self.registration.scope;

  event.waitUntil(
    self.registration.showNotification(notification.title || "Stoat", {
      icon: notification.icon,
      body: notification.body,
      data: notification.url,
    }),
  );
});

cleanupOutdatedCaches();

// Generate list using scripts/locale.js
// TODO: update this
// prettier-ignore
const locale_keys = ["af","am","ar-dz","ar-kw","ar-ly","ar-ma","ar-sa","ar-tn","ar","az","be","bg","bi","bm","bn","bo","br","bs","ca","cs","cv","cy","da","de-at","de-ch","de","dv","el","en-au","en-ca","en-gb","en-ie","en-il","en-in","en-nz","en-sg","en-tt","en","eo","es-do","es-pr","es-us","es","et","eu","fa","fi","fo","fr-ca","fr-ch","fr","fy","ga","gd","gl","gom-latn","gu","he","hi","hr","ht","hu","hy-am","id","is","it-ch","it","ja","jv","ka","kk","km","kn","ko","ku","ky","lb","lo","lt","lv","me","mi","mk","ml","mn","mr","ms-my","ms","mt","my","nb","ne","nl-be","nl","nn","oc-lnc","pa-in","pl","pt-br","pt","ro","ru","rw","sd","se","si","sk","sl","sq","sr-cyrl","sr","ss","sv-fi","sv","sw","ta","te","tet","tg","th","tk","tl-ph","tlh","tr","tzl","tzm-latn","tzm","ug-cn","uk","ur","uz-latn","uz","vi","x-pseudo","yo","zh-cn","zh-hk","zh-tw","zh","ang","ar","az","be","bg","bn","bottom","br","ca","ca@valencia","ckb","contributors","cs","cy","da","de","de-CH","el","en","en-US","enchantment","enm","eo","es","et","eu","fa","fi","fil","fr","frm","ga","got","he","hi","hr","hu","id","it","ja","kmr","ko","la","lb","leet","li","lt","lv","mk","ml","ms","mt","nb-NO","nl","owo","peo","piglatin","pl","pr","pt_BR","pt_PT","ro","ro_MD","ru","si","sk","sl","sq","sr","sv","ta","te","th","tlh-qaak","tokipona","tr","uk","vec","vi","zh-Hans","zh-Hant"];

precacheAndRoute(
  self.__WB_MANIFEST.filter((entry) => {
    try {
      const url = typeof entry === "string" ? entry : entry.url;
      if (url.includes("-legacy")) return false;

      const fn = url.split("/").pop();
      if (fn) {
        if (fn.endsWith("css") && !isNaN(parseInt(fn.substring(0, 3)))) {
          return false;
        }

        for (const key of locale_keys) {
          if (fn.startsWith(`${key}.`)) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }),
);

// STELLIS: offline fallback. If a navigation request fails (no network,
// upstream completely dead) serve the standalone branded page instead of
// the browser's default "no connection" screen. The HTML is precached
// because it lives in /public so it's picked up by the manifest.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cache = await caches.open("workbox-precache-v2-https://stellis.ru/");
        const cached =
          (await cache.match("/stellis-fallback.html")) ||
          (await caches.match("/stellis-fallback.html"));
        return (
          cached ||
          new Response(
            "Offline — открой stellis.ru/stellis-fallback.html",
            { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
          )
        );
      }
    })(),
  );
});

import { createSignal } from "solid-js";

import { registerSW } from "virtual:pwa-register";

const [pendingUpdate, setPendingUpdate] = createSignal<() => void>();

export { pendingUpdate };

/**
 * STELLIS: when a new service worker is ready, drop a tiny update banner so
 * the user can pull the new build with one tap. Without this they'd be stuck
 * on the old in-memory bundle until manual reload — and stale Stoat sessions
 * on iOS can drag on for days. Plain DOM construction (no innerHTML) — banner
 * content is static, but we still avoid the XSS-shaped pattern.
 */
function showStellisUpdateBanner(reload: () => void) {
  if (typeof document === "undefined") return;
  if (document.getElementById("stellis-update-banner")) return;

  const banner = document.createElement("div");
  banner.id = "stellis-update-banner";
  banner.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "transform:translateX(-50%)",
    "background:#11141C",
    "color:#F4F1E8",
    "border:1px solid #E5A857",
    "border-radius:12px",
    "padding:12px 16px",
    "font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "z-index:9999",
    "box-shadow:0 8px 28px rgba(0,0,0,0.45)",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "max-width:90vw",
  ].join(";");

  const msg = document.createElement("span");
  msg.textContent = "Доступна новая версия Stellis";

  const now = document.createElement("button");
  now.textContent = "Обновить";
  now.style.cssText =
    "background:#E5A857;color:#11141C;border:0;padding:6px 12px;border-radius:8px;font-weight:600;cursor:pointer";
  now.addEventListener("click", () => reload());

  const later = document.createElement("button");
  later.textContent = "позже";
  later.style.cssText =
    "background:transparent;color:#A8A399;border:0;padding:6px 8px;cursor:pointer";
  later.addEventListener("click", () => banner.remove());

  banner.append(msg, now, later);
  document.body.appendChild(banner);
}

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      const reload = () => void updateSW(true);
      setPendingUpdate(() => reload);
      showStellisUpdateBanner(reload);
    },
    onOfflineReady() {
      console.info("Ready to work offline =)");
    },
    onRegistered(r) {
      // STELLIS: poll every 15 min (was 1 hour) — small tribe deploys often,
      // worth catching fresh builds faster.
      setInterval(() => r!.update(), 15 * 60 * 1000);
    },
  });

}

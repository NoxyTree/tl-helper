// Guest-first account menu, mounted into the shared app header on every page.
//
// Import once per page: <script type="module" src="./tl-account-menu.js"></script>
//
// When Supabase is unconfigured (or its library can't load), this renders
// NOTHING — the app stays fully usable in guest mode. When configured, it shows
// a "Sign in" control (Discord / Google) or, once signed in, the account chip
// with a "Sign out" action. It never gates any feature; syncing is layered on
// separately.
import { getSupabaseClient, onAuthChange, isAvailable } from "./tl-supabase.js";

const STYLE = `
.tl-account { position: relative; margin-left: 12px; font-family: 'Instrument Sans', system-ui, sans-serif; }
.tl-account-trigger {
  display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px 0 11px;
  border: 1px solid rgba(212,166,94,.4); border-radius: 999px; background: rgba(212,166,94,.07);
  color: #e6d3a6; font: 700 10px/1 'Instrument Sans', sans-serif; letter-spacing: .12em; text-transform: uppercase;
  cursor: pointer; white-space: nowrap; transition: border-color .15s ease, background .15s ease, color .15s ease;
}
.tl-account-trigger:hover, .tl-account-trigger:focus-visible {
  outline: none; color: #f6d391; border-color: rgba(242,199,119,.7); background: rgba(242,199,119,.12);
}
.tl-account-trigger .tl-account-ico { width: 15px; height: 15px; flex: none; }
.tl-account-avatar {
  width: 24px; height: 24px; flex: none; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
  background: linear-gradient(135deg,#c98b39,#8a5a1f); color: #150f07; font: 700 11px/1 Marcellus, serif; text-transform: uppercase;
  box-shadow: inset 0 0 0 1px rgba(246,211,145,.35);
}
.tl-account-avatar img { width: 100%; height: 100%; object-fit: cover; }
.tl-account-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; text-transform: none; letter-spacing: .02em; font-weight: 600; font-size: 11px; }
.tl-account-caret { width: 9px; height: 9px; opacity: .6; transition: transform .18s ease; }
.tl-account[data-open="true"] .tl-account-caret { transform: rotate(180deg); }

.tl-account-popover {
  position: absolute; top: calc(100% + 9px); right: 0; z-index: 1200; width: min(264px, calc(100vw - 28px)); padding: 14px;
  border: 1px solid var(--tl-shell-line-strong, rgba(242,199,119,.4)); border-radius: 13px;
  background: linear-gradient(180deg, rgba(28,21,13,.99), rgba(11,8,5,.995));
  box-shadow: 0 20px 48px rgba(0,0,0,.55), inset 0 1px 0 rgba(246,211,145,.06);
  transform-origin: top right; animation: tl-account-in .16s ease; color: #cdbb98;
}
.tl-account-popover::before {
  content: ""; position: absolute; top: -5px; right: 20px; width: 9px; height: 9px; transform: rotate(45deg);
  background: rgba(28,21,13,.99); border-left: 1px solid var(--tl-shell-line-strong, rgba(242,199,119,.4)); border-top: 1px solid var(--tl-shell-line-strong, rgba(242,199,119,.4));
}
/* Below 620px the shell drops the header-end to the left edge, so a right-anchored
   popover would clip off-screen — anchor it left there instead. */
@media (max-width: 620px) {
  .tl-account-popover { right: auto; left: 0; transform-origin: top left; }
  .tl-account-popover::before { right: auto; left: 20px; }
}
@keyframes tl-account-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tl-account-popover { animation: none; } }

.tl-account-kicker { color: #8b7a5d; font-size: 9px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
.tl-account-title { margin: 4px 0 0; color: #f6d391; font: 400 18px/1.15 Marcellus, serif; }
.tl-account-sub { margin: 5px 0 12px; color: #9c8d70; font-size: 11px; line-height: 1.5; }

.tl-provider-btn {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 42px; margin-top: 8px; padding: 0 14px;
  border: 1px solid transparent; border-radius: 10px; cursor: pointer; font: 600 12.5px 'Instrument Sans', sans-serif;
  transition: filter .14s ease, transform .05s ease;
}
.tl-provider-btn:active { transform: translateY(1px); }
.tl-provider-btn:focus-visible { outline: 2px solid #f6d391; outline-offset: 2px; }
.tl-provider-btn .tl-provider-ico { width: 18px; height: 18px; flex: none; }
.tl-provider-discord { background: #5865f2; color: #fff; }
.tl-provider-discord:hover { filter: brightness(1.08); }
.tl-provider-google { background: #fff; color: #1f1f1f; }
.tl-provider-google:hover { filter: brightness(.96); }

.tl-account-note { margin: 12px 0 0; padding-top: 11px; border-top: 1px solid rgba(212,166,94,.16); color: #857759; font-size: 10px; line-height: 1.5; }

.tl-account-id { display: flex; align-items: center; gap: 11px; padding-bottom: 12px; border-bottom: 1px solid rgba(212,166,94,.16); }
.tl-account-id .tl-account-avatar { width: 40px; height: 40px; font-size: 17px; }
.tl-account-id-copy { min-width: 0; }
.tl-account-id-name { color: #f2e4c4; font: 600 13px 'Instrument Sans', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-account-id-mail { color: #9c8d70; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-account-synced { display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; color: var(--tl-shell-good, #7ee0a6); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.tl-account-synced::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--tl-shell-good, #7ee0a6); box-shadow: 0 0 7px rgba(126,224,166,.7); }
.tl-signout-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 40px; margin-top: 12px;
  border: 1px solid rgba(212,166,94,.4); border-radius: 10px; background: rgba(28,21,13,.7); color: #e6d6b4;
  cursor: pointer; font: 600 12px 'Instrument Sans', sans-serif; transition: border-color .14s ease, color .14s ease;
}
.tl-signout-btn:hover, .tl-signout-btn:focus-visible { outline: none; border-color: rgba(242,199,119,.7); color: #f6d391; }
.tl-account-busy { opacity: .6; pointer-events: none; }
`;

const DISCORD_ICO = `<svg class="tl-provider-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.211.375-.454.88-.622 1.28a18.27 18.27 0 0 0-5.53 0A12.4 12.4 0 0 0 9.1 3a19.7 19.7 0 0 0-4.435 1.37C1.86 8.58 1.09 12.68 1.47 16.72a19.9 19.9 0 0 0 6.07 3.06c.49-.67.926-1.38 1.3-2.13-.714-.27-1.4-.6-2.05-.99.172-.126.34-.257.5-.39a14.2 14.2 0 0 0 12.42 0c.163.14.33.27.5.39-.65.39-1.34.72-2.05.99.375.75.81 1.46 1.3 2.13a19.85 19.85 0 0 0 6.07-3.06c.44-4.68-.76-8.74-3.19-12.35ZM8.02 14.33c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.94 2.42-2.16 2.42Z"/></svg>`;
const GOOGLE_ICO = `<svg class="tl-provider-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.47h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.74Z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"/></svg>`;
const SIGNIN_ICO = `<svg class="tl-account-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`;
const CARET_ICO = `<svg class="tl-account-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
const SIGNOUT_ICO = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>`;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function displayName(user) {
  const meta = user?.user_metadata ?? {};
  return meta.full_name || meta.name || meta.user_name || meta.preferred_username || (user?.email ? user.email.split("@")[0] : "Adventurer");
}
function avatarMarkup(user) {
  const url = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  if (url) return `<span class="tl-account-avatar"><img src="${esc(url)}" alt="" referrerpolicy="no-referrer"></span>`;
  return `<span class="tl-account-avatar">${esc(displayName(user).trim().charAt(0) || "A")}</span>`;
}

let controller = null;

function findHost() {
  // Prefer an explicit slot (pages with a busy header-end, e.g. the Armory
  // toolbar, place one elsewhere so the account chip has a stable home).
  return document.querySelector("[data-tl-account-slot]") || document.querySelector(".tl-app-header-end") || document.querySelector(".tl-app-header");
}

function ensureStyle() {
  if (document.getElementById("tl-account-style")) return;
  const style = document.createElement("style");
  style.id = "tl-account-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

// Builds the account control once (element, handlers, and the single auth
// subscription). The element is (re)attached to the header by attach().
function createController() {
  const root = document.createElement("div");
  root.className = "tl-account";
  root.setAttribute("data-tl-account", "");

  let currentUser = null;
  let open = false;

  const closePopover = () => {
    if (!open) return;
    open = false;
    root.setAttribute("data-open", "false");
    root.querySelector(".tl-account-trigger")?.setAttribute("aria-expanded", "false");
    root.querySelector(".tl-account-popover")?.remove();
  };

  const openPopover = () => {
    if (open) return;
    open = true;
    root.setAttribute("data-open", "true");
    const trigger = root.querySelector(".tl-account-trigger");
    trigger?.setAttribute("aria-expanded", "true");
    const pop = document.createElement("div");
    pop.className = "tl-account-popover";
    pop.setAttribute("role", "menu");
    pop.innerHTML = currentUser ? signedInPopover(currentUser) : guestPopover();
    root.appendChild(pop);
    wirePopover(pop);
    pop.querySelector("button")?.focus();
  };

  const renderTrigger = () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "tl-account-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    if (currentUser) {
      trigger.setAttribute("aria-label", `Account: ${displayName(currentUser)}`);
      trigger.innerHTML = `${avatarMarkup(currentUser)}<span class="tl-account-name">${esc(displayName(currentUser))}</span>${CARET_ICO}`;
    } else {
      trigger.setAttribute("aria-label", "Sign in");
      trigger.innerHTML = `${SIGNIN_ICO}<span>Sign in</span>${CARET_ICO}`;
    }
    trigger.addEventListener("click", (event) => { event.stopPropagation(); open ? closePopover() : openPopover(); });
    return trigger;
  };

  const render = () => {
    closePopover();
    root.innerHTML = "";
    root.appendChild(renderTrigger());
  };

  const guestPopover = () => `
    <div class="tl-account-kicker">Account</div>
    <h3 class="tl-account-title">Sync your builds</h3>
    <p class="tl-account-sub">Sign in to save builds and achievements to your account and keep them across devices.</p>
    <button type="button" class="tl-provider-btn tl-provider-discord" data-provider="discord" role="menuitem">${DISCORD_ICO}<span>Continue with Discord</span></button>
    <button type="button" class="tl-provider-btn tl-provider-google" data-provider="google" role="menuitem">${GOOGLE_ICO}<span>Continue with Google</span></button>
    <p class="tl-account-note">Guest mode keeps everything on this device. Signing in never overwrites your local builds — they merge.</p>`;

  const signedInPopover = (user) => `
    <div class="tl-account-id">
      ${avatarMarkup(user)}
      <div class="tl-account-id-copy">
        <div class="tl-account-id-name">${esc(displayName(user))}</div>
        ${user.email ? `<div class="tl-account-id-mail">${esc(user.email)}</div>` : ""}
        <div class="tl-account-synced">Synced</div>
      </div>
    </div>
    <button type="button" class="tl-signout-btn" data-action="signout" role="menuitem">${SIGNOUT_ICO}<span>Sign out</span></button>`;

  const wirePopover = (pop) => {
    pop.querySelectorAll("[data-provider]").forEach((button) => button.addEventListener("click", async () => {
      pop.classList.add("tl-account-busy");
      const client = await getSupabaseClient();
      if (!client) { pop.classList.remove("tl-account-busy"); return; }
      try {
        await client.auth.signInWithOAuth({
          provider: button.dataset.provider,
          options: { redirectTo: location.origin + location.pathname },
        });
        // Browser redirects to the provider; nothing else runs here on success.
      } catch (error) {
        console.warn("Sign-in failed.", error);
        pop.classList.remove("tl-account-busy");
      }
    }));
    pop.querySelector('[data-action="signout"]')?.addEventListener("click", async () => {
      pop.classList.add("tl-account-busy");
      const client = await getSupabaseClient();
      try { await client?.auth.signOut(); } catch (error) { console.warn("Sign-out failed.", error); }
      closePopover();
    });
  };

  document.addEventListener("click", (event) => { if (open && !root.contains(event.target)) closePopover(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePopover(); });

  render();
  onAuthChange((session) => { currentUser = session?.user ?? null; render(); });
  return { root };
}

// (Re)attach the control to the current header host. Idempotent: no-op when
// already connected. Returns false while no host exists yet.
function attach() {
  if (controller?.root?.isConnected) return true;
  const host = findHost();
  if (!host) return false;
  ensureStyle();
  if (!controller) controller = createController();
  host.appendChild(controller.root);
  return true;
}

async function init() {
  // Guest-only when Supabase isn't configured or its library can't load: render
  // nothing rather than a dead sign-in control.
  if (!(await isAvailable())) return;
  const start = () => {
    attach();
    // These pages render their header client-side (and re-render it), so the
    // host may appear after this runs or be replaced later. Keep the chip
    // present by re-attaching whenever it becomes detached.
    new MutationObserver(() => { if (!controller?.root?.isConnected) attach(); })
      .observe(document.body, { childList: true, subtree: true });
    // Merge local ↔ cloud once signed in. Lazy-imported so guest pages never load it.
    import("./tl-sync.js").then((sync) => sync.installSync()).catch(() => {});
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

init();

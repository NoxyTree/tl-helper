// Subtle "Say thanks" footer link, mounted at the end of the page on every
// page that includes it:
//   <script type="module" src="./tl-support-link.js"></script>
//
// While SUPPORT_URL is empty this renders NOTHING — the footer only appears
// once the real Ko-fi link is configured, so no placeholder ever ships.
export const SUPPORT_URL = "";
export const SUPPORT_LABEL = "Enjoying TL Helper? Say thanks on Ko-fi";

const STYLE = `
.tl-support-footer {
  margin: 34px auto 22px; padding: 0 16px; text-align: center;
  font-family: 'Instrument Sans', system-ui, sans-serif;
}
.tl-support-footer a {
  display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px;
  border: 1px solid rgba(212,166,94,.28); border-radius: 999px; background: rgba(212,166,94,.05);
  color: #b9a67f; font: 600 11px/1 'Instrument Sans', sans-serif; letter-spacing: .08em;
  text-decoration: none; transition: border-color .15s ease, color .15s ease, background .15s ease;
}
.tl-support-footer a:hover, .tl-support-footer a:focus-visible {
  outline: none; color: #f6d391; border-color: rgba(242,199,119,.6); background: rgba(242,199,119,.09);
}
.tl-support-footer .tl-support-cup { font-size: 13px; line-height: 1; }
`;

export function mountSupportLink({ url = SUPPORT_URL, label = SUPPORT_LABEL, target = document.body } = {}) {
  if (!url || !target || target.querySelector(".tl-support-footer")) return null;
  if (!document.getElementById("tl-support-style")) {
    const style = document.createElement("style");
    style.id = "tl-support-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const footer = document.createElement("footer");
  footer.className = "tl-support-footer";
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const cup = document.createElement("span");
  cup.className = "tl-support-cup";
  cup.setAttribute("aria-hidden", "true");
  cup.textContent = "☕";
  link.append(cup, document.createTextNode(label));
  footer.appendChild(link);
  target.appendChild(footer);
  return footer;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountSupportLink());
  else mountSupportLink();
}

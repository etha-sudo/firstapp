(() => {
  const COOKIE_NAME = "attribution_slug";
  const COOKIE_DAYS = 30;

  function getCookie(name) {
    const prefix = `${name}=`;
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (const part of parts) {
      const c = part.trim();
      if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
    }
    return null;
  }

  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = [
      `${name}=${encodeURIComponent(value)}`,
      `Expires=${expires}`,
      "Path=/",
      "SameSite=Lax",
    ].join("; ");
  }

  function readRefFromUrl() {
    const ref = new URL(window.location.href).searchParams.get("ref");
    return ref && ref.trim() ? ref.trim() : null;
  }

  function setAttributionFromUrl() {
    const ref = readRefFromUrl();
    if (ref) setCookie(COOKIE_NAME, ref, COOKIE_DAYS);
    return ref;
  }

  async function postConversion(slug) {
    console.log("[attribution] sending conversion", { slug });
    const res = await fetch("https://web-production-bdc8.up.railway.app/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    });
    if (!res.ok) {
      // Best-effort: don't crash the host page if the tracker is unavailable.
      return;
    }
  }

  function onCalendlyPopupMessage(event) {
    const origin = String(event.origin || "");
    if (!origin.includes("calendly.com")) return;

    const data = event.data;
    if (!data || typeof data !== "object") return;

    const calendlyEvent = data.event;
    if (calendlyEvent !== "calendly.event_scheduled") return;

    console.log("[attribution] calendly.event_scheduled fired (popup message)");
    const slug = getCookie(COOKIE_NAME);
    if (!slug) return;
    void postConversion(slug);
  }

  function init() {
    // 1) Capture `ref` into cookie on load (30 days).
    // 2) If no `ref`, keep existing cookie (do nothing).
    setAttributionFromUrl();

    // Listen for Calendly popup widget booking events via postMessage.
    window.addEventListener("message", onCalendlyPopupMessage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();


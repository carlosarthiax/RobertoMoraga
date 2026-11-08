(() => {
  const html = document.documentElement;
  const body = document.body;
  const GTM_CONTAINER_ID = "GTM-WPTSNJSX";
  const privatePathPrefixes = [
    "/backoffice",
    "/panel-roberto-moraga-4f7d2c",
    "/portal-inversores",
  ];
  const privateBodyClasses = new Set(["backoffice-page", "investor-page"]);
  const pageLanguage = html.lang?.toLowerCase().startsWith("en") ? "en" : "es";
  const manualMode = String(body?.dataset?.robertoMoragaAnalytics || html.dataset?.robertoMoragaAnalytics || "")
    .trim()
    .toLowerCase() === "manual";
  // Keep this conservative: only obvious automation should be excluded.
  const botUserAgentPattern =
    /(?:\b(bot|crawler|spider)\b|headlesschrome|chrome-lighthouse|lighthouse|phantomjs|selenium|playwright|puppeteer|googlebot|adsbot-google|mediapartners-google|bingpreview|facebookexternalhit|duckduckbot|baiduspider|yandexbot|semrushbot|ahrefsbot|mj12bot|dotbot|applebot|ia_archiver|slurp|curl|wget|python-requests|scrapy)/i;
  const botGlobalFlags = ["_phantom", "callPhantom", "__nightmare", "domAutomation", "domAutomationController"];
  const seenEvents = new Set();
  const seenScrollThresholds = new Set();
  const seenForms = new WeakSet();
  const scrollThresholds = [25, 50, 75, 90];

  let scrollTicking = false;
  let gtmBootstrapped = false;

  function isLikelyBotEnvironment() {
    if (navigator.webdriver) {
      return true;
    }

    if (botGlobalFlags.some((key) => Boolean(window[key]))) {
      return true;
    }

    return botUserAgentPattern.test(String(navigator.userAgent || ""));
  }

  const botTrafficDetected = isLikelyBotEnvironment();

  function shouldLoadGtm(pathname = window.location.pathname) {
    if (botTrafficDetected) {
      return false;
    }

    const path = String(pathname || "").toLowerCase();
    if (privatePathPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return false;
    }

    return !Array.from(privateBodyClasses).some((className) => body?.classList?.contains(className));
  }

  function bootstrapGtm() {
    if (gtmBootstrapped || !GTM_CONTAINER_ID || !shouldLoadGtm()) {
      return;
    }

    if (window.google_tag_manager?.[GTM_CONTAINER_ID]) {
      gtmBootstrapped = true;
      return;
    }

    gtmBootstrapped = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      "gtm.start": Date.now(),
      event: "gtm.js",
    });

    const gtmScript = document.createElement("script");
    gtmScript.async = true;
    gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_CONTAINER_ID)}&l=dataLayer`;

    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(gtmScript, firstScript);
      return;
    }

    (document.head || document.documentElement).appendChild(gtmScript);
  }

  const CONSENT_KEY = "roberto_moraga_cookie_consent_v1";
  const META_PIXEL_ID = "1699340588420053";
  let consent = { analytics: false, marketing: false };

  function readConsent() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
      if (saved && saved.version === 1) {
        consent.analytics = saved.analytics === true;
        consent.marketing = saved.marketing === true;
      }
    } catch (_) {}
  }

  function loadMetaPixel() {
    if (!consent.marketing || window.fbq || !shouldLoadGtm()) return;
    (function(f,b,e,v,n,t,s) {
      if (f.fbq) return;
      n = f.fbq = function() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }

  function saveConsent(analytics, marketing) {
    consent = { analytics: analytics === true, marketing: marketing === true };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        version: 1, analytics: consent.analytics, marketing: consent.marketing,
        savedAt: new Date().toISOString()
      }));
    } catch (_) {}
    if (consent.analytics) bootstrapGtm();
    loadMetaPixel();
    document.getElementById("rm-cookie-banner")?.remove();
    showCookieSettingsButton();
  }

  function showCookieSettingsButton() {
    if (document.getElementById("rm-cookie-settings")) return;
    const button = document.createElement("button");
    button.id = "rm-cookie-settings";
    button.type = "button";
    button.textContent = "Cookies";
    button.setAttribute("aria-label", pageLanguage === "en" ? "Open cookie settings" : "Abrir configuración de cookies");
    button.addEventListener("click", () => renderConsentBanner(true));
    document.body.appendChild(button);
  }

  function renderConsentBanner(openPreferences = false) {
    if (document.getElementById("rm-cookie-banner")) return;
    const en = pageLanguage === "en";
    const banner = document.createElement("section");
    banner.id = "rm-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", en ? "Cookie preferences" : "Preferencias de cookies");
    banner.innerHTML = `
      <div class="rm-cookie-copy">
        <strong>${en ? "Your privacy matters" : "Tu privacidad importa"}</strong>
        <p>${en
          ? "We use necessary technologies for this site to work. With your permission, Google Tag Manager measures visits and Meta Pixel supports marketing measurement."
          : "Usamos tecnologías necesarias para que esta web funcione. Si nos das permiso, Google Tag Manager mide las visitas y Meta Pixel permite medir campañas de marketing."}</p>
        <a href="/cookies/">${en ? "Cookie policy" : "Política de cookies"}</a>
      </div>
      <div class="rm-cookie-actions">
        <button type="button" class="rm-cookie-primary" data-rm-accept>${en ? "Recommended settings" : "Configuración recomendada"}</button>
        <button type="button" class="rm-cookie-reject" data-rm-reject>${en ? "Reject" : "Rechazar"}</button>
        <button type="button" class="rm-cookie-custom" data-rm-custom>${en ? "Customize" : "Personalizar"}</button>
      </div>
      <div class="rm-cookie-preferences" ${openPreferences ? "" : "hidden"}>
        <label><input type="checkbox" checked disabled> ${en ? "Necessary (always active)" : "Necesarias (siempre activas)"}</label>
        <label><input type="checkbox" data-rm-analytics ${consent.analytics ? "checked" : ""}> ${en ? "Measurement – Google Tag Manager" : "Medición – Google Tag Manager"}</label>
        <label><input type="checkbox" data-rm-marketing ${consent.marketing ? "checked" : ""}> ${en ? "Marketing – Meta Pixel" : "Marketing – Meta Pixel"}</label>
        <button type="button" class="rm-cookie-save" data-rm-save>${en ? "Save my choice" : "Guardar mi elección"}</button>
      </div>`;
    const style = document.createElement("style");
    style.textContent = `
      #rm-cookie-banner{position:fixed;z-index:99999;left:20px;right:20px;bottom:20px;max-width:760px;margin:auto;background:#fff;color:#26352f;padding:20px 22px;border:1px solid rgba(36,76,62,.18);border-radius:12px;box-shadow:0 12px 45px rgba(0,0,0,.2);font:14px/1.5 system-ui,sans-serif;display:flex;gap:22px;align-items:center;justify-content:space-between}
      #rm-cookie-banner p{margin:5px 0 7px}#rm-cookie-banner a{color:#315b49;text-decoration:underline}
      .rm-cookie-actions{display:flex;flex-direction:column;align-items:stretch;gap:7px;min-width:190px}
      #rm-cookie-banner button{font:inherit;cursor:pointer;border:0;border-radius:7px;padding:10px 13px}
      #rm-cookie-banner .rm-cookie-primary{background:#244c3e;color:#fff;font-weight:700}
      #rm-cookie-banner .rm-cookie-reject{background:transparent;color:#777;font-size:12px;font-weight:700;padding:2px}
      #rm-cookie-banner .rm-cookie-custom{background:transparent;color:#315b49;text-decoration:underline;font-size:12px;padding:2px}
      .rm-cookie-preferences{flex-basis:100%;display:grid;gap:9px;padding-top:12px;border-top:1px solid #e6e9e7}
      .rm-cookie-preferences[hidden]{display:none}
      .rm-cookie-preferences label{display:flex;gap:8px;align-items:center}
      .rm-cookie-preferences input{accent-color:#244c3e}
      .rm-cookie-preferences .rm-cookie-save{background:#244c3e;color:#fff;justify-self:start;font-weight:700}
      #rm-cookie-settings{position:fixed;z-index:99998;left:14px;bottom:14px;background:#244c3e;color:#fff;border:0;border-radius:20px;padding:7px 12px;font:12px system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 12px #0003}
      @media(max-width:640px){#rm-cookie-banner{left:10px;right:10px;bottom:10px;padding:16px;display:block;max-height:85vh;overflow:auto}.rm-cookie-actions{margin-top:12px;min-width:0}.rm-cookie-primary{width:100%}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);
    banner.querySelector("[data-rm-accept]").addEventListener("click", () => saveConsent(true, true));
    banner.querySelector("[data-rm-reject]").addEventListener("click", () => saveConsent(false, false));
    banner.querySelector("[data-rm-custom]").addEventListener("click", () => {
      banner.querySelector(".rm-cookie-preferences").hidden = false;
    });
    banner.querySelector("[data-rm-save]").addEventListener("click", () => saveConsent(
      banner.querySelector("[data-rm-analytics]").checked,
      banner.querySelector("[data-rm-marketing]").checked
    ));
  }

  function initConsent() {
    readConsent();
    if (consent.analytics) bootstrapGtm();
    if (consent.marketing) loadMetaPixel();
    if (!localStorage.getItem(CONSENT_KEY)) renderConsentBanner();
    else showCookieSettingsButton();
  }

  function text(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pageType() {
    return body?.dataset?.pageType || html.dataset?.pageType || body?.className || "";
  }

  function sectionHeading(element) {
    const heading = element?.querySelector?.(".eyebrow, h1, h2, h3, legend");
    return text(heading?.textContent || "");
  }

  function sectionName(element) {
    return (
      element?.dataset?.analyticsSection ||
      element?.dataset?.trackSection ||
      element?.id ||
      sectionHeading(element) ||
      element?.tagName?.toLowerCase() ||
      "section"
    );
  }

  function sectionOf(element) {
    const section = element?.closest?.(
      "section, article, aside, header, footer, main, [data-analytics-section], [data-track-section]",
    );
    return section || null;
  }

  function clickLabel(element) {
    return text(
      element?.getAttribute?.("aria-label") ||
        element?.getAttribute?.("title") ||
        element?.dataset?.analyticsLabel ||
        element?.dataset?.profileLink ||
        element?.textContent,
    );
  }

  function clickHref(element) {
    if (!element || element.tagName !== "A") {
      return "";
    }
    return String(element.getAttribute("href") || "");
  }

  function isWhatsAppElement(element, href) {
    return (
      element.classList.contains("whatsapp-button") ||
      element.classList.contains("floating-whatsapp") ||
      (href && href.includes("wa.me"))
    );
  }

  function isNavigationElement(element) {
    return Boolean(
      element.closest(".top-nav") ||
        element.closest("nav[aria-label]") ||
        element.closest("nav") ||
        element.closest(".language-toggle"),
    );
  }

  function isHeroElement(element) {
    return Boolean(
      element.closest(".hero") ||
        element.closest(".page-hero") ||
        element.closest(".investor-gate") ||
        element.closest(".backoffice-login-view"),
    );
  }

  function isProjectElement(element) {
    return Boolean(element.closest(".project-card, .case-cover, .page-card"));
  }

  function inferClickType(element, href) {
    if (isWhatsAppElement(element, href)) {
      return "whatsapp_button";
    }
    if (element.closest(".language-toggle")) {
      return "language_toggle";
    }
    if (element.closest(".top-nav")) {
      return "header_nav";
    }
    if (element.closest("nav")) {
      return "navigation";
    }
    if (element.classList.contains("profile-card")) {
      return "route_card";
    }
    if (element.classList.contains("case-cover") || element.classList.contains("project-card")) {
      return "project_card";
    }
    if (element.matches("input[type='submit'], button[type='submit']")) {
      return "submit_button";
    }
    if (element.matches("button, input[type='button'], [role='button']")) {
      return "button";
    }
    if (element.tagName === "A") {
      return "link";
    }
    return "click";
  }

  function push(eventName, params = {}) {
    if (botTrafficDetected || !consent.analytics) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      page_path: window.location.pathname,
      page_location: window.location.href,
      page_title: document.title,
      page_language: pageLanguage,
      page_type: pageType(),
      page_referrer: document.referrer || "",
      body_class: body?.className || "",
      ...params,
    });
  }

  function pushOnce(eventName, key, params = {}) {
    const eventKey = `${eventName}:${key}`;
    if (seenEvents.has(eventKey)) {
      return;
    }

    seenEvents.add(eventKey);
    push(eventName, params);
  }

  function pushWhatsAppClick(params = {}) {
    push("roberto_moraga_whatsapp_click", params);
    push("whatsapp_click", params);
  }

  function trackPageView() {
    pushOnce("roberto_moraga_page_view", `page:${window.location.pathname}${window.location.search}`, {
      page_hash: window.location.hash || "",
      page_body_id: body?.id || "",
      page_template: body?.dataset?.pageTemplate || "",
    });
  }

  function trackSectionView(element) {
    const name = sectionName(element);
    pushOnce("roberto_moraga_section_view", name, {
      section_name: name,
      section_id: element.id || "",
      section_label: sectionHeading(element),
      section_class: element.className || "",
    });
  }

  function trackScrollDepth() {
    const doc = document.documentElement;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const pageHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    const maxScrollable = Math.max(pageHeight - viewport, 1);
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const percent = Math.min(100, Math.max(0, Math.round((scrollTop / maxScrollable) * 100)));

    scrollThresholds.forEach((threshold) => {
      if (percent >= threshold && !seenScrollThresholds.has(threshold)) {
        seenScrollThresholds.add(threshold);
        push("roberto_moraga_scroll_depth", {
          scroll_percent: threshold,
        });
      }
    });
  }

  function scheduleScrollTracking() {
    if (scrollTicking || manualMode) {
      return;
    }

    scrollTicking = true;
    window.requestAnimationFrame(() => {
      trackScrollDepth();
      scrollTicking = false;
    });
  }

  function trackClick(element) {
    const href = clickHref(element);
    const clickId = element?.dataset?.analyticsId || element?.id || "";
    const label = clickLabel(element);
    const section = sectionOf(element);
    const sectionId = section?.id || "";
    const withinHero = isHeroElement(element);
    const isWhatsApp = isWhatsAppElement(element, href);
    const isProfileCard = element.classList.contains("profile-card");
    const isProject = isProjectElement(element);

    push("roberto_moraga_click", {
      click_type: inferClickType(element, href),
      click_text: label.slice(0, 120),
      click_id: clickId,
      click_class: element.className || "",
      click_href: href,
      click_section: sectionId,
      click_role: element.getAttribute("role") || "",
      click_target: element.getAttribute("target") || "",
    });

    if (isWhatsApp) {
      const whatsappLocation = element.classList.contains("floating-whatsapp")
        ? "floating"
        : withinHero
          ? "hero"
          : sectionId || "page";

      pushWhatsAppClick({
        click_type: "whatsapp_button",
        click_text: label.slice(0, 120),
        click_href: href,
        click_section: sectionId,
        whatsapp_location: whatsappLocation,
        click_id: clickId,
      });
    }

    if (withinHero && (isWhatsApp || element.matches("a, button, [role='button'], input[type='submit']"))) {
      push("roberto_moraga_hero_cta_click", {
        click_text: label.slice(0, 120),
        click_href: href,
        click_section: sectionId,
        cta_type: isWhatsApp ? "whatsapp" : element.tagName.toLowerCase(),
        cta_location: sectionId || "hero",
        click_id: clickId,
      });
    }

    if (isNavigationElement(element)) {
      push("roberto_moraga_navigation_intent", {
        click_text: label.slice(0, 120),
        click_href: href,
        click_section: sectionId,
        nav_area: element.closest(".top-nav") ? "top" : "nav",
      });
    }

    if (element.closest(".language-toggle")) {
      push("roberto_moraga_language_switch", {
        click_text: label.slice(0, 120),
        click_href: href,
        click_section: sectionId,
        target_language: href.includes("index-en") ? "en" : "es",
      });
    }

    if (isProfileCard) {
      push("roberto_moraga_route_intent", {
        click_text: label.slice(0, 120),
        click_href: href,
        click_section: sectionId,
        route_key: element.dataset.profileLink || "",
      });
    }

    if (isProject && href) {
      push("roberto_moraga_project_open", {
        click_text: label.slice(0, 120),
        click_href: href,
        click_section: sectionId,
        project_title: label.slice(0, 120),
        project_url: href,
        open_source: element.classList.contains("case-cover") ? "card" : "link",
      });
    }
  }

  function bindClickTracking() {
    document.addEventListener(
      "click",
      (event) => {
        if (manualMode) {
          return;
        }

        const element = event.target?.closest?.(
          "a, button, input[type='submit'], input[type='button'], [role='button'], summary",
        );
        if (!element || element.closest("[data-analytics-ignore]")) {
          return;
        }

        trackClick(element);
      },
      true,
    );
  }

  function bindFormTracking() {
    document.addEventListener(
      "focusin",
      (event) => {
        if (manualMode) {
          return;
        }

        const field = event.target?.closest?.("input, select, textarea");
        const form = field?.form || field?.closest?.("form");
        if (!field || !form || form.closest("[data-analytics-ignore]")) {
          return;
        }

        if (seenForms.has(form)) {
          return;
        }

        seenForms.add(form);
        const formSection = sectionOf(form);
        push("roberto_moraga_form_start", {
          form_id: form.id || "",
          form_name: form.getAttribute("name") || "",
          form_action: form.getAttribute("action") || "",
          form_method: (form.getAttribute("method") || "get").toLowerCase(),
          form_section: formSection?.id || "",
          form_class: form.className || "",
          form_field: field.name || field.id || field.type || "",
        });
      },
      true,
    );

    document.addEventListener(
      "submit",
      (event) => {
        if (manualMode) {
          return;
        }

        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.closest("[data-analytics-ignore]")) {
          return;
        }

        const formSection = sectionOf(form);
        const submitter = event.submitter || null;
        push("roberto_moraga_form_submit", {
          form_id: form.id || "",
          form_name: form.getAttribute("name") || "",
          form_action: form.getAttribute("action") || "",
          form_method: (form.getAttribute("method") || "get").toLowerCase(),
          form_section: formSection?.id || "",
          form_class: form.className || "",
          submitter_text: submitter ? clickLabel(submitter).slice(0, 120) : "",
          submitter_type: submitter ? submitter.getAttribute("type") || submitter.tagName.toLowerCase() : "",
        });
      },
      true,
    );
  }

  function initSectionTracking() {
    if (manualMode) {
      return;
    }

    const targets = Array.from(
      new Set(
        document.querySelectorAll(
          "main > section, main > article, main > aside, section[id], article[id], [data-analytics-section], [data-track-section]",
        ),
      ),
    ).filter((element) => element instanceof Element);

    if (!targets.length) {
      return;
    }

    const immediateTargets = targets.filter((element) => element.matches("main > section, main > article, [data-analytics-section]"));
    immediateTargets.slice(0, 1).forEach(trackSectionView);

    if (!("IntersectionObserver" in window)) {
      targets.forEach(trackSectionView);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          observer.unobserve(entry.target);
          trackSectionView(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.25,
      },
    );

    targets.forEach((element) => observer.observe(element));
  }

  function init() {
    window.robertoMoragaAnalytics = botTrafficDetected
      ? {
          push() {},
          pushOnce() {},
          trackClick() {},
          trackPageView() {},
          trackSectionView() {},
        }
      : {
          push,
          pushOnce,
          trackClick,
          trackPageView,
          trackSectionView,
        };

    if (botTrafficDetected || manualMode) {
      return;
    }

    trackPageView();
    bindClickTracking();
    bindFormTracking();
    initSectionTracking();
    trackScrollDepth();
    window.addEventListener("scroll", scheduleScrollTracking, { passive: true });
    window.addEventListener("resize", scheduleScrollTracking);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { initConsent(); init(); }, { once: true });
  } else {
    initConsent();
    init();
  }
})();

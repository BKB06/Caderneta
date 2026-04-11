(function (global) {
  const THEME_KEY = "caderneta.theme";
  const THEMES = ["dark", "light-azulado", "light", "light-bege"];
  let globalLoadingCount = 0;

  function getThemeIcon(theme) {
    if (theme === "dark") return "🌙";
    if (theme === "light-azulado") return "🧊";
    if (theme === "light") return "☀️";
    if (theme === "light-bege") return "🏖️";
    return "🌙";
  }

  function resolveInitialTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return (saved === "dark" || saved === "light" || saved === "light-azulado" || saved === "light-bege")
      ? saved
      : (preferredDark ? "dark" : "light-azulado");
  }

  function applyTheme(theme, toggleEl) {
    const html = document.documentElement;
    html.classList.remove("light", "dark", "light-azulado", "light-bege");
    html.classList.add(theme);
    localStorage.setItem(THEME_KEY, theme);

    if (!toggleEl) return;
    toggleEl.textContent = getThemeIcon(theme);
    toggleEl.setAttribute("aria-label", `Alterar tema (atual: ${theme})`);
  }

  function getNextTheme(currentTheme) {
    const currentIndex = THEMES.indexOf(currentTheme);
    if (currentIndex < 0) return THEMES[0];
    return THEMES[(currentIndex + 1) % THEMES.length];
  }

  function initThemeToggle(toggleId = "theme-toggle") {
    const toggle = document.getElementById(toggleId);
    const initialTheme = resolveInitialTheme();
    applyTheme(initialTheme, toggle);

    if (!toggle) return;
    toggle.setAttribute("aria-label", `Alterar tema (atual: ${initialTheme})`);
    toggle.addEventListener("click", () => {
      const html = document.documentElement;
      const currentTheme = THEMES.find((themeName) => html.classList.contains(themeName)) || "dark";
      const nextTheme = getNextTheme(currentTheme);
      applyTheme(nextTheme, toggle);
    });
  }

  function initSidebar(menuButtonId = "mobile-menu-btn", sidebarId = "app-sidebar", overlayId = "mobile-overlay") {
    const sidebar = document.getElementById(sidebarId);
    const overlay = document.getElementById(overlayId);
    const button = document.getElementById(menuButtonId);

    if (button && sidebar && overlay) {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", sidebar.id || "app-sidebar");

      button.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show");
        button.setAttribute("aria-expanded", sidebar.classList.contains("open") ? "true" : "false");
      });
      overlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
        button.setAttribute("aria-expanded", "false");
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!sidebar.classList.contains("open")) return;
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
        button.setAttribute("aria-expanded", "false");
      });
    }
  }

  function ensureGlobalUiNodes() {
    if (!document.getElementById("global-api-banner")) {
      const banner = document.createElement("div");
      banner.id = "global-api-banner";
      banner.className = "global-api-banner";
      banner.style.display = "none";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      document.body.appendChild(banner);
    }

    if (!document.getElementById("global-loading-overlay")) {
      const overlay = document.createElement("div");
      overlay.id = "global-loading-overlay";
      overlay.className = "global-loading-overlay";
      overlay.style.display = "none";
      overlay.innerHTML = '<div class="global-loading-box"><span class="global-spinner" aria-hidden="true"></span><span id="global-loading-text">Carregando dados...</span></div>';
      document.body.appendChild(overlay);
    }

    if (!document.getElementById("global-toast")) {
      const toast = document.createElement("div");
      toast.id = "global-toast";
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    if (!document.getElementById("global-confirm-modal")) {
      const modal = document.createElement("div");
      modal.id = "global-confirm-modal";
      modal.className = "modal-overlay";
      modal.style.display = "none";
      modal.innerHTML = [
        '<div class="modal-content" style="max-width:420px;">',
        '  <div class="modal-header">',
        '    <h3 id="global-confirm-title">Confirmar ação</h3>',
        '    <button type="button" class="modal-close" id="global-confirm-close" aria-label="Fechar confirmação">&times;</button>',
        '  </div>',
        '  <div class="modal-body">',
        '    <p id="global-confirm-message" style="margin-bottom:16px;color:var(--text-muted);"></p>',
        '    <div style="display:flex;gap:12px;justify-content:flex-end;">',
        '      <button type="button" class="ghost" id="global-confirm-cancel">Cancelar</button>',
        '      <button type="button" id="global-confirm-ok">Confirmar</button>',
        '    </div>',
        '  </div>',
        '</div>',
      ].join("");
      document.body.appendChild(modal);
    }
  }

  function showGlobalLoading(message = "Carregando dados...") {
    ensureGlobalUiNodes();
    globalLoadingCount += 1;
    const overlay = document.getElementById("global-loading-overlay");
    const text = document.getElementById("global-loading-text");
    if (text) text.textContent = message;
    if (overlay) overlay.style.display = "flex";
  }

  function hideGlobalLoading() {
    globalLoadingCount = Math.max(0, globalLoadingCount - 1);
    if (globalLoadingCount > 0) return;
    const overlay = document.getElementById("global-loading-overlay");
    if (overlay) overlay.style.display = "none";
  }

  function showApiError(message = "Falha ao carregar os dados da API.") {
    ensureGlobalUiNodes();
    const banner = document.getElementById("global-api-banner");
    if (!banner) return;

    banner.textContent = message;
    banner.style.display = "block";
    window.setTimeout(() => {
      if (banner.textContent === message) banner.style.display = "none";
    }, 4500);
  }

  function showToast(message) {
    if (!message) return;
    ensureGlobalUiNodes();
    const toast = document.getElementById("global-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function confirmAction(options = {}) {
    ensureGlobalUiNodes();

    return new Promise((resolve) => {
      const modal = document.getElementById("global-confirm-modal");
      const title = document.getElementById("global-confirm-title");
      const message = document.getElementById("global-confirm-message");
      const okBtn = document.getElementById("global-confirm-ok");
      const cancelBtn = document.getElementById("global-confirm-cancel");
      const closeBtn = document.getElementById("global-confirm-close");

      if (!modal || !okBtn || !cancelBtn || !closeBtn || !title || !message) {
        resolve(window.confirm(options.message || "Tem certeza?"));
        return;
      }

      title.textContent = options.title || "Confirmar ação";
      message.textContent = options.message || "Deseja continuar?";
      okBtn.textContent = options.confirmText || "Confirmar";
      cancelBtn.textContent = options.cancelText || "Cancelar";
      okBtn.classList.toggle("danger-btn", Boolean(options.danger));
      modal.style.display = "flex";

      const cleanup = () => {
        modal.style.display = "none";
        okBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        closeBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onOverlay);
      };

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onOverlay = (event) => {
        if (event.target === modal) onCancel();
      };

      okBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onCancel);
      closeBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onOverlay);
    });
  }

  function initPdfExport() {
    const exportButton = document.getElementById("export-pdf-btn");
    if (!exportButton) return;

    exportButton.addEventListener("click", () => {
      const isMainPage = window.location.pathname.endsWith("/index.html") || window.location.pathname.endsWith("/") || window.location.pathname === "";
      if (isMainPage) {
        const event = new CustomEvent("caderneta:open-pdf-modal");
        window.dispatchEvent(event);
        return;
      }
      window.location.href = "./index.html?openPdf=1";
    });
  }

  function initAccessibilityDefaults() {
    const sidebar = document.getElementById("app-sidebar");
    if (sidebar) sidebar.setAttribute("role", "navigation");

    document.querySelectorAll(".bottom-nav").forEach((nav) => nav.setAttribute("role", "navigation"));
    document.querySelectorAll(".mobile-menu-btn:not([aria-label])").forEach((btn) => btn.setAttribute("aria-label", "Abrir menu"));
    document.querySelectorAll(".theme-toggle:not([aria-label])").forEach((btn) => btn.setAttribute("aria-label", "Alterar tema"));
  }

  function initMobileDateFallback() {
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || "");
    if (!isIOS) return;

    const dateInputs = document.querySelectorAll('input[data-date-mask="true"]');
    dateInputs.forEach((input) => {
      input.type = "text";
      input.placeholder = "dd/mm/aaaa";
      input.maxLength = 10;
      input.inputMode = "numeric";

      input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "").slice(0, 8);
        const p1 = digits.slice(0, 2);
        const p2 = digits.slice(2, 4);
        const p3 = digits.slice(4, 8);
        if (digits.length <= 2) {
          input.value = p1;
        } else if (digits.length <= 4) {
          input.value = `${p1}/${p2}`;
        } else {
          input.value = `${p1}/${p2}/${p3}`;
        }
      });
    });
  }

  function initProfileSwitcher() {
    const select = document.getElementById("profile-switch");
    const trigger = document.getElementById("profile-trigger");
    const dropdown = document.getElementById("profile-dropdown");
    const avatar = document.getElementById("profile-avatar");
    const name = document.getElementById("profile-name-display");

    if (!select || !trigger || !dropdown || !avatar || !name) return;

    const initials = (value) => (value || "PF")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "PF";

    const sync = () => {
      const options = Array.from(select.options);
      const active = options.find((option) => option.selected) || options[0];

      if (active) {
        name.textContent = active.textContent;
        avatar.textContent = initials(active.textContent);
      }

      dropdown.innerHTML = "";
      options.forEach((option) => {
        const button = document.createElement("button");
        button.className = `profile-option${option.selected ? " active" : ""}`;
        button.type = "button";
        button.textContent = option.textContent;
        button.onclick = () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        };
        dropdown.appendChild(button);
      });
    };

    trigger.addEventListener("click", () => dropdown.classList.toggle("open"));
    select.addEventListener("change", sync);

    const observer = new MutationObserver(sync);
    observer.observe(select, { childList: true, subtree: true, attributes: true });

    sync();
  }

  function initAppShell(options = {}) {
    ensureGlobalUiNodes();
    initThemeToggle(options.toggleId || "theme-toggle");
    initSidebar(options.menuButtonId || "mobile-menu-btn", options.sidebarId || "app-sidebar", options.overlayId || "mobile-overlay");
    initPdfExport();
    initAccessibilityDefaults();
    initMobileDateFallback();

    if (options.profileSwitcher !== false) {
      initProfileSwitcher();
    }
  }

  global.CadernetaShell = {
    initAppShell,
    initThemeToggle,
    initSidebar,
    initProfileSwitcher,
    applyTheme,
    showGlobalLoading,
    hideGlobalLoading,
    showApiError,
    showToast,
    confirmAction,
  };
})(window);

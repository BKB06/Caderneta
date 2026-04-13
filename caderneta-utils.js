(function (global) {
  const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";
  const DEFAULT_AI_OPTIONS = ["Grok", "Claude", "Gemini", "Gemini DS", "ChatGPT"];

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

  const percentFormatter = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  });

  const numberFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function formatCurrencyBRL(value) {
    const amount = Number(value) || 0;
    const absFormatted = currencyFormatter.format(Math.abs(amount));
    if (amount < 0) {
      const numericPart = absFormatted.replace(/^R\$\s*/, "");
      return `R$ - ${numericPart}`;
    }
    return absFormatted;
  }

  function getActiveProfileId() {
    const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return activeId || null;
  }

  function setActiveProfileId(profileId) {
    if (!profileId) return;
    localStorage.setItem(ACTIVE_PROFILE_KEY, String(profileId));
  }

  async function resolveActiveProfileId(profiles) {
    const sourceProfiles = Array.isArray(profiles) ? profiles : await loadProfilesFromApi();
    let activeId = getActiveProfileId();

    if (!sourceProfiles.length) {
      return activeId;
    }

    const exists = sourceProfiles.some((profile) => profile.id === activeId);
    if (!exists) {
      activeId = sourceProfiles[0].id;
      setActiveProfileId(activeId);
    }

    return activeId;
  }

  function getSettingsKey() {
    const profileId = getActiveProfileId();
    return profileId ? `caderneta.settings.${profileId}` : "caderneta.settings.v1";
  }

  function normalizeAiName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseLocaleNumber(value) {
    if (typeof value !== "string") {
      return Number(value);
    }
    const normalized = value.replace(/\./g, "").replace(/,/g, ".").trim();
    return Number(normalized);
  }

  async function loadProfilesFromApi() {
    try {
      const resposta = await fetch("api.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "carregar_perfis" }),
      });
      const dados = await resposta.json();
      return Array.isArray(dados) ? dados : [];
    } catch (erro) {
      console.error("Erro ao carregar perfis:", erro);
      return [];
    }
  }

  global.CadernetaUtils = {
    ACTIVE_PROFILE_KEY,
    DEFAULT_AI_OPTIONS,
    currencyFormatter,
    formatCurrencyBRL,
    percentFormatter,
    numberFormatter,
    getActiveProfileId,
    setActiveProfileId,
    resolveActiveProfileId,
    getSettingsKey,
    normalizeAiName,
    parseLocaleNumber,
    loadProfilesFromApi,
  };
})(window);

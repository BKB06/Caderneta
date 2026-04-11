const THEME_KEY = "caderneta.theme";
const {
  getActiveProfileId,
  setActiveProfileId,
  resolveActiveProfileId,
} = window.CadernetaUtils;

const Shell = window.CadernetaShell || {};

let casinoRecords = [];
let sessionMode = "normal";
let activeHistoryFilter = "all";
let activePeriodFilter = "all";
let casinoChart = null;
let casinoHistoryCurrentPage = 1;

const CASINO_HISTORY_PAGE_SIZE = 40;
const casinoPagePrevButton = document.getElementById("casino-page-prev");
const casinoPageNextButton = document.getElementById("casino-page-next");
const casinoPageInfo = document.getElementById("casino-page-info");

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

async function apiPost(payload) {
  try {
    const response = await fetch("api.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error("Resposta inválida da API:", text);
      Shell.showApiError?.("Resposta invalida da API no cassino.");
      return null;
    }
  } catch (error) {
    console.error("Erro de comunicacao com API do cassino:", error);
    Shell.showApiError?.("Nao foi possivel comunicar com a API do cassino.");
    return null;
  }
}

function parseLocaleNumber(value) {
  if (typeof value !== "string") return Number(value);
  const normalized = value.replace(/\./g, "").replace(/,/g, ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return null;
}

function formatDateToBr(isoDate) {
  if (!isoDate) return "";
  const date = parseDate(isoDate);
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}/${m}/${y}`;
}

function formatDateToInput(brDate) {
  if (!brDate) return "";
  const date = parseDate(brDate);
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${y}-${m}-${d}`;
}

function getTodayInputDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcProfit(record) {
  const bet = Number(record.bet_amount) || 0;
  const win = Number(record.win_amount) || 0;
  return win - bet;
}

function isFreeRecord(record) {
  return Number(record.is_free) === 1;
}

function getSelectedAIs() {
  return null;
}

function getPeriodFilteredRecords(list = casinoRecords) {
  const now = new Date();
  const mode = activePeriodFilter;

  if (mode === "all") return list.slice();

  if (mode === "month") {
    return list.filter((record) => {
      const d = parseDate(record.date);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }

  if (mode === "week") {
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    return list.filter((record) => {
      const d = parseDate(record.date);
      return d && d >= weekStart;
    });
  }

  return list.slice();
}

function setTheme(theme) {
  const html = document.documentElement;
  const allowedThemes = ["dark", "light-azulado", "light", "light-bege"];
  const resolved = allowedThemes.includes(theme) ? theme : "dark";
  html.classList.remove("light", "dark", "light-azulado", "light-bege");
  html.classList.add(resolved);
  localStorage.setItem(THEME_KEY, resolved);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    if (resolved === "dark") btn.textContent = "🌙";
    if (resolved === "light-azulado") btn.textContent = "🧊";
    if (resolved === "light") btn.textContent = "☀️";
    if (resolved === "light-bege") btn.textContent = "🏖️";
    btn.setAttribute("aria-label", `Alterar tema (atual: ${resolved})`);
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light" || saved === "light-azulado" || saved === "light-bege") {
    setTheme(saved);
    return;
  }
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(preferredDark ? "dark" : "light-azulado");
}

function toggleTheme() {
  const html = document.documentElement;
  const themeOrder = ["dark", "light-azulado", "light", "light-bege"];
  const current = themeOrder.find((themeName) => html.classList.contains(themeName)) || "dark";
  const next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
  setTheme(next);
}

async function loadProfilesFromApi() {
  const data = await apiPost({ acao: "carregar_perfis" });
  return Array.isArray(data) ? data : [];
}

function initialsFromName(name) {
  if (!name) return "PF";
  const parts = name.split(" ").filter(Boolean);
  if (!parts.length) return "PF";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function syncProfileVisual() {
  const select = document.getElementById("profile-switch");
  const dropdown = document.getElementById("profile-dropdown");
  const avatar = document.getElementById("profile-avatar");
  const nameEl = document.getElementById("profile-name-display");

  if (!select || !dropdown || !avatar || !nameEl) return;

  const options = Array.from(select.options);
  const active = options.find((option) => option.selected) || options[0];

  if (active) {
    nameEl.textContent = active.textContent;
    avatar.textContent = initialsFromName(active.textContent);
  }

  dropdown.innerHTML = "";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-option ${option.selected ? "active" : ""}`;
    button.textContent = option.textContent;
    button.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    dropdown.appendChild(button);
  });
}

async function renderProfileSwitcher() {
  const select = document.getElementById("profile-switch");
  if (!select) return;

  const profiles = await loadProfilesFromApi();
  const activeId = await resolveActiveProfileId(profiles);

  select.innerHTML = "";
  if (profiles.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Perfil principal";
    select.appendChild(option);
  } else {
    profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      option.selected = profile.id === activeId;
      select.appendChild(option);
    });
  }

  syncProfileVisual();
}

function setupProfileSwitchSync() {
  const select = document.getElementById("profile-switch");
  const trigger = document.getElementById("profile-trigger");
  const dropdown = document.getElementById("profile-dropdown");

  if (!select || !trigger || !dropdown) return;

  select.addEventListener("change", () => {
    const nextProfile = select.value;
    if (nextProfile) {
      setActiveProfileId(nextProfile);
      window.location.reload();
      return;
    }
    syncProfileVisual();
  });

  trigger.addEventListener("click", () => {
    dropdown.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    if (dropdown.contains(event.target) || trigger.contains(event.target)) return;
    dropdown.classList.remove("open");
  });

  const observer = new MutationObserver(syncProfileVisual);
  observer.observe(select, { childList: true, subtree: true, attributes: true });
}

function setupSidebarDrawer() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const toggle = document.getElementById("sidebar-toggle");

  if (!sidebar || !overlay || !toggle) return;

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });
}

function getRealtimeEls() {
  return {
    label: document.getElementById("realtime-label"),
    profit: document.getElementById("realtime-profit"),
    betRow: document.getElementById("realtime-bet-row"),
    bet: document.getElementById("realtime-bet"),
    spinsRow: document.getElementById("realtime-spins-row"),
    spins: document.getElementById("realtime-spins"),
    financedRow: document.getElementById("realtime-financed-row"),
    financed: document.getElementById("realtime-financed"),
    win: document.getElementById("realtime-win"),
    perSpinRow: document.getElementById("realtime-perspin-row"),
    perSpin: document.getElementById("realtime-perspin"),
    badge: document.getElementById("realtime-badge"),
  };
}

function setSessionMode(mode) {
  sessionMode = mode === "free" ? "free" : "normal";

  const btnNormal = document.getElementById("btn-mode-normal");
  const btnFree = document.getElementById("btn-mode-free");
  const freeBlock = document.getElementById("freespins-block");
  const betInput = document.getElementById("casino-bet-amount");
  const hint = document.getElementById("bet-amount-hint");
  const freeBadge = document.getElementById("free-mode-badge");
  const submitBtn = document.getElementById("casino-submit");
  const realtime = getRealtimeEls();

  if (btnNormal) btnNormal.classList.toggle("active", sessionMode === "normal");
  if (btnFree) btnFree.classList.toggle("active", sessionMode === "free");

  if (freeBlock) freeBlock.style.display = sessionMode === "free" ? "block" : "none";
  if (freeBadge) freeBadge.style.display = sessionMode === "free" ? "inline-flex" : "none";

  if (betInput) {
    if (sessionMode === "free") {
      betInput.value = "0";
      betInput.disabled = true;
    } else {
      betInput.disabled = false;
    }
  }

  if (hint) hint.style.display = sessionMode === "free" ? "block" : "none";

  if (submitBtn) {
    submitBtn.classList.toggle("free-mode", sessionMode === "free");
  }

  if (realtime.betRow) realtime.betRow.style.display = sessionMode === "free" ? "none" : "flex";
  if (realtime.spinsRow) realtime.spinsRow.style.display = sessionMode === "free" ? "flex" : "none";
  if (realtime.financedRow) realtime.financedRow.style.display = sessionMode === "free" ? "flex" : "none";
  if (realtime.perSpinRow) realtime.perSpinRow.style.display = sessionMode === "free" ? "flex" : "none";

  recalcRealtime();
}

function applyQuickResult() {
  const quick = document.getElementById("casino-quick-result");
  const betInput = document.getElementById("casino-bet-amount");
  const winInput = document.getElementById("casino-win-amount");

  if (!quick || !winInput || !betInput) return;

  const bet = parseLocaleNumber(betInput.value);
  if (quick.value === "loss") {
    winInput.value = "0";
  }

  recalcRealtime();
}

function recalcRealtime() {
  const bet = parseLocaleNumber(document.getElementById("casino-bet-amount")?.value || "0");
  const win = parseLocaleNumber(document.getElementById("casino-win-amount")?.value || "0");
  const spins = Number(document.getElementById("casino-free-spins")?.value || 0);
  const spinBet = parseLocaleNumber(document.getElementById("casino-spin-bet")?.value || "0");
  const financed = spins * spinBet;

  const realtime = getRealtimeEls();
  const formProfit = document.getElementById("casino-session-profit");
  const freeHint = document.getElementById("freespins-calc-hint");

  if (sessionMode === "normal") {
    const profit = win - bet;

    if (realtime.label) realtime.label.textContent = "lucro / perda";
    if (realtime.profit) {
      realtime.profit.textContent = currencyFormatter.format(profit);
      realtime.profit.style.color = profit > 0 ? "var(--success)" : profit < 0 ? "var(--danger)" : "var(--text)";
    }
    if (realtime.bet) realtime.bet.textContent = currencyFormatter.format(bet);
    if (realtime.win) realtime.win.textContent = currencyFormatter.format(win);

    if (realtime.badge) {
      realtime.badge.className = "hero-tag";
      if (!bet && !win) {
        realtime.badge.textContent = "Sem dados";
      } else if (profit > 0) {
        realtime.badge.classList.add("positive");
        realtime.badge.textContent = `Sessão positiva · ganhou ${currencyFormatter.format(profit)}`;
      } else if (profit < 0) {
        realtime.badge.classList.add("negative");
        realtime.badge.textContent = `Sessão negativa · perdeu ${currencyFormatter.format(Math.abs(profit))}`;
      } else {
        realtime.badge.textContent = "Neutra";
      }
    }

    if (formProfit) {
      formProfit.textContent = currencyFormatter.format(profit);
      formProfit.style.color = profit > 0 ? "var(--success)" : profit < 0 ? "var(--danger)" : "var(--text)";
    }

    if (freeHint) {
      freeHint.textContent = "Preencha para ver o valor financiado pela casa";
    }

    return;
  }

  const lucro = win;
  const perSpin = spins > 0 ? win / spins : 0;

  if (realtime.label) realtime.label.textContent = "ganho líquido puro";
  if (realtime.profit) {
    realtime.profit.textContent = currencyFormatter.format(lucro);
    realtime.profit.style.color = "color-mix(in srgb, var(--warning) 70%, var(--text) 30%)";
  }
  if (realtime.win) realtime.win.textContent = currencyFormatter.format(win);
  if (realtime.spins) realtime.spins.textContent = String(spins || 0);
  if (realtime.financed) realtime.financed.textContent = currencyFormatter.format(financed || 0);
  if (realtime.perSpin) realtime.perSpin.textContent = currencyFormatter.format(perSpin || 0);

  if (realtime.badge) {
    realtime.badge.className = "hero-tag";
    if (!win && !spins && !spinBet) {
      realtime.badge.textContent = "Sem dados";
    } else {
      realtime.badge.textContent = `Ganho puro · ${currencyFormatter.format(lucro)} sem custo`;
      realtime.badge.style.background = "color-mix(in srgb, var(--warning) 20%, transparent)";
      realtime.badge.style.color = "color-mix(in srgb, var(--warning) 75%, var(--text) 25%)";
    }
  }

  if (formProfit) {
    formProfit.textContent = currencyFormatter.format(lucro);
    formProfit.style.color = "color-mix(in srgb, var(--warning) 75%, var(--text) 25%)";
  }

  if (freeHint) {
    if (spins > 0 && spinBet > 0) {
      freeHint.textContent = `Casa financiou ${currencyFormatter.format(financed)} (${spins} rodadas × ${currencyFormatter.format(spinBet)})`;
    } else {
      freeHint.textContent = "Preencha para ver o valor financiado pela casa";
    }
  }
}

function updateKpis() {
  const records = getPeriodFilteredRecords(casinoRecords);
  const totalSessions = records.length;
  const totalProfit = records.reduce((sum, record) => sum + calcProfit(record), 0);
  const normalSessions = records.filter((record) => !isFreeRecord(record));
  const totalVolume = normalSessions.reduce((sum, record) => sum + (Number(record.bet_amount) || 0), 0);
  const positiveSessions = records.filter((record) => calcProfit(record) > 0).length;
  const avgPerSession = totalSessions > 0 ? totalProfit / totalSessions : 0;
  const freeSessions = records.filter((record) => isFreeRecord(record));
  const freeTotal = freeSessions.reduce((sum, record) => sum + (Number(record.win_amount) || 0), 0);
  const totalFreeSpins = freeSessions.reduce((sum, record) => sum + (Number(record.free_spins) || 0), 0);

  const profitEl = document.getElementById("casino-total-profit");
  const heroSub = document.getElementById("casino-hero-sub");
  const heroTag = document.getElementById("casino-hero-tag");
  const heroAvg = document.getElementById("casino-hero-avg");
  const heroLast = document.getElementById("casino-hero-last");

  if (profitEl) {
    profitEl.textContent = currencyFormatter.format(totalProfit);
    profitEl.classList.remove("positive", "negative");
    if (totalProfit > 0) profitEl.classList.add("positive");
    if (totalProfit < 0) profitEl.classList.add("negative");
  }

  if (heroSub) {
    heroSub.textContent = `${totalSessions} sessões · ${currencyFormatter.format(totalVolume)} em volume`;
  }

  if (heroTag) {
    heroTag.className = "hero-tag";
    if (totalSessions === 0) {
      heroTag.textContent = "Sem sessões";
    } else if (totalProfit >= 0) {
      heroTag.classList.add("positive");
      heroTag.textContent = "Resultado positivo";
    } else {
      heroTag.classList.add("negative");
      heroTag.textContent = "Resultado negativo";
    }
  }

  if (heroAvg) {
    heroAvg.textContent = `Média: ${currencyFormatter.format(avgPerSession)}/sessão`;
  }

  if (heroLast) {
    if (!totalSessions) {
      heroLast.textContent = "Última sessão: -";
    } else {
      const sorted = records.slice().sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
      const last = sorted[0];
      const lastProfit = calcProfit(last);
      const sign = lastProfit > 0 ? "+" : "";
      heroLast.textContent = `Última sessão: ${sign}${currencyFormatter.format(lastProfit)} · ${last.game || "-"}`;
    }
  }

  const posPct = totalSessions > 0 ? positiveSessions / totalSessions : 0;

  const totalBetEl = document.getElementById("casino-total-bet");
  if (totalBetEl) totalBetEl.textContent = currencyFormatter.format(totalVolume);

  const sessionsPosEl = document.getElementById("casino-sessions-pos");
  if (sessionsPosEl) sessionsPosEl.textContent = `${positiveSessions} de ${totalSessions}`;

  const sessionsPosPctEl = document.getElementById("casino-sessions-pospct");
  if (sessionsPosPctEl) sessionsPosPctEl.textContent = `${Math.round(posPct * 100)}% das sessões`;

  const avgSessionEl = document.getElementById("casino-avg-session");
  if (avgSessionEl) {
    avgSessionEl.textContent = currencyFormatter.format(avgPerSession);
    avgSessionEl.style.color = avgPerSession > 0 ? "var(--success)" : avgPerSession < 0 ? "var(--danger)" : "var(--text)";
  }

  const freeTotalEl = document.getElementById("casino-free-total");
  if (freeTotalEl) freeTotalEl.textContent = `+${currencyFormatter.format(freeTotal)}`;

  const freeSubEl = document.getElementById("casino-free-sub");
  if (freeSubEl) freeSubEl.textContent = `${freeSessions.length} sessões · ${totalFreeSpins} rodadas`;

  const volumeBar = document.getElementById("casino-volume-bar");
  const sessionsBar = document.getElementById("casino-sessions-bar");
  const avgBar = document.getElementById("casino-avg-bar");
  const freeBar = document.getElementById("casino-free-bar");

  if (volumeBar) {
    volumeBar.style.width = `${Math.min(totalSessions * 10, 100)}%`;
    volumeBar.style.background = "var(--text-muted)";
  }

  if (sessionsBar) {
    sessionsBar.style.width = `${Math.min(posPct * 100, 100)}%`;
    sessionsBar.style.background = posPct >= 0.5 ? "var(--success)" : "var(--danger)";
  }

  if (avgBar) {
    avgBar.style.width = `${Math.min(Math.abs(avgPerSession) * 2, 100)}%`;
    avgBar.style.background = avgPerSession >= 0 ? "var(--success)" : "var(--danger)";
  }

  if (freeBar) {
    freeBar.style.width = `${Math.min(freeSessions.length * 15, 100)}%`;
    freeBar.style.background = "var(--warning)";
  }
}

function renderGroupedRanking(containerId, groupedMap) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const items = Object.entries(groupedMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 4);

  if (!items.length) {
    container.innerHTML = '<p class="empty-msg">Sem dados neste período.</p>';
    return;
  }

  container.innerHTML = items
    .map((item, index) => {
      const signClass = item.profit >= 0 ? "positive" : "negative";
      return `
        <div class="mini-rank-item">
          <span class="pos">#${index + 1}</span>
          <strong>${item.name}</strong>
          <span class="sessions">${item.sessions} sess.</span>
          <span class="profit ${signClass}">${currencyFormatter.format(item.profit)}</span>
        </div>
      `;
    })
    .join("");
}

function renderTopGames() {
  const records = getPeriodFilteredRecords(casinoRecords);
  const grouped = {};

  records.forEach((record) => {
    const key = record.game || "Sem jogo";
    if (!grouped[key]) grouped[key] = { profit: 0, sessions: 0 };
    grouped[key].profit += calcProfit(record);
    grouped[key].sessions += 1;
  });

  renderGroupedRanking("casino-top-games", grouped);
}

function renderTopPlatforms() {
  const records = getPeriodFilteredRecords(casinoRecords);
  const grouped = {};

  records.forEach((record) => {
    const key = record.platform || "Sem plataforma";
    if (!grouped[key]) grouped[key] = { profit: 0, sessions: 0 };
    grouped[key].profit += calcProfit(record);
    grouped[key].sessions += 1;
  });

  renderGroupedRanking("casino-top-platforms", grouped);
}

function getHistoryFilteredRecords(type) {
  const fromDate = document.getElementById("casino-date-start")?.value || "";
  const toDate = document.getElementById("casino-date-end")?.value || "";

  let records = getPeriodFilteredRecords(casinoRecords);

  records = records.filter((record) => {
    const profit = calcProfit(record);
    if (type === "pos") return profit > 0;
    if (type === "neg") return profit < 0;
    if (type === "free") return isFreeRecord(record);
    return true;
  });

  records = records.filter((record) => {
    const d = parseDate(record.date);
    if (!d) return false;

    if (fromDate) {
      const from = parseDate(fromDate);
      if (from && d < from) return false;
    }

    if (toDate) {
      const to = parseDate(toDate);
      if (to && d > to) return false;
    }

    return true;
  });

  records.sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
  return records;
}

function renderHistory(type = activeHistoryFilter) {
  const tbody = document.getElementById("casino-body");
  if (!tbody) return;

  const records = getHistoryFilteredRecords(type);

  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="9">Nenhuma sessão encontrada.</td></tr>';
    renderCasinoHistoryPagination(0, 0, 0, 0);
    return;
  }

  const totalItems = records.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / CASINO_HISTORY_PAGE_SIZE));
  if (casinoHistoryCurrentPage > totalPages) casinoHistoryCurrentPage = totalPages;
  if (casinoHistoryCurrentPage < 1) casinoHistoryCurrentPage = 1;
  const startIndex = (casinoHistoryCurrentPage - 1) * CASINO_HISTORY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + CASINO_HISTORY_PAGE_SIZE, totalItems);
  const pageData = records.slice(startIndex, endIndex);

  tbody.innerHTML = pageData
    .map((record) => {
      const profit = calcProfit(record);
      const typeLabel = profit > 0 ? "Positiva" : profit < 0 ? "Negativa" : "Neutra";
      const typeClass = profit > 0 ? "positive" : profit < 0 ? "negative" : "draw";
      const gameText = isFreeRecord(record)
        ? `${record.game || "-"} <span class="badge free">Grátis</span>`
        : record.game || "-";
      const betText = isFreeRecord(record) ? "—" : currencyFormatter.format(Number(record.bet_amount) || 0);
      const profitClass = profit >= 0 ? "positive" : "negative";

      return `
        <tr>
          <td>${record.date || "-"}</td>
          <td>${gameText}</td>
          <td>${record.platform || "-"}</td>
          <td>${betText}</td>
          <td>${currencyFormatter.format(Number(record.win_amount) || 0)}</td>
          <td class="${profitClass}">${currencyFormatter.format(profit)}</td>
          <td><span class="history-type ${typeClass}">${typeLabel}</span></td>
          <td>${record.note || "—"}</td>
          <td><button type="button" class="ghost small" data-action="delete" data-id="${record.id}">Excluir</button></td>
        </tr>
      `;
    })
    .join("");

  renderCasinoHistoryPagination(startIndex + 1, endIndex, totalItems, totalPages);
}

function renderCasinoHistoryPagination(start, end, totalItems, totalPages) {
  if (casinoPageInfo) {
    casinoPageInfo.textContent = `Mostrando ${start}-${end} de ${totalItems}`;
  }
  if (casinoPagePrevButton) {
    casinoPagePrevButton.disabled = casinoHistoryCurrentPage <= 1 || totalItems === 0;
  }
  if (casinoPageNextButton) {
    casinoPageNextButton.disabled = casinoHistoryCurrentPage >= totalPages || totalItems === 0;
  }
}

function resetCasinoHistoryPagination() {
  casinoHistoryCurrentPage = 1;
}

function renderChart() {
  const canvas = document.getElementById("casino-chart");
  if (!canvas || typeof Chart === "undefined") return;

  const records = getPeriodFilteredRecords(casinoRecords)
    .slice()
    .sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0));

  let cumulative = 0;
  const labels = [];
  const data = [];

  records.forEach((record) => {
    cumulative += calcProfit(record);
    labels.push(record.date || "-");
    data.push(Number(cumulative.toFixed(2)));
  });

  if (!labels.length) {
    labels.push("Sem dados");
    data.push(0);
  }

  const tickColor = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#6b7280";
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(0,0,0,0.08)";

  if (casinoChart) {
    casinoChart.data.labels = labels;
    casinoChart.data.datasets[0].data = data;
    casinoChart.options.scales.x.ticks.color = tickColor;
    casinoChart.options.scales.y.ticks.color = tickColor;
    casinoChart.options.scales.x.grid.color = gridColor;
    casinoChart.options.scales.y.grid.color = gridColor;
    casinoChart.update();
    return;
  }

  casinoChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Lucro acumulado",
          data,
          borderColor: "#7c5cff",
          backgroundColor: "rgba(124, 92, 255, 0.18)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor }, grid: { color: gridColor } },
      },
    },
  });
}

function refreshCasinoView() {
  updateKpis();
  renderTopGames();
  renderTopPlatforms();
  renderHistory(activeHistoryFilter);
  renderChart();
  runSimulator();
}

async function deleteSession(id) {
  if (!id) return;

  const ok = window.confirm("Deseja excluir esta sessão?");
  if (!ok) return;

  const result = await apiPost({
    acao: "excluir_casino",
    profile_id: getActiveProfileId(),
    id,
  });

  if (result && result.sucesso === false) {
    alert("Não foi possível excluir a sessão.");
    return;
  }

  casinoRecords = casinoRecords.filter((record) => String(record.id) !== String(id));
  refreshCasinoView();
}

async function saveSession(event) {
  event.preventDefault();

  const dateInput = document.getElementById("casino-date");
  const gameInput = document.getElementById("casino-game");
  const platformInput = document.getElementById("casino-platform");
  const betInput = document.getElementById("casino-bet-amount");
  const winInput = document.getElementById("casino-win-amount");
  const spinsInput = document.getElementById("casino-free-spins");
  const spinBetInput = document.getElementById("casino-spin-bet");
  const noteInput = document.getElementById("casino-note");

  const game = (gameInput?.value || "").trim();
  const platform = (platformInput?.value || "").trim();
  const betAmount = parseLocaleNumber(betInput?.value || "0");
  const winAmount = parseLocaleNumber(winInput?.value || "0");
  const freeSpins = Number(spinsInput?.value || 0);
  const spinBet = parseLocaleNumber(spinBetInput?.value || "0");

  if (!game) {
    alert("Informe o jogo da sessão.");
    return;
  }

  if (sessionMode === "normal" && betAmount <= 0) {
    alert("No modo normal, o valor apostado deve ser maior que zero.");
    return;
  }

  const casino = {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    profile_id: getActiveProfileId(),
    date: formatDateToBr(dateInput?.value || ""),
    game,
    platform,
    bet_amount: sessionMode === "free" ? 0 : betAmount,
    win_amount: winAmount,
    is_free: sessionMode === "free" ? 1 : 0,
    free_spins: sessionMode === "free" ? (freeSpins || null) : null,
    spin_bet: sessionMode === "free" ? (spinBet || null) : null,
    ais: getSelectedAIs(),
    note: (noteInput?.value || "").trim(),
  };

  const result = await apiPost({
    acao: "salvar_casino",
    profile_id: getActiveProfileId(),
    casino,
  });

  if (result && result.sucesso === false) {
    alert("Não foi possível salvar a sessão.");
    return;
  }

  casinoRecords.unshift(casino);
  refreshCasinoView();
  clearForm();
}

function clearForm() {
  const form = document.getElementById("casino-form");
  form?.reset();

  const dateInput = document.getElementById("casino-date");
  if (dateInput) dateInput.value = getTodayInputDate();

  const quick = document.getElementById("casino-quick-result");
  if (quick) quick.value = "";

  if (sessionMode === "free") {
    const betInput = document.getElementById("casino-bet-amount");
    if (betInput) betInput.value = "0";
  }

  recalcRealtime();
}

async function loadCasino() {
  const data = await apiPost({
    acao: "carregar_casino",
    profile_id: getActiveProfileId(),
  });

  const list = Array.isArray(data) ? data : [];

  casinoRecords = list.map((record) => ({
    ...record,
    date: record.date || "",
    game: record.game || "",
    platform: record.platform || "",
    bet_amount: Number(record.bet_amount) || 0,
    win_amount: Number(record.win_amount) || 0,
    is_free: Number(record.is_free) || 0,
    free_spins: record.free_spins != null ? Number(record.free_spins) : null,
    spin_bet: record.spin_bet != null ? Number(record.spin_bet) : null,
    note: record.note || "",
  }));

  refreshCasinoView();
}

function filterHistory(type) {
  activeHistoryFilter = type;
  resetCasinoHistoryPagination();
  document.querySelectorAll(".history-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.filter === type);
  });
  renderHistory(type);
}

function toggleSimulator() {
  const body = document.getElementById("sim-body");
  const indicator = document.getElementById("sim-toggle-indicator");
  if (!body || !indicator) return;

  body.classList.toggle("open");
  indicator.textContent = body.classList.contains("open") ? "▲ recolher" : "▼ expandir";

  if (body.classList.contains("open")) {
    runSimulator();
  }
}

function runSimulator() {
  const sessionsPerWeek = Math.max(1, Number(document.getElementById("sim-sessions-week")?.value || 3));
  const weeks = Math.max(1, Number(document.getElementById("sim-weeks")?.value || 4));
  const resultEl = document.getElementById("sim-result");
  if (!resultEl) return;

  const records = getPeriodFilteredRecords(casinoRecords);
  const avgPerSession = records.length ? records.reduce((sum, record) => sum + calcProfit(record), 0) / records.length : 0;

  const projectedSessions = sessionsPerWeek * weeks;
  const projectedDays = weeks * 7;
  const projectedResult = avgPerSession * projectedSessions;

  const action = projectedResult >= 0 ? "ganhar" : "perder";
  const absResult = Math.abs(projectedResult);

  resultEl.innerHTML = `Com <strong>${sessionsPerWeek} sessões/semana</strong> por <strong>${weeks} semanas</strong> (${projectedSessions} sessões), baseado na média atual de <strong>${currencyFormatter.format(avgPerSession)}/sessão</strong>, a projeção é <strong>${action} ${currencyFormatter.format(absResult)}</strong> nos próximos ${projectedDays} dias.`;
}

function handlePeriodChange() {
  const periodFilter = document.getElementById("period-filter");
  activePeriodFilter = periodFilter?.value || "all";
  resetCasinoHistoryPagination();
  refreshCasinoView();
}

function setupHistoryActions() {
  const body = document.getElementById("casino-body");
  body?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete']");
    if (!button) return;
    deleteSession(button.dataset.id);
  });
}

window.setSessionMode = setSessionMode;
window.filterHistory = filterHistory;
window.toggleSimulator = toggleSimulator;

window.addEventListener("DOMContentLoaded", async () => {
  Shell.showGlobalLoading?.("Carregando dados do cassino...");
  initTheme();
  setupSidebarDrawer();

  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

  try {
    await renderProfileSwitcher();
    setupProfileSwitchSync();

    const dateInput = document.getElementById("casino-date");
    if (dateInput) dateInput.value = getTodayInputDate();

  setSessionMode("normal");
  recalcRealtime();

  document.getElementById("casino-form")?.addEventListener("submit", saveSession);
  document.getElementById("casino-reset")?.addEventListener("click", clearForm);
  document.getElementById("casino-bet-amount")?.addEventListener("input", recalcRealtime);
  document.getElementById("casino-win-amount")?.addEventListener("input", recalcRealtime);
  document.getElementById("casino-free-spins")?.addEventListener("input", recalcRealtime);
  document.getElementById("casino-spin-bet")?.addEventListener("input", recalcRealtime);
  document.getElementById("casino-quick-result")?.addEventListener("change", applyQuickResult);

  document.getElementById("casino-date-start")?.addEventListener("change", () => { resetCasinoHistoryPagination(); renderHistory(activeHistoryFilter); });
  document.getElementById("casino-date-end")?.addEventListener("change", () => { resetCasinoHistoryPagination(); renderHistory(activeHistoryFilter); });
  document.getElementById("casino-clear-filters")?.addEventListener("click", () => {
    const from = document.getElementById("casino-date-start");
    const to = document.getElementById("casino-date-end");
    if (from) from.value = "";
    if (to) to.value = "";
    filterHistory("all");
  });

  document.getElementById("period-filter")?.addEventListener("change", handlePeriodChange);
  document.getElementById("sim-sessions-week")?.addEventListener("input", runSimulator);
  document.getElementById("sim-weeks")?.addEventListener("input", runSimulator);
  casinoPagePrevButton?.addEventListener("click", () => {
    if (casinoHistoryCurrentPage <= 1) return;
    casinoHistoryCurrentPage -= 1;
    renderHistory(activeHistoryFilter);
  });
  casinoPageNextButton?.addEventListener("click", () => {
    casinoHistoryCurrentPage += 1;
    renderHistory(activeHistoryFilter);
  });

    setupHistoryActions();

    const exportBtn = document.getElementById("export-pdf-btn");
    exportBtn?.addEventListener("click", () => {
      window.location.href = "./index.html?openPdf=1";
    });

    await loadCasino();
    runSimulator();
  } catch (error) {
    console.error("Falha ao iniciar cassino:", error);
    Shell.showApiError?.("Nao foi possivel iniciar a pagina de cassino.");
  } finally {
    Shell.hideGlobalLoading?.();
  }
});

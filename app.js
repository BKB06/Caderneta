const PROFILES_KEY = "caderneta.profiles.v1";
const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";

// Funções para obter chaves dinâmicas baseadas no perfil ativo
function getActiveProfileId() {
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  let activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  
  // Se não há perfis ainda, usar chaves legadas
  if (profiles.length === 0) {
    return null;
  }
  
  // Se não há perfil ativo válido, usar o primeiro
  if (!activeId || !profiles.find(p => p.id === activeId)) {
    activeId = profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
  }
  
  return activeId;
}

function getStorageKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.bets.${profileId}` : "caderneta.bets.v1";
}

function getCashflowKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.cashflow.${profileId}` : "caderneta.cashflow.v1";
}

function getBankrollKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.bankroll.${profileId}` : "caderneta.bankroll.base.v1";
}

function getSettingsKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.settings.${profileId}` : "caderneta.settings.v1";
}

function getNotesKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.notes.${profileId}` : "caderneta.notes.v1";
}

function getGoalsKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.goals.${profileId}` : "caderneta.goals.v1";
}

const form = document.getElementById("bet-form");
const potentialProfitEl = document.getElementById("potential-profit");
const betsBody = document.getElementById("bets-body");
const resetButton = document.getElementById("reset-button");
const submitButton = document.getElementById("submit-button");

const bankrollInput = document.getElementById("bankroll-input");
const bankrollProgress = document.getElementById("bankroll-progress");
const bankrollExposure = document.getElementById("bankroll-exposure");
const bankrollExposureValue = document.getElementById("bankroll-exposure-value");
const bankrollDeposits = document.getElementById("bankroll-deposits");
const bankrollWithdraws = document.getElementById("bankroll-withdraws");
const bankrollProfitIndicator = document.getElementById("bankroll-profit-indicator");
const bookFilter = document.getElementById("book-filter");
const statusFilter = document.getElementById("status-filter");

const kpiProfit = document.getElementById("kpi-profit");
const kpiWinrate = document.getElementById("kpi-winrate");
const kpiRoi = document.getElementById("kpi-roi");
const kpiAvgOdd = document.getElementById("kpi-avg-odd");
const kpiAvgStake = document.getElementById("kpi-avg-stake");
const kpiTotalStake = document.getElementById("kpi-total-stake");
const kpiTotalBets = document.getElementById("kpi-total-bets");
const kpiStreak = document.getElementById("kpi-streak");

const dateFilterStart = document.getElementById("date-filter-start");
const dateFilterEnd = document.getElementById("date-filter-end");
const clearDateFilter = document.getElementById("clear-date-filter");

// Modal elements
const dayModal = document.getElementById("day-modal");
const modalTitle = document.getElementById("modal-title");
const modalSummary = document.getElementById("modal-summary");
const modalBetsList = document.getElementById("modal-bets-list");
const modalClose = document.getElementById("modal-close");

let bets = [];
let cashflows = [];
let editingId = null;
let deletePendingId = null;
let balanceChart = null;
let baseBankroll = null;
let settings = null;

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

function loadBets() {
  const raw = localStorage.getItem(getStorageKey());
  bets = raw ? JSON.parse(raw) : [];
  let migrationNeeded = false;
  bets = bets.map((bet) => {
    const statusMap = {
      Pendente: "pending",
      Green: "win",
      "Green / Ganhou": "win",
      Red: "loss",
      "Red / Perdeu": "loss",
      Void: "void",
      "Devolvida / Void": "void",
      Cashout: "cashout",
    };
    let aiValue = bet.ai;
    if (aiValue === "Opus 4") {
        aiValue = "Claude";
        migrationNeeded = true;
    }
    return {
      ...bet,
      status: statusMap[bet.status] || bet.status,
      stake: Number(bet.stake),
      odds: Number(bet.odds),
      isFreebet: Boolean(bet.isFreebet || bet.freebet),
    };
    
  });
  if (migrationNeeded) {
      saveBets();
      console.log("Dados migrados de Opus 4 para Claude com sucesso.");
  }
}

function loadCashflows() {
  const raw = localStorage.getItem(getCashflowKey());
  cashflows = raw ? JSON.parse(raw) : [];
  cashflows = cashflows.map((flow) => ({
    ...flow,
    amount: Number(flow.amount),
  }));
}

function loadSettings() {
  const defaultSettings = {
    profile: { name: "", goal: null },
    display: {
      showCalendar: true,
      showChart: true,
      showBankroll: true,
      showKpis: true,
      showPotentialProfit: true,
      showTablePotential: true,
      showRoi: true,
      showAvgOdd: true,
      showAvgStake: true,
      showTotalStake: true,
      showTotalBets: true,
      showStreak: true,
      showStakedPeriod: true,
    },
    columns: {
      date: true,
      event: true,
      odds: true,
      stake: true,
      status: true,
      profit: true,
      potential: true,
      book: true,
    },
    favorites: [],
    defaults: {
      status: "pending",
      filter: "pending",
      stakeType: "regular",
    },
  };

  const raw = localStorage.getItem(getSettingsKey());
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      settings = { ...defaultSettings, ...saved };
      settings.profile = { ...defaultSettings.profile, ...saved.profile };
      settings.display = { ...defaultSettings.display, ...saved.display };
      settings.columns = { ...defaultSettings.columns, ...saved.columns };
      settings.defaults = { ...defaultSettings.defaults, ...saved.defaults };
      settings.favorites = saved.favorites || [];
    } catch (e) {
      settings = defaultSettings;
    }
  } else {
    settings = defaultSettings;
  }
}

function applySettings() {
  if (!settings) return;

  // Apply display settings
  const calendarSection = document.querySelector('.panel.full:has(#calendar-container)');
  const chartGrid = document.querySelector('.chart-grid');
  const bankManagement = document.querySelector('.bank-management');
  const kpiGrid = document.querySelector('.kpi-grid');
  const potentialProfitContainer = potentialProfitEl?.closest('div');

  // KPI containers individuais
  const kpiRoiContainer = document.getElementById('kpi-roi-container');
  const kpiAvgOddContainer = document.getElementById('kpi-avg-odd-container');
  const kpiAvgStakeContainer = document.getElementById('kpi-avg-stake-container');
  const kpiTotalStakeContainer = document.getElementById('kpi-total-stake-container');
  const kpiTotalBetsContainer = document.getElementById('kpi-total-bets-container');
  const kpiStreakContainer = document.getElementById('kpi-streak-container');

  if (calendarSection) {
    calendarSection.style.display = settings.display.showCalendar ? '' : 'none';
  }
  if (chartGrid) {
    chartGrid.style.display = settings.display.showChart ? '' : 'none';
  }
  if (bankManagement) {
    bankManagement.style.display = settings.display.showBankroll ? '' : 'none';
  }
  if (kpiGrid) {
    kpiGrid.style.display = settings.display.showKpis ? '' : 'none';
  }
  if (potentialProfitContainer) {
    potentialProfitContainer.style.display = settings.display.showPotentialProfit ? '' : 'none';
  }

  // Novos KPIs individuais
  if (kpiRoiContainer) {
    kpiRoiContainer.style.display = settings.display.showRoi ? '' : 'none';
  }
  if (kpiAvgOddContainer) {
    kpiAvgOddContainer.style.display = settings.display.showAvgOdd ? '' : 'none';
  }
  if (kpiAvgStakeContainer) {
    kpiAvgStakeContainer.style.display = settings.display.showAvgStake ? '' : 'none';
  }
  if (kpiTotalStakeContainer) {
    kpiTotalStakeContainer.style.display = settings.display.showTotalStake ? '' : 'none';
  }
  if (kpiTotalBetsContainer) {
    kpiTotalBetsContainer.style.display = settings.display.showTotalBets ? '' : 'none';
  }
  if (kpiStreakContainer) {
    kpiStreakContainer.style.display = settings.display.showStreak ? '' : 'none';
  }

  // Painel de Total Apostado por Período
  const stakedPeriodContainer = document.getElementById('staked-period-container');
  if (stakedPeriodContainer) {
    stakedPeriodContainer.style.display = settings.display.showStakedPeriod !== false ? '' : 'none';
  }

  // Apply default status filter
  if (statusFilter && settings.defaults.filter) {
    statusFilter.value = settings.defaults.filter;
  }

  // Apply default status to form
  const betStatus = document.getElementById("bet-status");
  if (betStatus && settings.defaults.status) {
    betStatus.value = settings.defaults.status;
  }

  // Apply default stake type
  const betStakeType = document.getElementById("bet-stake-type");
  if (betStakeType && settings.defaults.stakeType) {
    betStakeType.value = settings.defaults.stakeType;
  }

  // Apply favorites to book input (datalist)
  const bookInput = document.getElementById("bet-book");
  if (bookInput && settings.favorites.length > 0) {
    let datalist = document.getElementById("book-datalist");
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = "book-datalist";
      document.body.appendChild(datalist);
      bookInput.setAttribute("list", "book-datalist");
    }
    datalist.innerHTML = settings.favorites
      .map((fav) => `<option value="${fav}">`)
      .join("");
  }
}

function loadBankrollBase() {
  const raw = localStorage.getItem(getBankrollKey());
  const value = Number(raw);
  baseBankroll = Number.isFinite(value) ? value : null;
}

function saveBankrollBase() {
  if (Number.isFinite(baseBankroll)) {
    localStorage.setItem(getBankrollKey(), String(baseBankroll));
  } else {
    localStorage.removeItem(getBankrollKey());
  }
}

function saveBets() {
  localStorage.setItem(getStorageKey(), JSON.stringify(bets));
}

function saveCashflows() {
  localStorage.setItem(getCashflowKey(), JSON.stringify(cashflows));
}

function parseLocaleNumber(value) {
  if (typeof value !== "string") {
    return Number(value);
  }
  const normalized = value.replace(/\./g, "").replace(/,/g, ".").trim();
  return Number(normalized);
}

function formatStake(value) {
  return currencyFormatter.format(value);
}

function formatProfit(value) {
  return currencyFormatter.format(value);
}

function calcProfit(bet) {
  if (bet.status === "win") {
    return bet.stake * (bet.odds - 1);
  }
  if (bet.status === "loss") {
    return bet.isFreebet ? 0 : -bet.stake;
  }
  return 0;
}

function calcPotentialProfit(stake, odds) {
  if (!Number.isFinite(stake) || !Number.isFinite(odds)) {
    return 0;
  }
  return stake * (odds - 1);
}

function calcSettledProfit(list = bets) {
  return list
    .filter((bet) => bet.status === "win" || bet.status === "loss")
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function calcCashflowTotal(list = cashflows) {
  return list.reduce((sum, flow) => {
    if (flow.type === "deposit") {
      return sum + flow.amount;
    }
    if (flow.type === "withdraw") {
      return sum - flow.amount;
    }
    return sum;
  }, 0);
}

function calcTotalDeposits(list = cashflows) {
  return list
    .filter((flow) => flow.type === "deposit")
    .reduce((sum, flow) => sum + flow.amount, 0);
}

function calcTotalWithdraws(list = cashflows) {
  return list
    .filter((flow) => flow.type === "withdraw")
    .reduce((sum, flow) => sum + flow.amount, 0);
}

function getEffectiveBankroll() {
  if (!Number.isFinite(baseBankroll)) {
    return null;
  }
  return baseBankroll + calcSettledProfit() + calcCashflowTotal();
}

function updateBankrollDisplay() {
  const effective = getEffectiveBankroll();
  if (!Number.isFinite(effective)) {
    return;
  }
  bankrollInput.value = numberFormatter.format(effective);
  
  // Atualiza indicadores de depósitos, saques e lucro
  const totalDeposits = calcTotalDeposits();
  const totalWithdraws = calcTotalWithdraws();
  const settledProfit = calcSettledProfit();
  
  if (bankrollDeposits) {
    bankrollDeposits.textContent = `+${formatProfit(totalDeposits)} depósitos`;
  }
  if (bankrollWithdraws) {
    bankrollWithdraws.textContent = `-${formatProfit(totalWithdraws)} saques`;
  }
  if (bankrollProfitIndicator) {
    const profitPrefix = settledProfit >= 0 ? '+' : '';
    bankrollProfitIndicator.textContent = `${profitPrefix}${formatProfit(settledProfit)} lucro`;
    bankrollProfitIndicator.className = `breakdown-item ${settledProfit >= 0 ? 'positive' : 'negative'}`;
  }
}

function formatDateDisplay(value) {
  if (!value) {
    return "";
  }
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return value;
  }
  return "";
}

function formatDateForInput(value) {
  if (!value) {
    return "";
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }
  return value;
}

function parseDateForSort(value) {
  if (!value) {
    return null;
  }
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return null;
}

function updatePotentialProfit() {
  const stake = parseLocaleNumber(document.getElementById("bet-stake").value);
  const odds = parseLocaleNumber(document.getElementById("bet-odds").value);
  const value = calcPotentialProfit(stake, odds);
  potentialProfitEl.textContent = formatProfit(value);
}

function getFilteredBets() {
  const selected = bookFilter.value;
  const status = statusFilter?.value || "all";
  const startDate = dateFilterStart?.value ? parseDateForSort(dateFilterStart.value) : null;
  const endDate = dateFilterEnd?.value ? parseDateForSort(dateFilterEnd.value) : null;

  return bets.filter((bet) => {
    // Filtro por casa
    const matchBook = !selected || selected === "all" || bet.book === selected;

    // Filtro por status
    let matchStatus = true;
    if (status === "pending") {
      matchStatus = bet.status === "pending";
    } else if (status === "settled") {
      matchStatus = bet.status === "win" || bet.status === "loss";
    }

    // Filtro por data
    let matchDate = true;
    if (startDate || endDate) {
      const betDate = parseDateForSort(bet.date);
      if (betDate) {
        if (startDate && betDate < startDate) {
          matchDate = false;
        }
        if (endDate && betDate > endDate) {
          matchDate = false;
        }
      } else {
        matchDate = false;
      }
    }

    return matchBook && matchStatus && matchDate;
  });
}

function renderBookFilter() {
  const books = Array.from(new Set(bets.map((bet) => bet.book))).sort();
  const current = bookFilter.value || "all";
  bookFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Todas";
  bookFilter.appendChild(allOption);

  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book;
    option.textContent = book;
    bookFilter.appendChild(option);
  });

  bookFilter.value = books.includes(current) ? current : "all";
}

function renderTable() {
  const data = getFilteredBets();
  betsBody.innerHTML = ""; // Limpa a tabela

  if (data.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.textContent = "Nenhuma aposta cadastrada ainda.";
    row.appendChild(cell);
    betsBody.appendChild(row);
    return;
  }

  data.forEach((bet) => {
    const row = document.createElement("tr");
    const profit = calcProfit(bet);
    const potentialProfit = calcPotentialProfit(bet.stake, bet.odds);

    // Criação segura das colunas
    // 1. Data
    const tdDate = document.createElement("td");
    tdDate.textContent = bet.date;
    row.appendChild(tdDate);

    // 2. Evento (com negrito)
    const tdEvent = document.createElement("td");
    const strongEvent = document.createElement("strong");
    strongEvent.textContent = bet.event; // Aqui usamos textContent para segurança
    tdEvent.appendChild(strongEvent);
    row.appendChild(tdEvent);

    // 3. Odd
    const tdOdds = document.createElement("td");
    tdOdds.textContent = numberFormatter.format(bet.odds);
    row.appendChild(tdOdds);

    // 4. Stake
    const tdStake = document.createElement("td");
    tdStake.textContent = formatStake(bet.stake);
    if (bet.isFreebet) {
      const tag = document.createElement("span");
      tag.classList.add("tag");
      tag.textContent = "Grátis";
      tdStake.appendChild(document.createElement("br"));
      tdStake.appendChild(tag);
    }
    row.appendChild(tdStake);

    // 5. Status
    const tdStatus = document.createElement("td");
    tdStatus.textContent = statusLabel(bet.status);
    row.appendChild(tdStatus);

    // 6. Lucro
    const tdProfit = document.createElement("td");
    tdProfit.textContent = formatProfit(profit);
    row.appendChild(tdProfit);

    // 7. Lucro potencial
    const tdPotential = document.createElement("td");
    tdPotential.textContent = formatProfit(potentialProfit);
    row.appendChild(tdPotential);

    // 8. Casa (Book)
    const tdBook = document.createElement("td");
    tdBook.textContent = bet.book;
    row.appendChild(tdBook);

    // 8.5. IA
    const tdAi = document.createElement("td");
    if (bet.ai) {
      const aiTag = document.createElement("span");
      aiTag.className = "fbet-ai";
      aiTag.textContent = bet.ai;
      tdAi.appendChild(aiTag);
    } else {
      tdAi.textContent = "-";
    }
    row.appendChild(tdAi);

    // 9. Botões de Ação
    const tdActions = document.createElement("td");
    tdActions.className = "actions-cell";
    
    // Botões de ação rápida para status (apenas para apostas pendentes)
    if (bet.status === "pending") {
      tdActions.innerHTML = `
        <div class="quick-status-actions">
          <button type="button" class="action-btn green" data-action="set-win" data-id="${bet.id}" title="Marcar como Green">✓</button>
          <button type="button" class="action-btn red" data-action="set-loss" data-id="${bet.id}" title="Marcar como Red">✗</button>
        </div>
        <div class="main-actions">
          <button type="button" class="ghost small" data-action="edit" data-id="${bet.id}">Editar</button>
          <button type="button" class="ghost small" data-action="delete" data-id="${bet.id}">Excluir</button>
        </div>
      `;
    } else {
      tdActions.innerHTML = `
        <div class="main-actions">
          <button type="button" class="ghost small" data-action="share" data-id="${bet.id}" title="Compartilhar">📱</button>
          <button type="button" class="ghost small" data-action="edit" data-id="${bet.id}">Editar</button>
          <button type="button" class="ghost small" data-action="delete" data-id="${bet.id}">Excluir</button>
        </div>
      `;
    }
    row.appendChild(tdActions);

    betsBody.appendChild(row);
  });
}

function statusLabel(status) {
  const map = {
    pending: "Pendente",
    win: "Green",
    loss: "Red",
    void: "Void",
    cashout: "Cashout",
  };
  return map[status] || status;
}

function renderKpis() {
  // Painel de Inteligência sempre mostra TODAS as apostas, independente dos filtros do histórico
  const allSettled = bets.filter((bet) => bet.status === "win" || bet.status === "loss");
  const totalStake = allSettled.reduce((sum, bet) => sum + bet.stake, 0);
  const totalProfit = allSettled.reduce((sum, bet) => sum + calcProfit(bet), 0);
  const wins = allSettled.filter((bet) => bet.status === "win").length;
  const winrate = allSettled.length ? wins / allSettled.length : 0;

  // ROI = Lucro / Total Apostado
  const roi = totalStake > 0 ? totalProfit / totalStake : 0;

  // Odd média
  const avgOdd = allSettled.length > 0 
    ? allSettled.reduce((sum, bet) => sum + bet.odds, 0) / allSettled.length 
    : 0;

  // Ticket médio (stake média)
  const avgStake = allSettled.length > 0 ? totalStake / allSettled.length : 0;

  // Sequência atual (usa todas as apostas)
  const currentStreak = calcCurrentStreak(bets);

  kpiProfit.textContent = formatProfit(totalProfit);
  kpiWinrate.textContent = percentFormatter.format(winrate);
  
  if (kpiRoi) kpiRoi.textContent = percentFormatter.format(roi);
  if (kpiAvgOdd) kpiAvgOdd.textContent = `${numberFormatter.format(avgOdd)}x`;
  if (kpiAvgStake) kpiAvgStake.textContent = formatStake(avgStake);
  if (kpiTotalStake) kpiTotalStake.textContent = formatStake(totalStake);
  if (kpiTotalBets) kpiTotalBets.textContent = allSettled.length;
  if (kpiStreak) {
    if (currentStreak.count === 0) {
      kpiStreak.textContent = "-";
      kpiStreak.className = "";
    } else {
      const streakEmoji = currentStreak.type === "win" ? "🟢" : "🔴";
      kpiStreak.textContent = `${streakEmoji} ${currentStreak.count}`;
      kpiStreak.className = currentStreak.type === "win" ? "positive" : "negative";
    }
  }

  // Renderizar Total Apostado por Período
  renderStakedPeriod();
}

function renderStakedPeriod() {
  const stakedToday = document.getElementById('staked-today');
  const stakedWeek = document.getElementById('staked-week');
  const stakedMonth = document.getElementById('staked-month');
  const stakedYear = document.getElementById('staked-year');

  if (!stakedToday || !stakedWeek || !stakedMonth || !stakedYear) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Início da semana (domingo)
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  
  // Início do mês
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Início do ano
  const yearStart = new Date(now.getFullYear(), 0, 1);

  let totalToday = 0;
  let totalWeek = 0;
  let totalMonth = 0;
  let totalYear = 0;

  bets.forEach((bet) => {
    const betDate = parseDateForSort(bet.date);
    if (!betDate) return;
    
    const stake = bet.stake || 0;

    // Hoje
    if (betDate >= today) {
      totalToday += stake;
    }
    // Esta semana
    if (betDate >= weekStart) {
      totalWeek += stake;
    }
    // Este mês
    if (betDate >= monthStart) {
      totalMonth += stake;
    }
    // Este ano
    if (betDate >= yearStart) {
      totalYear += stake;
    }
  });

  stakedToday.textContent = formatStake(totalToday);
  stakedWeek.textContent = formatStake(totalWeek);
  stakedMonth.textContent = formatStake(totalMonth);
  stakedYear.textContent = formatStake(totalYear);
}

function calcCurrentStreak(data) {
  // Ordenar por data (mais recente primeiro)
  const sorted = data
    .filter((bet) => bet.status === "win" || bet.status === "loss")
    .slice()
    .sort((a, b) => {
      const aDate = parseDateForSort(a.date);
      const bDate = parseDateForSort(b.date);
      if (aDate && bDate) return bDate - aDate;
      if (aDate) return 1;
      if (bDate) return -1;
      return 0;
    });

  if (sorted.length === 0) return { type: null, count: 0 };

  const firstStatus = sorted[0].status;
  let count = 0;

  for (const bet of sorted) {
    if (bet.status === firstStatus) {
      count++;
    } else {
      break;
    }
  }

  return { type: firstStatus, count };
}

function updateBankrollExposure() {
  const pendingStake = bets
    .filter((bet) => bet.status === "pending" && !bet.isFreebet)
    .reduce((sum, bet) => sum + bet.stake, 0);
  const effective = getEffectiveBankroll();
  const bankroll = Number.isFinite(effective) ? effective : parseLocaleNumber(bankrollInput.value);
  const exposure = bankroll > 0 ? pendingStake / bankroll : 0;

  bankrollProgress.style.width = `${Math.min(exposure * 100, 100)}%`;
  bankrollExposure.textContent = percentFormatter.format(exposure);
  bankrollExposureValue.textContent = `${formatProfit(pendingStake)} expostos`;
}

function handleBankrollInput() {
  const current = parseLocaleNumber(bankrollInput.value);
  if (!Number.isFinite(current)) {
    baseBankroll = null;
    saveBankrollBase();
    updateBankrollExposure();
    return;
  }

  baseBankroll = current - calcSettledProfit() - calcCashflowTotal();
  saveBankrollBase();
  updateBankrollExposure();
}

function renderBalanceChart() {
  const context = document.getElementById("balance-chart");
  if (!context || typeof Chart === "undefined") {
    return;
  }

  // Gráfico sempre mostra TODAS as apostas finalizadas
  const data = bets
    .filter((bet) => bet.status === "win" || bet.status === "loss")
    .slice()
    .sort((a, b) => {
      const aDate = parseDateForSort(a.date);
      const bDate = parseDateForSort(b.date);
      if (aDate && bDate) {
        return aDate - bDate;
      }
      if (aDate) {
        return -1;
      }
      if (bDate) {
        return 1;
      }
      return 0;
    });

  const labels = [];
  const values = [];
  let total = 0;

  data.forEach((bet) => {
    total += calcProfit(bet);
    labels.push(bet.date || bet.event || "-");
    values.push(Number(total.toFixed(2)));
  });

  if (labels.length === 0) {
    labels.push("Sem dados");
    values.push(0);
  }

  if (balanceChart) {
    balanceChart.data.labels = labels;
    balanceChart.data.datasets[0].data = values;
    balanceChart.update();
    return;
  }

  balanceChart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Lucro acumulado",
          data: values,
          borderColor: "#7c5cff",
          backgroundColor: "rgba(124, 92, 255, 0.2)",
          tension: 0.35,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "rgba(245, 247, 255, 0.6)",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
        y: {
          ticks: {
            color: "rgba(245, 247, 255, 0.6)",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.05)",
          },
        },
      },
    },
  });
}

function refreshAll() {
  renderBookFilter();
  renderTable();
  renderKpis();
  updateBankrollDisplay();
  updateBankrollExposure();
  renderBalanceChart();
  renderAIRanking();
  renderWeekdayPerformance();
  renderProfitGoals();
  renderFinalizedBets();
}

function resetForm() {
  form.reset();
  updatePotentialProfit();
  editingId = null;
  submitButton.textContent = "Salvar aposta";
}

function handleSubmit(event) {
  event.preventDefault();

  const rawDate = document.getElementById("bet-date").value.trim();
  const formattedDate = formatDateDisplay(rawDate);
  const oddsValue = parseLocaleNumber(document.getElementById("bet-odds").value);
  const stakeValue = parseLocaleNumber(document.getElementById("bet-stake").value);

  const bet = {
    id: crypto.randomUUID(),
    date: formattedDate,
    event: document.getElementById("bet-event").value.trim(),
    odds: oddsValue,
    stake: stakeValue,
    book: document.getElementById("bet-book").value.trim(),
    status: document.getElementById("bet-status").value,
    isFreebet: document.getElementById("bet-stake-type").value === "freebet",
    ai: document.getElementById("bet-ai").value || null,
  };

  if (!bet.date || !bet.event || !bet.book || !Number.isFinite(bet.odds) || !Number.isFinite(bet.stake)) {
    alert("Preencha todos os campos obrigatórios com data no formato DD/MM/AAAA.");
    return;
  }

  if (editingId) {
    const index = bets.findIndex((item) => item.id === editingId);
    if (index >= 0) {
      bets[index] = { ...bets[index], ...bet };
    }
  } else {
    bets.unshift(bet);
  }
  saveBets();
  refreshAll();
  resetForm();
}

function startEdit(bet) {
  editingId = bet.id;
  document.getElementById("bet-date").value = formatDateForInput(bet.date);
  document.getElementById("bet-event").value = bet.event;
  document.getElementById("bet-odds").value = numberFormatter.format(bet.odds);
  document.getElementById("bet-stake").value = numberFormatter.format(bet.stake);
  document.getElementById("bet-book").value = bet.book;
  document.getElementById("bet-status").value = bet.status;
  document.getElementById("bet-stake-type").value = bet.isFreebet ? "freebet" : "regular";
  document.getElementById("bet-ai").value = bet.ai || "";
  updatePotentialProfit();
  submitButton.textContent = "Atualizar aposta";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === "edit") {
    const bet = bets.find((item) => item.id === id);
    if (bet) {
      startEdit(bet);
    }
    return;
  }

  if (action === "delete") {
    // Show confirmation modal
    const bet = bets.find((item) => item.id === id);
    if (bet) {
      showDeleteConfirmation(bet);
    }
    return;
  }

  // Ações rápidas de status
  if (action === "share") {
    const bet = bets.find((item) => item.id === id);
    if (bet) {
      openShareCardModal(bet);
    }
    return;
  }
  if (action === "set-win") {
    const bet = bets.find((item) => item.id === id);
    if (bet) {
      bet.status = "win";
      saveBets();
      refreshAll();
    }
    return;
  }

  if (action === "set-loss") {
    const bet = bets.find((item) => item.id === id);
    if (bet) {
      bet.status = "loss";
      saveBets();
      refreshAll();
    }
    return;
  }
}

// Calendar state
let calendarDate = new Date();
let calendarView = 'month';

const calendarContainer = document.getElementById('calendar-container');
const calendarTitle = document.getElementById('calendar-title');
const calendarViewSelect = document.getElementById('calendar-view');
const calendarPrev = document.getElementById('calendar-prev');
const calendarNext = document.getElementById('calendar-next');
const calendarPeriodProfit = document.getElementById('calendar-period-profit');
const calendarPositiveDays = document.getElementById('calendar-positive-days');
const calendarNegativeDays = document.getElementById('calendar-negative-days');

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getProfitByDate(dateKey) {
  return bets
    .filter((bet) => {
      if (bet.status !== 'win' && bet.status !== 'loss') return false;
      const betDate = parseDateForSort(bet.date);
      if (!betDate) return false;
      const betKey = `${betDate.getFullYear()}-${String(betDate.getMonth() + 1).padStart(2, '0')}-${String(betDate.getDate()).padStart(2, '0')}`;
      return betKey === dateKey;
    })
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function getProfitByMonth(year, month) {
  return bets
    .filter((bet) => {
      if (bet.status !== 'win' && bet.status !== 'loss') return false;
      const betDate = parseDateForSort(bet.date);
      if (!betDate) return false;
      return betDate.getFullYear() === year && betDate.getMonth() === month;
    })
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function getProfitByYear(year) {
  return bets
    .filter((bet) => {
      if (bet.status !== 'win' && bet.status !== 'loss') return false;
      const betDate = parseDateForSort(bet.date);
      if (!betDate) return false;
      return betDate.getFullYear() === year;
    })
    .reduce((sum, bet) => sum + calcProfit(bet), 0);
}

function getBetsCountByMonth(year, month) {
  return bets.filter((bet) => {
    if (bet.status !== 'win' && bet.status !== 'loss') return false;
    const betDate = parseDateForSort(bet.date);
    if (!betDate) return false;
    return betDate.getFullYear() === year && betDate.getMonth() === month;
  }).length;
}

function renderMonthCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();
  
  calendarTitle.textContent = `${MONTH_NAMES[month]} ${year}`;
  calendarContainer.className = 'calendar-grid';
  calendarContainer.innerHTML = '';

  // Render day headers
  DAY_NAMES.forEach((day) => {
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.textContent = day;
    calendarContainer.appendChild(header);
  });

  // Get first day of month and total days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let periodProfit = 0;
  let positiveDays = 0;
  let negativeDays = 0;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    calendarContainer.appendChild(empty);
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const profit = getProfitByDate(dateKey);
    periodProfit += profit;

    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';

    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    if (isToday) {
      dayEl.classList.add('today');
    }

    if (profit > 0) {
      dayEl.classList.add('positive');
      positiveDays++;
    } else if (profit < 0) {
      dayEl.classList.add('negative');
      negativeDays++;
    }

    const dayNumber = document.createElement('span');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayEl.appendChild(dayNumber);

    if (profit !== 0) {
      const dayProfit = document.createElement('span');
      dayProfit.className = `day-profit ${profit > 0 ? 'positive' : 'negative'}`;
      dayProfit.textContent = profit > 0 ? `+${currencyFormatter.format(profit).replace('R$', '')}` : currencyFormatter.format(profit).replace('R$', '');
      dayEl.appendChild(dayProfit);
    }

    dayEl.title = `${day}/${month + 1}/${year}: ${formatProfit(profit)} - Clique para ver detalhes`;
    dayEl.style.cursor = 'pointer';
    
    // Add click event to open modal
    const clickDateKey = dateKey;
    const clickDisplayDate = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    dayEl.addEventListener('click', () => {
      openDayModal(clickDateKey, clickDisplayDate);
    });

    calendarContainer.appendChild(dayEl);
  }

  // Update summary
  calendarPeriodProfit.textContent = formatProfit(periodProfit);
  calendarPeriodProfit.className = periodProfit >= 0 ? 'positive' : 'negative';
  calendarPositiveDays.textContent = positiveDays;
  calendarNegativeDays.textContent = negativeDays;
}

function renderYearCalendar() {
  const year = calendarDate.getFullYear();
  
  calendarTitle.textContent = `${year}`;
  calendarContainer.className = 'calendar-grid year-view';
  calendarContainer.innerHTML = '';

  let periodProfit = 0;
  let positiveMonths = 0;
  let negativeMonths = 0;

  for (let month = 0; month < 12; month++) {
    const profit = getProfitByMonth(year, month);
    const betsCount = getBetsCountByMonth(year, month);
    periodProfit += profit;

    const card = document.createElement('div');
    card.className = 'calendar-month-card';

    if (profit > 0) {
      card.classList.add('positive');
      positiveMonths++;
    } else if (profit < 0) {
      card.classList.add('negative');
      negativeMonths++;
    }

    const monthName = document.createElement('div');
    monthName.className = 'month-name';
    monthName.textContent = MONTH_NAMES[month];
    card.appendChild(monthName);

    const monthProfit = document.createElement('div');
    monthProfit.className = `month-profit ${profit > 0 ? 'positive' : profit < 0 ? 'negative' : ''}`;
    monthProfit.textContent = formatProfit(profit);
    card.appendChild(monthProfit);

    const monthStats = document.createElement('div');
    monthStats.className = 'month-stats';
    monthStats.textContent = `${betsCount} aposta${betsCount !== 1 ? 's' : ''}`;
    card.appendChild(monthStats);

    card.addEventListener('click', () => {
      calendarDate = new Date(year, month, 1);
      calendarView = 'month';
      calendarViewSelect.value = 'month';
      renderCalendar();
    });

    calendarContainer.appendChild(card);
  }

  // Update summary
  calendarPeriodProfit.textContent = formatProfit(periodProfit);
  calendarPeriodProfit.className = periodProfit >= 0 ? 'positive' : 'negative';
  calendarPositiveDays.textContent = positiveMonths;
  calendarNegativeDays.textContent = negativeMonths;

  // Update labels for year view
  document.querySelector('.calendar-kpi:nth-child(2) span').textContent = 'Meses Positivos';
  document.querySelector('.calendar-kpi:nth-child(3) span').textContent = 'Meses Negativos';
}

function renderCalendar() {
  if (!calendarContainer) return;

  // Reset labels
  const kpiLabels = document.querySelectorAll('.calendar-kpi span');
  if (kpiLabels.length >= 3) {
    kpiLabels[1].textContent = calendarView === 'year' ? 'Meses Positivos' : 'Dias Positivos';
    kpiLabels[2].textContent = calendarView === 'year' ? 'Meses Negativos' : 'Dias Negativos';
  }

  if (calendarView === 'month') {
    renderMonthCalendar();
  } else {
    renderYearCalendar();
  }
}

function handleCalendarNavigation(direction) {
  if (calendarView === 'month') {
    calendarDate.setMonth(calendarDate.getMonth() + direction);
  } else {
    calendarDate.setFullYear(calendarDate.getFullYear() + direction);
  }
  renderCalendar();
}

// Modal functions
function getBetsByDateKey(dateKey) {
  return bets.filter((bet) => {
    const betDate = parseDateForSort(bet.date);
    if (!betDate) return false;
    const betKey = `${betDate.getFullYear()}-${String(betDate.getMonth() + 1).padStart(2, '0')}-${String(betDate.getDate()).padStart(2, '0')}`;
    return betKey === dateKey;
  });
}

function openDayModal(dateKey, displayDate) {
 if (!dayModal) return;

  const dayBets = getBetsByDateKey(dateKey);
  
  // Guardar dados para o compartilhamento
  dayModal._currentDateKey = dateKey;
  dayModal._currentDisplayDate = displayDate;
  dayModal._currentBets = dayBets;

  // Atualizar Título e adicionar botão de compartilhar
  const headerContainer = dayModal.querySelector('.modal-header');
  // Limpa o header atual e recria para garantir que não duplique botões
  headerContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <h3 id="modal-title">Apostas - ${displayDate}</h3>
      <button type="button" class="ghost small" id="share-day-btn" title="Compartilhar Resumo do Dia">
        📱 Compartilhar
      </button>
    </div>
    <button type="button" class="modal-close" id="modal-close">&times;</button>
  `;

  // Reconectar o evento de fechar (pois recriamos o botão close)
  document.getElementById('modal-close').addEventListener('click', closeDayModal);
  
  // Conectar o evento do novo botão de compartilhar
  document.getElementById('share-day-btn').addEventListener('click', () => {
    openShareDayModal(displayDate, dayBets);
  });

  const modalSummary = document.getElementById("modal-summary");
  const modalBetsList = document.getElementById("modal-bets-list");

  // Calculate summary
  const settled = dayBets.filter(b => b.status === 'win' || b.status === 'loss');
  const wins = dayBets.filter(b => b.status === 'win').length;
  const losses = dayBets.filter(b => b.status === 'loss').length;
  const totalProfit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);

  modalSummary.innerHTML = `
    <div class="modal-stat">
      <span>Apostas</span>
      <strong>${dayBets.length}</strong>
    </div>
    <div class="modal-stat ${wins > 0 ? 'positive' : ''}">
      <span>Greens</span>
      <strong>${wins}</strong>
    </div>
    <div class="modal-stat ${losses > 0 ? 'negative' : ''}">
      <span>Reds</span>
      <strong>${losses}</strong>
    </div>
    <div class="modal-stat ${totalProfit >= 0 ? 'positive' : 'negative'}">
      <span>Lucro</span>
      <strong>${formatProfit(totalProfit)}</strong>
    </div>
  `;

  // Render bets list
  if (dayBets.length === 0) {
    modalBetsList.innerHTML = '<div class="modal-empty">Nenhuma aposta neste dia.</div>';
  } else {
    modalBetsList.innerHTML = dayBets.map(bet => {
      const profit = calcProfit(bet);
      const profitClass = profit > 0 ? 'positive' : profit < 0 ? 'negative' : '';
      return `
        <div class="modal-bet-item">
          <div class="modal-bet-header">
            <span class="modal-bet-event">${bet.event}</span>
            <span class="modal-bet-status ${bet.status}">${statusLabel(bet.status)}</span>
          </div>
          <div class="modal-bet-details">
            <span>Odd: <strong>${numberFormatter.format(bet.odds)}x</strong></span>
            <span>Stake: <strong>${formatStake(bet.stake)}</strong></span>
            <span>Casa: <strong>${bet.book}</strong></span>
            <span class="modal-bet-profit ${profitClass}">Lucro: ${formatProfit(profit)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  dayModal.style.display = 'flex';
}
//termina aqui a func
function closeDayModal() {
  if (dayModal) {
    dayModal.style.display = 'none';
  }
}

// Modal event listeners
modalClose?.addEventListener('click', closeDayModal);
dayModal?.addEventListener('click', (e) => {
  if (e.target === dayModal) {
    closeDayModal();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDayModal();
    closeDeleteModal();
    if (typeof closePdfModal === 'function') closePdfModal();
    if (typeof closeShareModal === 'function') closeShareModal();
  }
});
function openShareDayModal(date, betsList) {
  if (!shareModal || !shareCardCanvas) return;
  
  // Renderiza o card específico do dia
  renderDayShareCard(date, betsList);
  
  // Limpa a referência de aposta única para evitar conflitos no botão nativo
  shareModal._currentBet = null; 
  shareModal.style.display = 'flex';
}

function renderDayShareCard(dateString, betsList) {
  const canvas = shareCardCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Aumentamos a altura para caber a lista (formato Story/Portrait: 1080x1350)
  const w = 1080;
  const h = 1350; 
  canvas.width = w;
  canvas.height = h;

  // 1. Fundo (Gradiente Dark)
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#0b1020');
  bgGrad.addColorStop(0.5, '#161b33');
  bgGrad.addColorStop(1, '#0b1020');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Decoração de fundo (Círculos)
  ctx.beginPath();
  ctx.arc(0, 0, 400, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(124, 92, 255, 0.08)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(w, h, 350, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(45, 212, 191, 0.08)';
  ctx.fill();

  // Cálculos do Dia
  const settled = betsList.filter(b => b.status === 'win' || b.status === 'loss');
  const wins = settled.filter(b => b.status === 'win').length;
  const losses = settled.filter(b => b.status === 'loss').length;
  const totalProfit = settled.reduce((sum, b) => sum + calcProfit(b), 0);
  const totalStake = settled.reduce((sum, b) => sum + b.stake, 0);
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
  const isPositive = totalProfit >= 0;

  let y = 80;

  // 2. Cabeçalho: Data
  ctx.fillStyle = 'rgba(245, 247, 255, 0.6)';
  ctx.font = '600 32px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`RESUMO DO DIA • ${dateString}`, w / 2, y);
  
  y += 100;

  // 3. Lucro Total em Destaque
  const profitColor = isPositive ? '#22c55e' : '#ff6b6b';
  const profitBg = isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 107, 107, 0.1)';
  
  // Card do Lucro
  ctx.fillStyle = profitBg;
  roundRect(ctx, 140, y - 60, w - 280, 140, 24);
  ctx.fill();
  ctx.strokeStyle = profitColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = profitColor;
  ctx.font = 'bold 80px Inter, sans-serif';
  ctx.textAlign = 'center';
  // Centralizar verticalmente no box
  ctx.fillText(`${totalProfit >= 0 ? '+' : ''}${currencyFormatter.format(totalProfit)}`, w / 2, y + 40);

  y += 140;

  // 4. Grid de Estatísticas (Wins, Reds, ROI)
  const cardsY = y + 40;
  const cardW = 240;
  const cardH = 120;
  const gap = 40;
  const startX = (w - (cardW * 3 + gap * 2)) / 2;

  // Card Wins
  drawMiniStatCard(ctx, startX, cardsY, cardW, cardH, '✅ Greens', wins.toString(), '#22c55e');
  // Card Reds
  drawMiniStatCard(ctx, startX + cardW + gap, cardsY, cardW, cardH, '❌ Reds', losses.toString(), '#ff6b6b');
  // Card ROI
  const roiColor = roi >= 0 ? '#22c55e' : '#ff6b6b';
  drawMiniStatCard(ctx, startX + (cardW + gap) * 2, cardsY, cardW, cardH, '📈 ROI', `${roi.toFixed(1)}%`, roiColor);

  y = cardsY + cardH + 60;

  // 5. Lista de Apostas (Top lista)
  ctx.fillStyle = '#f5f7ff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('📋 Histórico do Dia', 80, y);
  
  // Linha divisória
  y += 20;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(w - 80, y);
  ctx.stroke();
  
  y += 40;

  // Ordenar: Wins primeiro, depois losses (ou cronológico se preferir)
  // Vamos priorizar os maiores lucros/perdas para mostrar o que importa
  const sortedBets = [...settled].sort((a, b) => Math.abs(calcProfit(b)) - Math.abs(calcProfit(a)));
  
  // Mostrar no máximo 6 apostas para caber
  const maxBetsToShow = 6;
  const betsToShow = sortedBets.slice(0, maxBetsToShow);

  betsToShow.forEach(bet => {
    const bProfit = calcProfit(bet);
    const bColor = bProfit >= 0 ? '#22c55e' : '#ff6b6b';
    const bIcon = bProfit >= 0 ? '✅' : '❌';
    
    // Fundo da linha
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    roundRect(ctx, 80, y, w - 160, 90, 12);
    ctx.fill();

    // Icone
    ctx.font = '30px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(bIcon, 100, y + 55);

    // Evento (Truncado)
    ctx.font = '600 28px Inter, sans-serif';
    ctx.fillStyle = '#f5f7ff';
    let eventName = bet.event;
    if (ctx.measureText(eventName).width > 550) {
      while (ctx.measureText(eventName + '...').width > 550) {
        eventName = eventName.slice(0, -1);
      }
      eventName += '...';
    }
    ctx.fillText(eventName, 160, y + 55);

    // Odd
    ctx.font = '400 24px Inter, sans-serif';
    ctx.fillStyle = 'rgba(245, 247, 255, 0.6)';
    ctx.fillText(`@${numberFormatter.format(bet.odds)}`, 740, y + 55);

    // Valor Lucro
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillStyle = bColor;
    ctx.textAlign = 'right';
    ctx.fillText(formatProfit(bProfit), w - 100, y + 55);

    y += 105;
  });

  // Se houver mais apostas que não couberam
  if (sortedBets.length > maxBetsToShow) {
    ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
    ctx.font = 'italic 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`... e mais ${sortedBets.length - maxBetsToShow} apostas`, w / 2, y + 20);
  } else if (sortedBets.length === 0) {
    ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
    ctx.font = 'italic 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Nenhuma aposta finalizada neste dia`, w / 2, y + 40);
  }

  // Footer
  ctx.fillStyle = 'rgba(245, 247, 255, 0.3)';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Caderneta de Apostas', w / 2, h - 50);
}

function drawMiniStatCard(ctx, x, y, w, h, label, value, color) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  
  ctx.fillStyle = 'rgba(245, 247, 255, 0.6)';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 40);

  ctx.fillStyle = color;
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText(value, x + w / 2, y + 90);
}
function init() {
  loadBets();
  loadCashflows();
  loadSettings();
  loadBankrollBase();
  loadGoals();
  applySettings();
  updatePotentialProfit();
  refreshAll();
  renderCalendar();
  loadQuickNotes();
}

// ========================
// DELETE CONFIRMATION
// ========================
const deleteModal = document.getElementById('delete-modal');
const deleteModalClose = document.getElementById('delete-modal-close');
const deleteModalCancel = document.getElementById('delete-modal-cancel');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');
const deleteModalBetInfo = document.getElementById('delete-modal-bet-info');

function showDeleteConfirmation(bet) {
  if (!deleteModal) return;
  deletePendingId = bet.id;
  const profit = calcProfit(bet);
  deleteModalBetInfo.innerHTML = `
    <div class="modal-bet-header">
      <span class="modal-bet-event">${bet.event}</span>
      <span class="modal-bet-status ${bet.status}">${statusLabel(bet.status)}</span>
    </div>
    <div class="modal-bet-details">
      <span>Data: <strong>${bet.date}</strong></span>
      <span>Odd: <strong>${numberFormatter.format(bet.odds)}x</strong></span>
      <span>Stake: <strong>${formatStake(bet.stake)}</strong></span>
      <span>Casa: <strong>${bet.book}</strong></span>
      ${bet.ai ? `<span>IA: <strong>${bet.ai}</strong></span>` : ''}
    </div>
  `;
  deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
  if (deleteModal) {
    deleteModal.style.display = 'none';
    deletePendingId = null;
  }
}

deleteModalClose?.addEventListener('click', closeDeleteModal);
deleteModalCancel?.addEventListener('click', closeDeleteModal);
deleteModal?.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

deleteModalConfirm?.addEventListener('click', () => {
  if (deletePendingId) {
    bets = bets.filter((bet) => bet.id !== deletePendingId);
    saveBets();
    refreshAll();
    closeDeleteModal();
  }
});

// ========================
// AI RANKING
// ========================
  function renderAIRanking() {
  const container = document.getElementById('ai-ranking-grid');
  if (!container) return;

  // 1. MUDANÇA VISUAL: Aqui colocamos 'Claude' para aparecer escrito na tela
  const aiNames = ['Grok', 'Gemini', 'Claude']; 
  
  const aiStats = aiNames.map(name => {
    
    // 2. O TRUQUE: Buscamos apostas que tenham o nome atual OU o nome antigo
    const aiBets = bets.filter(b => {
        // Verifica se a aposta já está salva como 'Claude' (novas)
        const isNewName = b.ai === name;
        
        // Verifica se estamos buscando o 'Claude', mas a aposta é antiga ('Opus 4')
        const isLegacyName = (name === 'Claude' && b.ai === 'Opus 4'); 
        
        // Aceita se for uma ou outra, desde que a aposta esteja finalizada (win/loss)
        return (isNewName || isLegacyName) && (b.status === 'win' || b.status === 'loss');
    });

    const wins = aiBets.filter(b => b.status === 'win').length;
    const losses = aiBets.filter(b => b.status === 'loss').length;
    const total = aiBets.length;
    const winrate = total > 0 ? wins / total : 0;
    const profit = aiBets.reduce((sum, b) => sum + calcProfit(b), 0);
    
    return { name, wins, losses, total, winrate, profit };
  });

  // Ordenação (quem tem mais taxa de acerto fica em primeiro)
  aiStats.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    return b.total - a.total;
  });

  const medals = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'];

  container.innerHTML = aiStats.map((ai, index) => `
    <div class="ai-ranking-card ${index === 0 && ai.total > 0 ? 'first' : ''}">
      <span class="ai-medal">${medals[index] || ''}</span>
      <span class="ai-name">${ai.name}</span>
      <div class="ai-stats">
        <span class="ai-winrate">${ai.total > 0 ? percentFormatter.format(ai.winrate) : '-'}</span>
        <span>Taxa de acerto</span>
        <div class="ai-record">
          <span class="ai-green">${ai.wins}W</span>
          <span class="ai-red">${ai.losses}L</span>
        </div>
        <span>Lucro: <strong style="color: ${ai.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatProfit(ai.profit)}</strong></span>
      </div>
    </div>
  `).join('');
}
 

// ========================
// WEEKDAY PERFORMANCE
// ========================
function renderWeekdayPerformance() {
  const container = document.getElementById('weekday-grid');
  if (!container) return;

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b'];
  const dayFullNames = ['Domingo', 'Segunda', 'Ter\u00e7a', 'Quarta', 'Quinta', 'Sexta', 'S\u00e1bado'];

  const dayStats = dayNames.map((_, index) => {
    const dayBets = bets.filter(b => {
      if (b.status !== 'win' && b.status !== 'loss') return false;
      const betDate = parseDateForSort(b.date);
      if (!betDate) return false;
      return betDate.getDay() === index;
    });
    const wins = dayBets.filter(b => b.status === 'win').length;
    const total = dayBets.length;
    const winrate = total > 0 ? wins / total : 0;
    const profit = dayBets.reduce((sum, b) => sum + calcProfit(b), 0);
    return { dayIndex: index, name: dayNames[index], fullName: dayFullNames[index], wins, total, winrate, profit };
  });

  // Find best and worst days
  const daysWithBets = dayStats.filter(d => d.total > 0);
  let bestDay = null;
  let worstDay = null;
  if (daysWithBets.length > 0) {
    bestDay = daysWithBets.reduce((a, b) => a.profit > b.profit ? a : b).dayIndex;
    worstDay = daysWithBets.reduce((a, b) => a.profit < b.profit ? a : b).dayIndex;
  }

  container.innerHTML = dayStats.map(day => {
    const isBest = day.dayIndex === bestDay;
    const isWorst = day.dayIndex === worstDay && bestDay !== worstDay;
    const profitClass = day.profit > 0 ? 'positive' : day.profit < 0 ? 'negative' : '';
    return `
      <div class="weekday-card ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}">
        <span class="weekday-name">${day.name}</span>
        <span class="weekday-profit ${profitClass}">${day.total > 0 ? formatProfit(day.profit) : '-'}</span>
        <span class="weekday-detail">${day.total} aposta${day.total !== 1 ? 's' : ''}</span>
        <span class="weekday-winrate">${day.total > 0 ? percentFormatter.format(day.winrate) : '-'}</span>
        ${isBest ? '<span style="font-size:0.65rem;color:var(--success)">\u2b50 Melhor</span>' : ''}
        ${isWorst ? '<span style="font-size:0.65rem;color:var(--danger)">\u26a0\ufe0f Pior</span>' : ''}
      </div>
    `;
  }).join('');
}

// ========================
// PROFIT GOALS
// ========================
let profitGoals = { weekly: 0, monthly: 0 };

function loadGoals() {
  const raw = localStorage.getItem(getGoalsKey());
  if (raw) {
    try {
      profitGoals = JSON.parse(raw);
    } catch (e) {
      profitGoals = { weekly: 0, monthly: 0 };
    }
  }
  // Set input values
  const weeklyInput = document.getElementById('weekly-goal-input');
  const monthlyInput = document.getElementById('monthly-goal-input');
  if (weeklyInput && profitGoals.weekly > 0) weeklyInput.value = numberFormatter.format(profitGoals.weekly);
  if (monthlyInput && profitGoals.monthly > 0) monthlyInput.value = numberFormatter.format(profitGoals.monthly);
}

function saveGoals() {
  localStorage.setItem(getGoalsKey(), JSON.stringify(profitGoals));
}

function renderProfitGoals() {
  const now = new Date();
  
  // Week start (Sunday)
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  
  // Month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Calculate weekly profit
  const weeklyProfit = bets
    .filter(b => {
      if (b.status !== 'win' && b.status !== 'loss') return false;
      const d = parseDateForSort(b.date);
      return d && d >= weekStart;
    })
    .reduce((sum, b) => sum + calcProfit(b), 0);

  // Calculate monthly profit
  const monthlyProfit = bets
    .filter(b => {
      if (b.status !== 'win' && b.status !== 'loss') return false;
      const d = parseDateForSort(b.date);
      return d && d >= monthStart;
    })
    .reduce((sum, b) => sum + calcProfit(b), 0);

  // Update weekly
  const weeklyGoalCurrent = document.getElementById('weekly-goal-current');
  const weeklyGoalTarget = document.getElementById('weekly-goal-target');
  const weeklyGoalBar = document.getElementById('weekly-goal-bar');
  const weeklyGoalPercent = document.getElementById('weekly-goal-percent');

  if (weeklyGoalCurrent) weeklyGoalCurrent.textContent = formatProfit(weeklyProfit);
  if (weeklyGoalTarget) weeklyGoalTarget.textContent = `de ${formatProfit(profitGoals.weekly)}`;
  
  const weeklyPct = profitGoals.weekly > 0 ? Math.max(0, (weeklyProfit / profitGoals.weekly) * 100) : 0;
  if (weeklyGoalBar) {
    weeklyGoalBar.style.width = `${Math.min(weeklyPct, 100)}%`;
    weeklyGoalBar.className = `progress-bar ${weeklyPct >= 100 ? 'exceeded' : ''}`;
  }
  if (weeklyGoalPercent) {
    weeklyGoalPercent.textContent = `${Math.round(weeklyPct)}%`;
    weeklyGoalPercent.className = `profit-goal-percent ${weeklyPct >= 100 ? 'reached' : ''}`;
  }

  // Update monthly
  const monthlyGoalCurrent = document.getElementById('monthly-goal-current');
  const monthlyGoalTarget = document.getElementById('monthly-goal-target');
  const monthlyGoalBar = document.getElementById('monthly-goal-bar');
  const monthlyGoalPercent = document.getElementById('monthly-goal-percent');

  if (monthlyGoalCurrent) monthlyGoalCurrent.textContent = formatProfit(monthlyProfit);
  if (monthlyGoalTarget) monthlyGoalTarget.textContent = `de ${formatProfit(profitGoals.monthly)}`;
  
  const monthlyPct = profitGoals.monthly > 0 ? Math.max(0, (monthlyProfit / profitGoals.monthly) * 100) : 0;
  if (monthlyGoalBar) {
    monthlyGoalBar.style.width = `${Math.min(monthlyPct, 100)}%`;
    monthlyGoalBar.className = `progress-bar ${monthlyPct >= 100 ? 'exceeded' : ''}`;
  }
  if (monthlyGoalPercent) {
    monthlyGoalPercent.textContent = `${Math.round(monthlyPct)}%`;
    monthlyGoalPercent.className = `profit-goal-percent ${monthlyPct >= 100 ? 'reached' : ''}`;
  }
}

// Goal input listeners
const weeklyGoalInput = document.getElementById('weekly-goal-input');
const monthlyGoalInput = document.getElementById('monthly-goal-input');

weeklyGoalInput?.addEventListener('input', () => {
  profitGoals.weekly = parseLocaleNumber(weeklyGoalInput.value) || 0;
  saveGoals();
  renderProfitGoals();
});

monthlyGoalInput?.addEventListener('input', () => {
  profitGoals.monthly = parseLocaleNumber(monthlyGoalInput.value) || 0;
  saveGoals();
  renderProfitGoals();
});

// ========================
// FINALIZED BETS LIST
// ========================
function renderFinalizedBets() {
  const container = document.getElementById('finalized-bets-list');
  if (!container) return;

  const settled = bets
    .filter(b => b.status === 'win' || b.status === 'loss')
    .slice()
    .sort((a, b) => {
      const aDate = parseDateForSort(a.date);
      const bDate = parseDateForSort(b.date);
      if (aDate && bDate) return bDate - aDate;
      return 0;
    });

  if (settled.length === 0) {
    container.innerHTML = '<p class="empty-message">Nenhuma aposta finalizada ainda.</p>';
    return;
  }

  container.innerHTML = settled.map(bet => {
    const profit = calcProfit(bet);
    const profitClass = profit > 0 ? 'positive' : profit < 0 ? 'negative' : '';
    return `
      <div class="finalized-bet-item">
        <span class="fbet-date">${bet.date}</span>
        <span class="fbet-event">${bet.event}</span>
        <span class="fbet-odd">${numberFormatter.format(bet.odds)}x</span>
        ${bet.ai ? `<span class="fbet-ai">${bet.ai}</span>` : ''}
        <span class="fbet-status-badge ${bet.status}">${statusLabel(bet.status)}</span>
        <span class="fbet-profit ${profitClass}">${formatProfit(profit)}</span>
      </div>
    `;
  }).join('');
}

// Quick Notes (Anotações Rápidas)
function loadQuickNotes() {
  const notesTextarea = document.getElementById("quick-notes");
  if (!notesTextarea) return;
  
  const saved = localStorage.getItem(getNotesKey());
  notesTextarea.value = saved || "";
}

function saveQuickNotes() {
  const notesTextarea = document.getElementById("quick-notes");
  const notesStatus = document.getElementById("quick-notes-status");
  if (!notesTextarea) return;
  
  localStorage.setItem(getNotesKey(), notesTextarea.value);
  if (notesStatus) {
    notesStatus.textContent = "✓ Salvo";
    notesStatus.className = "notes-status saved";
    setTimeout(() => {
      notesStatus.textContent = "";
      notesStatus.className = "notes-status";
    }, 2000);
  }
}

// Auto-save anotações ao digitar (debounce)
let quickNotesTimeout = null;
const quickNotesTextarea = document.getElementById("quick-notes");
quickNotesTextarea?.addEventListener("input", () => {
  const notesStatus = document.getElementById("quick-notes-status");
  if (notesStatus) {
    notesStatus.textContent = "...";
    notesStatus.className = "notes-status";
  }
  
  clearTimeout(quickNotesTimeout);
  quickNotesTimeout = setTimeout(() => {
    saveQuickNotes();
  }, 1000);
});

form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);

["bet-stake", "bet-odds"].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("input", updatePotentialProfit);
});

bankrollInput.addEventListener("input", handleBankrollInput);
bookFilter.addEventListener("change", refreshAll);
statusFilter?.addEventListener("change", refreshAll);
dateFilterStart?.addEventListener("change", refreshAll);
dateFilterEnd?.addEventListener("change", refreshAll);
clearDateFilter?.addEventListener("click", () => {
  if (dateFilterStart) dateFilterStart.value = "";
  if (dateFilterEnd) dateFilterEnd.value = "";
  refreshAll();
});
betsBody.addEventListener("click", handleTableClick);

// Calendar event listeners
calendarViewSelect?.addEventListener('change', (e) => {
  calendarView = e.target.value;
  renderCalendar();
});

calendarPrev?.addEventListener('click', () => handleCalendarNavigation(-1));
calendarNext?.addEventListener('click', () => handleCalendarNavigation(1));

// ========================
// IMPORTAÇÃO DE CUPOM - OCR GRATUITO + GEMINI OPCIONAL
// ========================
const GEMINI_API_KEY_STORAGE = "caderneta.gemini.apikey";
const importCouponBtn = document.getElementById("import-coupon-btn");
const couponFileInput = document.getElementById("coupon-file-input");
const importStatus = document.getElementById("import-status");
const importProgress = document.getElementById("import-progress");
const importProgressBar = document.getElementById("import-progress-bar");
const importProgressText = document.getElementById("import-progress-text");

function showImportStatus(message, type) {
  if (!importStatus) return;
  
  importStatus.textContent = message;
  importStatus.className = `import-status show ${type}`;
  
  if (type !== "info") {
    setTimeout(() => {
      importStatus.className = "import-status";
    }, 8000);
  }
}

function showProgress(percent, text) {
  if (!importProgress) return;
  importProgress.style.display = "block";
  if (importProgressBar) importProgressBar.style.width = `${percent}%`;
  if (importProgressText) importProgressText.textContent = text || `${Math.round(percent)}%`;
}

function hideProgress() {
  if (importProgress) importProgress.style.display = "none";
}

function getGeminiApiKey() {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE);
}

// ---- PARSER DE TEXTO OCR ----
function parseBetFromText(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const fullText = lines.join(" ");
  
  const result = {
    evento: null,
    odd: null,
    stake: null,
    casa: null,
    data: null,
    tipo_aposta: null,
  };
  
  // Detectar casa de apostas
  const casas = [
    { patterns: ["bet365"], name: "Bet365" },
    { patterns: ["betano"], name: "Betano" },
    { patterns: ["sportingbet"], name: "Sportingbet" },
    { patterns: ["betfair"], name: "Betfair" },
    { patterns: ["pixbet"], name: "PixBet" },
    { patterns: ["stake"], name: "Stake" },
    { patterns: ["pinnacle"], name: "Pinnacle" },
    { patterns: ["1xbet"], name: "1xBet" },
    { patterns: ["novibet"], name: "Novibet" },
    { patterns: ["betnacional"], name: "BetNacional" },
    { patterns: ["estrela ?bet"], name: "EstrelaBet" },
    { patterns: ["casa ?de ?apostas", "casadeapostas"], name: "Casa de Apostas" },
    { patterns: ["superbet"], name: "Superbet" },
    { patterns: ["f12\\.?bet", "f12bet"], name: "F12.bet" },
    { patterns: ["galera\\.?bet", "galerabet"], name: "Galera.bet" },
    { patterns: ["mr\\.?jack", "mrjack"], name: "Mr. Jack Bet" },
    { patterns: ["parimatch"], name: "Parimatch" },
    { patterns: ["rivalry"], name: "Rivalry" },
    { patterns: ["luva\\.?bet", "luvabet"], name: "Luva.bet" },
    { patterns: ["aposta ?ganha"], name: "Aposta Ganha" },
  ];
  
  const lowerText = fullText.toLowerCase();
  for (const casa of casas) {
    for (const pattern of casa.patterns) {
      if (new RegExp(pattern, "i").test(lowerText)) {
        result.casa = casa.name;
        break;
      }
    }
    if (result.casa) break;
  }
  
  // Detectar data (DD/MM/AAAA ou DD/MM/AA ou DD.MM.AAAA)
  const dateMatch = fullText.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (dateMatch) {
    let [, day, month, year] = dateMatch;
    if (year.length === 2) year = "20" + year;
    result.data = `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  }
  
  // --- DETECTAR STAKE (valores com R$) ---
  const valoresMonetarios = new Set();
  const monetaryRegex = /R\$\s*(\d+[.,]?\d*)/gi;
  let mMatch;
  while ((mMatch = monetaryRegex.exec(fullText)) !== null) {
    const val = parseFloat(mMatch[1].replace(",", "."));
    if (val > 0) valoresMonetarios.add(val);
  }
  
  const stakeMatch = fullText.match(/(?:simples|aposta)\s+R?\$?\s*(\d+[.,]?\d*)/i)
    || fullText.match(/(?:aposta|valor|stake|investido)\s*[:=]?\s*R?\$?\s*(\d+[.,]?\d*)/i)
    || fullText.match(/R\$\s*(\d+[.,]?\d*)/i);
  if (stakeMatch) {
    const val = parseFloat(stakeMatch[1].replace(",", "."));
    if (val > 0 && val < 100000) result.stake = val;
  }
  
  // --- DETECTAR ODD ---
  // Coletar TODOS os números decimais do texto inteiro
  const todosNumeros = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Encontrar todos os números decimais na linha
    const regex = /(\d{1,3})[.,](\d{1,3})/g;
    let numMatch;
    while ((numMatch = regex.exec(line)) !== null) {
      const raw = numMatch[0];
      const val = parseFloat(raw.replace(",", "."));
      // Verificar se NÃO é precedido por R$ na mesma posição
      const before = line.substring(Math.max(0, numMatch.index - 3), numMatch.index);
      const isPrecededByRS = /R\$\s*$/.test(before);
      // Verificar se NÃO faz parte de um ID longo (número com mais de 5 dígitos)
      // Checar apenas caracteres IMEDIATAMENTE adjacentes (sem espaço)
      const charBefore = numMatch.index > 0 ? line[numMatch.index - 1] : ' ';
      const charAfter = numMatch.index + raw.length < line.length ? line[numMatch.index + raw.length] : ' ';
      const isPartOfLongNumber = /\d/.test(charBefore) || /\d/.test(charAfter);
      // Verificar se NÃO faz parte de uma data
      const isDate = /\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/.test(
        line.substring(Math.max(0, numMatch.index - 6), numMatch.index + raw.length + 6)
      );
      // Verificar se NÃO faz parte de horário (HH:MM)
      const isTime = /\d{1,2}:\d{2}/.test(
        line.substring(Math.max(0, numMatch.index - 3), numMatch.index + raw.length + 3)
      );
      
      // Verificar se faz parte de um nome de mercado (ex: "Mais de 3.5", "Over 2.5", "Menos de 1.5")
      const beforeMarket = line.substring(Math.max(0, numMatch.index - 15), numMatch.index);
      const isMarketNumber = /(?:mais\s+de|menos\s+de|over|under|acima\s+de|abaixo\s+de|[+-])\s*$/i.test(beforeMarket);
      
      todosNumeros.push({
        val,
        raw,
        line: i,
        isPrecededByRS,
        isPartOfLongNumber,
        isDate,
        isTime,
        isMarketNumber,
        isMonetary: valoresMonetarios.has(val),
        lineText: line,
      });
    }
  }
  
  // Contar frequência de cada valor candidato a odd
  const oddCandidates = todosNumeros.filter(n => 
    n.val >= 1.01 && n.val <= 500 && !n.isPrecededByRS && !n.isMonetary && !n.isDate && !n.isTime && !n.isPartOfLongNumber && !n.isMarketNumber
  );
  
  // Prioridade 1: se um valor aparece mais de uma vez, provavelmente é a odd real
  if (oddCandidates.length > 0) {
    const freq = {};
    for (const n of oddCandidates) {
      freq[n.val] = (freq[n.val] || 0) + 1;
    }
    // Encontrar o valor com maior frequência
    let bestOdd = null;
    let bestFreq = 0;
    for (const [val, count] of Object.entries(freq)) {
      if (count > bestFreq) {
        bestFreq = count;
        bestOdd = parseFloat(val);
      }
    }
    // Se algum valor aparece 2+ vezes, usar esse; senão usar o primeiro candidato
    if (bestFreq >= 2) {
      result.odd = bestOdd;
    } else {
      result.odd = oddCandidates[0].val;
    }
  }
  
  // Prioridade 2: qualquer número decimal entre 1.01 e 500 que não é monetário e não é mercado
  if (!result.odd) {
    for (const n of todosNumeros) {
      if (n.val >= 1.01 && n.val <= 500 && !n.isMonetary && !n.isDate && !n.isTime && !n.isMarketNumber) {
        result.odd = n.val;
        break;
      }
    }
  }
  
  // Prioridade 3: OCR frequentemente lê odds sem o ponto decimal (1.18 → 118, 2.50 → 250)
  // Buscar APENAS números inteiros de 3-4 dígitos (2 dígitos é ambíguo demais, ex: "12" pode ser qualquer coisa)
  if (!result.odd) {
    for (const line of lines) {
      // Ignorar linhas com R$ (monetárias), IDs longos, datas, linhas de mercado
      if (/R\$/.test(line) && !/simples/i.test(line)) continue;
      if (/\bID\b/i.test(line)) continue;
      if (/(?:mais\s+de|menos\s+de|over|under|acima|abaixo)/i.test(line)) continue;
      
      // Buscar números inteiros isolados (3-4 dígitos apenas)
      const intNums = line.match(/(?:^|[\s©@:])(\d{3,4})(?:[\s,.|]|$)/g);
      if (intNums) {
        for (const raw of intNums) {
          const digits = raw.replace(/[^\d]/g, "");
          const num = parseInt(digits, 10);
          
          // Ignorar se for ano (2020-2035), horário ou ID
          if (num >= 2020 && num <= 2035) continue;
          if (num > 2400) continue; // Muito grande para ser odd
          
          // Tentar inserir ponto decimal: 118 → 1.18, 172 → 1.72, 250 → 2.50
          let possibleOdd = null;
          if (digits.length === 3) {
            possibleOdd = parseFloat(digits[0] + "." + digits.slice(1)); // 172 → 1.72
          } else if (digits.length === 4) {
            possibleOdd = parseFloat(digits.slice(0, 2) + "." + digits.slice(2)); // 1250 → 12.50
          }
          
          if (possibleOdd && possibleOdd >= 1.01 && possibleOdd <= 500) {
            // Verificar que esse número não é um valor monetário
            if (!valoresMonetarios.has(num) && !valoresMonetarios.has(possibleOdd)) {
              result.odd = possibleOdd;
              break;
            }
          }
        }
      }
      if (result.odd) break;
    }
  }
  

  
  // Detectar evento - procurar padrão "Time A - Time B" ou "Time A vs Time B" ou "Time A x Time B"
  const eventPatterns = [
    // Separador deve ser: " - ", " x ", " vs ", " vs. " (com espaços ao redor)
    /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)\s+(?:-|x|vs\.?)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)/,
    // Também aceitar "Time A-Time B" (sem espaço mas com hífen)
    /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)\s*-\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú]?[a-zà-ú]+)*)/,
  ];
  
  // Frases/linhas comuns em cupons que NÃO são nomes de times
  const frasesIgnorar = /ganhos?\s*potencia|lucro\s*potencia|mais\s+detalhes|aposta\s+realizada|compartilh|notifica[çc]|manter|fechar|total\s+de\s+cart|resultado\s+final|dupla\s+chance|simples|m[úu]ltipla|ganhos|potenciais|sucesso|cart[õo]es\s+mais|mais.{0,3}menos/i;
  
  // Palavras que NÃO são nomes de times
  const palavrasNaoTimes = /^(ganhos?|potenciais?|lucro|total|mais|menos|simples|resultado|detalhes|aposta|valor|over|under|fechar|manter|compartilhar|notifica)$/i;
  
  for (const line of lines) {
    // Ignorar linhas que contêm frases comuns de cupom
    if (frasesIgnorar.test(line)) continue;
    
    for (const pattern of eventPatterns) {
      const match = line.match(pattern);
      if (match) {
        const team1 = match[1].trim();
        const team2 = match[2].trim();
        // Ignorar se parecer com data, valor monetário, ou palavra comum
        if (team1.length > 2 && team2.length > 2 && !/^\d/.test(team1) && !/^\d/.test(team2)
            && !palavrasNaoTimes.test(team1) && !palavrasNaoTimes.test(team2)) {
          result.evento = `${team1} - ${team2}`;
          break;
        }
      }
    }
    if (result.evento) break;
  }
  
  // Detectar tipo de aposta / mercado
  const mercados = [
    { patterns: ["resultado final", "1x2", "match result"], name: "Resultado Final" },
    { patterns: ["dupla chance", "double chance"], name: "Dupla Chance" },
    { patterns: ["over", "acima", "mais de"], name: "Over" },
    { patterns: ["under", "abaixo", "menos de"], name: "Under" },
    { patterns: ["ambas marcam", "btts", "both teams"], name: "Ambas Marcam" },
    { patterns: ["handicap"], name: "Handicap" },
    { patterns: ["escanteio", "corner"], name: "Escanteios" },
    { patterns: ["cart.{0,3}o", "card"], name: "Cartões" },
    { patterns: ["intervalo", "half.?time", "1.{0,2}tempo"], name: "Intervalo" },
    { patterns: ["gols", "goals", "total de gols"], name: "Gols" },
    { patterns: ["vencedor", "winner", "moneyline"], name: "Vencedor" },
  ];
  
  for (const mercado of mercados) {
    for (const pattern of mercado.patterns) {
      if (new RegExp(pattern, "i").test(fullText)) {
        result.tipo_aposta = mercado.name;
        break;
      }
    }
    if (result.tipo_aposta) break;
  }
  
  return result;
}

// ---- OCR COM TESSERACT.JS (GRATUITO) ----
async function extractBetWithTesseract(imageUrl) {
  try {
    showProgress(10, "Carregando OCR...");
    
    const worker = await Tesseract.createWorker("por+eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round(m.progress * 80) + 10;
          showProgress(pct, `Lendo texto... ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    
    showProgress(20, "Analisando imagem...");
    const { data } = await worker.recognize(imageUrl);
    
    showProgress(90, "Extraindo dados...");
    await worker.terminate();
    
    const betData = parseBetFromText(data.text);
    
    showProgress(100, "Concluído!");
    
    return betData;
  } catch (error) {
    console.error("Erro Tesseract:", error);
    throw error;
  }
}

// ---- OCR COM GEMINI (OPCIONAL, MAIS PRECISO) ----
async function resolveGeminiModel(apiKey) {
  const saved = localStorage.getItem("caderneta.gemini.model");
  if (saved) return saved;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const generative = models.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );
    const preferred = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro"];
    for (const pref of preferred) {
      const match = generative.find((m) => m.name?.includes(pref));
      if (match) return match.name;
    }
    return generative[0]?.name || null;
  } catch (err) {
    return null;
  }
}

async function extractBetWithGemini(imageBase64, mimeType) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  
  const prompt = `Analise esta imagem de um cupom/comprovante de aposta esportiva e extraia as seguintes informações em formato JSON:

{
  "evento": "Time A - Time B",
  "odd": número decimal da odd (ex: 1.85),
  "stake": valor apostado em reais sem símbolo (ex: 50.00),
  "casa": "Nome da casa de apostas (ex: Bet365, Betano, Sportingbet)",
  "data": "Data da aposta no formato DD/MM/AAAA",
  "tipo_aposta": "Mercado + seleção apostada (ex: Resultado Final Arsenal, Over 2.5 gols, Ambas Marcam Sim)"
}

REGRAS IMPORTANTES:
- Retorne APENAS o JSON, sem explicações ou markdown
- Se não conseguir identificar algum campo, use null
- A odd deve ser um número decimal (use ponto como separador)
- O stake deve ser apenas o número, sem R$ ou símbolos
- O campo "evento" deve conter APENAS os nomes dos times/jogadores separados por " - " (ex: "Arsenal - Sunderland"). NÃO inclua mercados, seleções ou promoções no evento.
- O campo "tipo_aposta" deve conter o mercado E a seleção apostada. Exemplos:
  * Se apostou no Arsenal no resultado final: "Resultado Final Arsenal"
  * Se apostou em Over 2.5 gols: "Over 2.5 gols"
  * Se apostou em Ambas Marcam Sim: "Ambas Marcam Sim"
  * Se apostou no empate: "Resultado Final Empate"
  * Se apostou em handicap -1.5 Arsenal: "Handicap -1.5 Arsenal"
  IGNORE nomes de promoções como "SuperOdds", "Odds Turbinadas", "Boost", etc.
- Se houver múltiplas apostas (aposta múltipla/combo), extraia apenas os dados gerais: odd total, stake total
- Para o evento em aposta múltipla, liste os eventos separados por " + "
- Se a data não estiver visível, use null`;

  const model = await resolveGeminiModel(apiKey);
  if (!model) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) return null;
  
  let cleanJson = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleanJson);
}

// ---- PREENCHIMENTO DO FORMULÁRIO ----
function fillFormWithBetData(betData) {
  if (!betData) return;
  
  if (betData.data) {
    const parts = betData.data.split("/");
    if (parts.length === 3) {
      document.getElementById("bet-date").value = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  } else {
    document.getElementById("bet-date").value = new Date().toISOString().split("T")[0];
  }
  
  if (betData.evento) {
    let eventText = betData.evento;
    if (betData.tipo_aposta) eventText += ` - ${betData.tipo_aposta}`;
    document.getElementById("bet-event").value = eventText;
  }
  
  if (betData.odd != null) {
    document.getElementById("bet-odds").value = numberFormatter.format(betData.odd);
  }
  
  if (betData.stake != null) {
    document.getElementById("bet-stake").value = numberFormatter.format(betData.stake);
  }
  
  if (betData.casa) {
    document.getElementById("bet-book").value = betData.casa;
  }
  
  document.getElementById("bet-status").value = "pending";
  updatePotentialProfit();
}

// ---- FLUXO PRINCIPAL DE IMPORTAÇÃO ----
async function handleCouponImport(file) {
  if (!file) return;
  
  if (!file.type.startsWith("image/")) {
    showImportStatus("❌ Selecione uma imagem válida (PNG, JPG, etc.)", "error");
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    showImportStatus("❌ Imagem muito grande. Máximo: 10MB", "error");
    return;
  }
  
  importCouponBtn.disabled = true;
  importCouponBtn.classList.add("loading");
  importCouponBtn.textContent = "";
  
  const apiKey = getGeminiApiKey();
  
  try {
    let betData = null;
    
    if (apiKey) {
      // Tentar Gemini primeiro (mais preciso)
      showImportStatus("🤖 Analisando com Gemini AI...", "info");
      showProgress(50, "Enviando para IA...");
      
      const base64 = await fileToBase64(file);
      betData = await extractBetWithGemini(base64, file.type);
      
      if (betData) {
        showProgress(100, "Concluído!");
        hideProgress();
        fillFormWithBetData(betData);
        showImportStatus("✅ Dados extraídos com Gemini AI! Revise e salve.", "success");
        return;
      }
      
      // Se Gemini falhou, usar Tesseract como fallback
      showImportStatus("⚠️ Gemini indisponível, usando OCR local...", "info");
    } else {
      showImportStatus("🔍 Analisando cupom (OCR local)...", "info");
    }
    
    // OCR Local com Tesseract.js (gratuito)
    const imageUrl = URL.createObjectURL(file);
    betData = await extractBetWithTesseract(imageUrl);
    URL.revokeObjectURL(imageUrl);
    
    hideProgress();
    
    if (betData && (betData.evento || betData.odd || betData.stake)) {
      fillFormWithBetData(betData);
      const campos = [];
      if (betData.evento) campos.push("evento");
      if (betData.odd) campos.push("odd");
      if (betData.stake) campos.push("stake");
      if (betData.casa) campos.push("casa");
      if (betData.data) campos.push("data");
      showImportStatus(`✅ Encontrado: ${campos.join(", ")}. Revise os dados e complete o que faltar.`, "success");
    } else {
      showImportStatus("⚠️ Não consegui extrair dados. Tente uma foto mais nítida ou preencha manualmente.", "error");
    }
    
  } catch (error) {
    console.error("Erro no import:", error);
    hideProgress();
    showImportStatus(`❌ Erro: ${error.message}`, "error");
  } finally {
    importCouponBtn.disabled = false;
    importCouponBtn.classList.remove("loading");
    importCouponBtn.textContent = "📷 Importar do Cupom";
    couponFileInput.value = "";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Event listeners
importCouponBtn?.addEventListener("click", () => {
  couponFileInput?.click();
});

couponFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleCouponImport(file);
});

// Profile Switcher
const profileSwitch = document.getElementById('profile-switch');

function renderProfileSwitcher() {
  if (!profileSwitch) return;
  
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  const activeId = getActiveProfileId();
  
  profileSwitch.innerHTML = '';
  
  profiles.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === activeId;
    profileSwitch.appendChild(option);
  });
  
  if (profiles.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Perfil Principal';
    profileSwitch.appendChild(option);
  }
}

profileSwitch?.addEventListener('change', (e) => {
  const newProfileId = e.target.value;
  if (newProfileId) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, newProfileId);
    // Recarregar a página para aplicar o novo perfil
    window.location.reload();
  }
});

// ========================
// BACKUP AUTOMÁTICO SEMANAL
// ========================
function getBackupKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.backup.${profileId}` : "caderneta.backup.v1";
}

function getLastBackupKey() {
  const profileId = getActiveProfileId();
  return profileId ? `caderneta.lastBackup.${profileId}` : "caderneta.lastBackup.v1";
}

function performWeeklyBackup() {
  const lastBackupStr = localStorage.getItem(getLastBackupKey());
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  if (lastBackupStr && (now - Number(lastBackupStr)) < oneWeek) {
    return; // Ainda não passou 1 semana
  }

  const backupData = {
    timestamp: new Date().toISOString(),
    bets: JSON.parse(localStorage.getItem(getStorageKey()) || "[]"),
    cashflows: JSON.parse(localStorage.getItem(getCashflowKey()) || "[]"),
    settings: JSON.parse(localStorage.getItem(getSettingsKey()) || "{}"),
    bankroll: localStorage.getItem(getBankrollKey()),
    notes: localStorage.getItem(getNotesKey()) || "",
    goals: JSON.parse(localStorage.getItem(getGoalsKey()) || "{}"),
  };

  // Rotação: manter apenas os últimos 4 backups (1 mês)
  const backupKey = getBackupKey();
  const existingRaw = localStorage.getItem(backupKey);
  let backups = existingRaw ? JSON.parse(existingRaw) : [];
  backups.push(backupData);
  if (backups.length > 4) {
    backups = backups.slice(-4);
  }

  try {
    localStorage.setItem(backupKey, JSON.stringify(backups));
    localStorage.setItem(getLastBackupKey(), String(now));
    console.log(`✅ Backup automático realizado em ${backupData.timestamp}`);
  } catch (e) {
    console.warn("⚠️ Erro ao salvar backup automático:", e.message);
  }
}

function restoreFromBackup(index) {
  const backupKey = getBackupKey();
  const existingRaw = localStorage.getItem(backupKey);
  if (!existingRaw) return false;

  const backups = JSON.parse(existingRaw);
  const backup = backups[index];
  if (!backup) return false;

  localStorage.setItem(getStorageKey(), JSON.stringify(backup.bets));
  localStorage.setItem(getCashflowKey(), JSON.stringify(backup.cashflows));
  localStorage.setItem(getSettingsKey(), JSON.stringify(backup.settings));
  if (backup.bankroll) localStorage.setItem(getBankrollKey(), backup.bankroll);
  if (backup.notes) localStorage.setItem(getNotesKey(), backup.notes);
  if (backup.goals) localStorage.setItem(getGoalsKey(), JSON.stringify(backup.goals));

  return true;
}

// ========================
// EXPORTAR PDF MENSAL
// ========================
const MONTH_NAMES_PDF = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const pdfModal = document.getElementById('pdf-modal');
const pdfModalClose = document.getElementById('pdf-modal-close');
const pdfMonthSelect = document.getElementById('pdf-month-select');
const pdfGenerateBtn = document.getElementById('pdf-generate-btn');
const pdfStatus = document.getElementById('pdf-status');
const exportPdfBtn = document.getElementById('export-pdf-btn');

function populatePdfMonthSelect() {
  if (!pdfMonthSelect) return;
  pdfMonthSelect.innerHTML = '';

  // Encontrar meses com apostas
  const monthsSet = new Set();
  bets.forEach(bet => {
    const d = parseDateForSort(bet.date);
    if (d) monthsSet.add(`${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`);
  });

  // Gerar os últimos 12 meses
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${MONTH_NAMES_PDF[d.getMonth()]} ${d.getFullYear()}`;
    if (monthsSet.has(key)) opt.textContent += ' ✓';
    pdfMonthSelect.appendChild(opt);
  }
}

function openPdfModal() {
  populatePdfMonthSelect();
  pdfStatus.style.display = 'none';
  pdfModal.style.display = 'flex';
}

function closePdfModal() {
  pdfModal.style.display = 'none';
}

exportPdfBtn?.addEventListener('click', openPdfModal);
pdfModalClose?.addEventListener('click', closePdfModal);
pdfModal?.addEventListener('click', (e) => { if (e.target === pdfModal) closePdfModal(); });

pdfGenerateBtn?.addEventListener('click', async () => {
  const val = pdfMonthSelect.value;
  const [yearStr, monthStr] = val.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthName = `${MONTH_NAMES_PDF[month]} ${year}`;

  pdfStatus.textContent = 'Gerando relatório... 📊';
  pdfStatus.style.display = 'block';
  pdfStatus.style.color = 'var(--primary)';
  pdfGenerateBtn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Filter bets for month
    const monthBets = bets.filter(bet => {
      const d = parseDateForSort(bet.date);
      return d && d.getFullYear() === year && d.getMonth() === month;
    });
    const settled = monthBets.filter(b => b.status === 'win' || b.status === 'loss');
    const wins = settled.filter(b => b.status === 'win');
    const losses = settled.filter(b => b.status === 'loss');
    const totalStake = settled.reduce((s, b) => s + b.stake, 0);
    const totalProfit = settled.reduce((s, b) => s + calcProfit(b), 0);
    const winrate = settled.length > 0 ? wins.length / settled.length : 0;
    const roi = totalStake > 0 ? totalProfit / totalStake : 0;

    // Header
    doc.setFillColor(11, 16, 32);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(245, 247, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO MENSAL - ${monthName.toUpperCase()}`, pageW / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Gestão de Banca de Apostas', pageW / 2, 28, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 34, { align: 'center' });
    y = 50;

    /// KPIs
    const incKpis = document.getElementById('pdf-inc-kpis')?.checked;
    if (incKpis) {
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 📊 que causava erro
      doc.text('RESUMO GERAL', margin, y); 
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      

      const kpiData = [
        ['Total apostado:', currencyFormatter.format(totalStake)],
        ['Lucro líquido:', currencyFormatter.format(totalProfit)],
        ['ROI:', percentFormatter.format(roi)],
        ['Winrate:', `${percentFormatter.format(winrate)} (${wins.length} greens / ${settled.length} apostas)`],
        ['Total de apostas no mês:', `${monthBets.length} (${settled.length} finalizadas, ${monthBets.length - settled.length} pendentes)`],
        ['Odd média:', settled.length > 0 ? `${numberFormatter.format(settled.reduce((s, b) => s + b.odds, 0) / settled.length)}x` : '-'],
        ['Ticket médio:', settled.length > 0 ? currencyFormatter.format(totalStake / settled.length) : '-'],
      ];

      kpiData.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin, y);
        doc.setFont('helvetica', 'normal');
        if (label.includes('Lucro')) {
          doc.setTextColor(totalProfit >= 0 ? 34 : 220, totalProfit >= 0 ? 150 : 50, totalProfit >= 0 ? 80 : 50);
        }
        doc.text(value, margin + 50, y);
        doc.setTextColor(60, 60, 60);
        y += 6;
      });
      y += 6;
    }

    // Chart
    const incChart = document.getElementById('pdf-inc-chart')?.checked;
    if (incChart) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 📈
      doc.text('GRÁFICO DE EVOLUÇÃO', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 4;

      const chartEl = document.getElementById('balance-chart');
      if (chartEl) {
        try {
          const chartCanvas = await html2canvas(chartEl.closest('.chart-card') || chartEl, { backgroundColor: '#0b1020', scale: 2 });
          const chartImg = chartCanvas.toDataURL('image/png');
          const chartW = pageW - margin * 2;
          const chartH = (chartCanvas.height / chartCanvas.width) * chartW;
          doc.addImage(chartImg, 'PNG', margin, y, chartW, Math.min(chartH, 70));
          y += Math.min(chartH, 70) + 8;
        } catch (e) {
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(9);
          doc.text('(Gráfico não disponível)', margin, y + 10);
          y += 16;
        }
      }
    }

    // Stats by house
    const incHouses = document.getElementById('pdf-inc-houses')?.checked;
    if (incHouses) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 🏠
      doc.text('ESTATÍSTICAS POR CASA', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      const books = Array.from(new Set(settled.map(b => b.book))).sort();
      if (books.length > 0) {
        // Header
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 100, 100);
        const cols = [margin, margin+35, margin+55, margin+72, margin+92, margin+115, margin+145];
        doc.text('Casa', cols[0], y);
        doc.text('Apostas', cols[1], y);
        doc.text('Greens', cols[2], y);
        doc.text('Reds', cols[3], y);
        doc.text('Winrate', cols[4], y);
        doc.text('Lucro', cols[5], y);
        doc.text('ROI', cols[6], y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);

        books.forEach(book => {
          if (y > 275) { doc.addPage(); y = 20; }
          const hBets = settled.filter(b => b.book === book);
          const hWins = hBets.filter(b => b.status === 'win').length;
          const hLosses = hBets.filter(b => b.status === 'loss').length;
          const hStake = hBets.reduce((s, b) => s + b.stake, 0);
          const hProfit = hBets.reduce((s, b) => s + calcProfit(b), 0);
          const hWinrate = hBets.length > 0 ? hWins / hBets.length : 0;
          const hRoi = hStake > 0 ? hProfit / hStake : 0;

          doc.setFontSize(8);
          doc.text(book.substring(0, 15), cols[0], y);
          doc.text(String(hBets.length), cols[1], y);
          doc.text(String(hWins), cols[2], y);
          doc.text(String(hLosses), cols[3], y);
          doc.text(percentFormatter.format(hWinrate), cols[4], y);
          doc.setTextColor(hProfit >= 0 ? 34 : 220, hProfit >= 0 ? 150 : 50, hProfit >= 0 ? 80 : 50);
          doc.text(currencyFormatter.format(hProfit), cols[5], y);
          doc.setTextColor(hRoi >= 0 ? 34 : 220, hRoi >= 0 ? 150 : 50, hRoi >= 0 ? 80 : 50);
          doc.text(percentFormatter.format(hRoi), cols[6], y);
          doc.setTextColor(60, 60, 60);
          y += 5;
        });
        y += 6;
      }
    }

    // Top 5
    const incTop5 = document.getElementById('pdf-inc-top5')?.checked;
    if (incTop5 && wins.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // Título sem emoji
      doc.text('TOP 5 MELHORES APOSTAS', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      const top5 = wins
        .map(b => ({ ...b, profit: calcProfit(b) }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

      doc.setFontSize(9);
      
      top5.forEach((bet, i) => {
        if (y > 275) { doc.addPage(); y = 20; }
        
        // 1. Número do Ranking (Verde)
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(34, 150, 80); 
        doc.text(`${i + 1}.`, margin, y);

        // 2. Lucro (Alinhado à DIREITA para ficar organizado)
        // Mantemos a cor verde para destacar o ganho
        doc.text(`+${currencyFormatter.format(bet.profit)}`, pageW - margin, y, { align: 'right' });

        // 3. Evento + Odd (Alinhado à ESQUERDA)
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        const oddText = `(${numberFormatter.format(bet.odds)}x)`;
        let eventText = bet.event || '-';
        
        // Truncar o nome do evento para não bater no valor do lucro
        // 60 caracteres é um bom limite seguro para esta linha
        if (eventText.length > 55) {
          eventText = eventText.substring(0, 55) + '...';
        }

        // Escreve: "Nome do Evento... (2.00x)"
        doc.text(`${eventText} ${oddText}`, margin + 8, y);
        
        y += 6;
      });
      y += 6;
    }

    /// Full table
    const incTable = document.getElementById('pdf-inc-table')?.checked;
    if (incTable && monthBets.length > 0) {
      if (y > 200) { doc.addPage(); y = 20; }
      
      doc.setTextColor(124, 92, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      // CORREÇÃO: Removido o emoji 📋
      doc.text('HISTÓRICO COMPLETO', margin, y);
      y += 8;
      doc.setDrawColor(124, 92, 255);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      // --- CONFIGURAÇÃO DAS COLUNAS (FIX) ---
      const colX = {
        date: margin,
        event: margin + 18,
        odd: margin + 95,      // DIREITA
        stake: margin + 115,   // DIREITA
        status: margin + 120,
        profit: margin + 155,  // DIREITA
        book: margin + 160
      };

      // Header
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text('Data', colX.date, y);
      doc.text('Evento', colX.event, y);
      doc.text('Odd', colX.odd, y, { align: 'right' });   
      doc.text('Stake', colX.stake, y, { align: 'right' }); 
      doc.text('Status', colX.status, y);
      doc.text('Lucro', colX.profit, y, { align: 'right' }); 
      doc.text('Casa', colX.book, y);
      y += 1;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 4;

      doc.setFont('helvetica', 'normal');
      const sortedMonthBets = [...monthBets].sort((a, b) => {
        const ad = parseDateForSort(a.date);
        const bd = parseDateForSort(b.date);
        return (bd || 0) - (ad || 0);
      });

      sortedMonthBets.forEach(bet => {
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(100, 100, 100);
          doc.text('Data', colX.date, y);
          doc.text('Evento', colX.event, y);
          doc.text('Odd', colX.odd, y, { align: 'right' });
          doc.text('Stake', colX.stake, y, { align: 'right' });
          doc.text('Status', colX.status, y);
          doc.text('Lucro', colX.profit, y, { align: 'right' });
          doc.text('Casa', colX.book, y);
          y += 1;
          doc.line(margin, y, pageW - margin, y);
          y += 4;
          doc.setFont('helvetica', 'normal');
        }

        const profit = calcProfit(bet);
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 60);
        doc.text(bet.date || '-', colX.date, y);
        const eventText = (bet.event || '-');
        doc.text(eventText.length > 35 ? eventText.substring(0, 35) + '...' : eventText, colX.event, y);
        doc.text(numberFormatter.format(bet.odds), colX.odd, y, { align: 'right' });
        doc.text(currencyFormatter.format(bet.stake), colX.stake, y, { align: 'right' });

        if (bet.status === 'win') doc.setTextColor(34, 150, 80);
        else if (bet.status === 'loss') doc.setTextColor(220, 50, 50);
        else doc.setTextColor(200, 160, 0);
        doc.text(statusLabel(bet.status).substring(0, 10), colX.status, y);

        doc.setTextColor(profit >= 0 ? 34 : 220, profit >= 0 ? 150 : 50, profit >= 0 ? 80 : 50);
        doc.text(currencyFormatter.format(profit), colX.profit, y, { align: 'right' });
        doc.setTextColor(60, 60, 60);
        doc.text((bet.book || '-').substring(0, 12), colX.book, y);
        y += 5;
      });
      y += 6;
    }

    // Notes
    const incNotes = document.getElementById('pdf-inc-notes')?.checked;
    if (incNotes) {
      const notes = localStorage.getItem(getNotesKey()) || '';
      if (notes.trim()) {
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setTextColor(124, 92, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        // CORREÇÃO: Removido o emoji 📝
        doc.text('NOTAS E OBSERVAÇÕES', margin, y);
        y += 8;
        doc.setDrawColor(124, 92, 255);
        doc.line(margin, y, pageW - margin, y);
        y += 6;
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(notes, pageW - margin * 2);
        noteLines.forEach(line => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(line, margin, y);
          y += 5;
        });
      }
    }

    // Footer on last page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`Caderneta de Apostas • Página ${i} de ${pageCount}`, pageW / 2, 290, { align: 'center' });
    }

    doc.save(`relatorio-${monthName.replace(' ', '-').toLowerCase()}.pdf`);

    pdfStatus.textContent = '✅ PDF gerado com sucesso!';
    pdfStatus.style.color = 'var(--success)';
    setTimeout(() => closePdfModal(), 2000);

  } catch (e) {
    console.error('Erro ao gerar PDF:', e);
    pdfStatus.textContent = `❌ Erro: ${e.message}`;
    pdfStatus.style.color = 'var(--danger)';
  } finally {
    pdfGenerateBtn.disabled = false;
  }
});

// ========================
// COMPARTILHAR CARD REDES SOCIAIS
// ========================
const shareModal = document.getElementById('share-modal');
const shareModalClose = document.getElementById('share-modal-close');
const shareCardCanvas = document.getElementById('share-card-canvas');
const shareDownloadBtn = document.getElementById('share-download-btn');
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareNativeBtn = document.getElementById('share-native-btn');

function openShareCardModal(bet) {
  if (!shareModal || !shareCardCanvas) return;
  renderShareCard(bet);
  shareModal.style.display = 'flex';

  // Store current bet for actions
  shareModal._currentBet = bet;
}

function closeShareModal() {
  if (shareModal) shareModal.style.display = 'none';
}

shareModalClose?.addEventListener('click', closeShareModal);
shareModal?.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModal(); });

function renderShareCard(bet) {
  const canvas = shareCardCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = 1080;
  const h = 1080;
  canvas.width = w;
  canvas.height = h;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#0b1020');
  bgGrad.addColorStop(0.5, '#121830');
  bgGrad.addColorStop(1, '#0b1020');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Decorative circles
  ctx.beginPath();
  ctx.arc(100, 100, 300, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(124, 92, 255, 0.12)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(w - 100, h - 100, 250, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
  ctx.fill();

  const profit = calcProfit(bet);
  const isWin = bet.status === 'win';
  const roiVal = bet.stake > 0 ? (profit / bet.stake) * 100 : 0;

  // Status badge at top
  const statusColor = isWin ? '#22c55e' : '#ff6b6b';
  const statusText = isWin ? '✅ GREEN' : '❌ RED';
  const statusBg = isWin ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 107, 107, 0.2)';

  // Top banner
  ctx.fillStyle = statusBg;
  roundRect(ctx, 60, 60, w - 120, 120, 24);
  ctx.fill();
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 60, w - 120, 120, 24);
  ctx.stroke();

  ctx.fillStyle = statusColor;
  ctx.font = 'bold 52px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, w / 2, 138);

  // Event name
  ctx.fillStyle = '#f5f7ff';
  ctx.font = 'bold 42px Inter, sans-serif';
  ctx.textAlign = 'center';
  const eventLines = wrapText(ctx, bet.event || '-', w - 160, 42);
  let eventY = 260;
  eventLines.forEach(line => {
    ctx.fillText(line, w / 2, eventY);
    eventY += 52;
  });

  // Divider
  let divY = eventY + 20;
  ctx.strokeStyle = 'rgba(124, 92, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, divY);
  ctx.lineTo(w - 120, divY);
  ctx.stroke();

  // Info cards
  let cardsY = divY + 40;
  const cardW = (w - 180) / 2;
  const cardH = 140;

  // Card: Casa
  drawInfoCard(ctx, 70, cardsY, cardW, cardH, '🏠', 'Casa', bet.book || '-');
  // Card: Odd
  drawInfoCard(ctx, 70 + cardW + 40, cardsY, cardW, cardH, '📊', 'Odd', `${numberFormatter.format(bet.odds)}x`);

  cardsY += cardH + 20;

  // Card: Stake
  drawInfoCard(ctx, 70, cardsY, cardW, cardH, '💰', 'Stake', currencyFormatter.format(bet.stake));
  // Card: Lucro
  const profitColor = profit >= 0 ? '#22c55e' : '#ff6b6b';
  drawInfoCard(ctx, 70 + cardW + 40, cardsY, cardW, cardH, '💸', 'Lucro', currencyFormatter.format(profit), profitColor);

  cardsY += cardH + 20;

  // ROI big
  if (bet.status === 'win' || bet.status === 'loss') {
    const roiColor = roiVal >= 0 ? '#22c55e' : '#ff6b6b';
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, 70, cardsY, w - 140, 100, 16);
    ctx.fill();
    ctx.fillStyle = roiColor;
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${roiVal >= 0 ? '+' : ''}${roiVal.toFixed(0)}% ROI`, w / 2, cardsY + 65);
    cardsY += 120;
  }

  // AI badge
  if (bet.ai) {
    ctx.fillStyle = 'rgba(124, 92, 255, 0.15)';
    roundRect(ctx, 70, cardsY, w - 140, 70, 16);
    ctx.fill();
    ctx.fillStyle = '#7c5cff';
    ctx.font = '600 30px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🤖 Sugestão: ${bet.ai}`, w / 2, cardsY + 45);
    cardsY += 90;
  }

  // Date
  ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
  ctx.font = '400 26px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`📅 ${bet.date || '-'}`, w / 2, h - 110);

  // Footer
  ctx.fillStyle = 'rgba(245, 247, 255, 0.3)';
  ctx.font = '400 22px Inter, sans-serif';
  ctx.fillText('Caderneta de Apostas', w / 2, h - 50);
}

function drawInfoCard(ctx, x, y, w, h, emoji, label, value, valueColor) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 16);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 247, 255, 0.5)';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${emoji} ${label}`, x + w / 2, y + 40);

  ctx.fillStyle = valueColor || '#f5f7ff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText(value, x + w / 2, y + 95);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3); // max 3 lines
}

// Share actions
shareDownloadBtn?.addEventListener('click', () => {
  if (!shareCardCanvas) return;
  const link = document.createElement('a');
  link.download = `aposta-card-${Date.now()}.png`;
  link.href = shareCardCanvas.toDataURL('image/png');
  link.click();
});

shareCopyBtn?.addEventListener('click', async () => {
  if (!shareCardCanvas) return;
  try {
    const blob = await new Promise(resolve => shareCardCanvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    shareCopyBtn.textContent = '✅ Copiado!';
    setTimeout(() => { shareCopyBtn.textContent = '📋 Copiar'; }, 2000);
  } catch (e) {
    // Fallback: download
    shareDownloadBtn?.click();
  }
});

shareNativeBtn?.addEventListener('click', async () => {
  if (!shareCardCanvas) return;
  
  // Muda o texto do botão para indicar processamento
  const originalText = shareNativeBtn.innerHTML;
  shareNativeBtn.innerHTML = '🔄 Processando...';
  
  try {
    // 1. Converter o Canvas em um Arquivo de imagem real (Blob -> File)
    const blob = await new Promise(resolve => shareCardCanvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'resumo-apostas.png', { type: 'image/png' });

    // 2. Preparar os dados para compartilhamento
    const shareData = {
      title: 'Caderneta de Apostas',
      text: shareModal?._currentBet 
        ? `Minha aposta: ${shareModal._currentBet.event}` 
        : 'Confira meu resumo do dia na Caderneta!',
      files: [file],
    };

    // 3. Verificar se o navegador suporta compartilhamento nativo de ARQUIVOS
    // (Geralmente funciona no Mobile, mas falha no Desktop)
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
      // Se der certo, volta o texto normal
      shareNativeBtn.innerHTML = originalText;
    } else {
      throw new Error("Sharing not supported");
    }

  } catch (e) {
    // Se der erro (ou se for Desktop e não suportar), cai aqui
    
    // Ignora erro se o usuário cancelou o menu de compartilhar
    if (e.name !== 'AbortError') {
      // Se não for cancelamento, é porque não suporta.
      // Mostramos um aviso (se a função showToast existir, senão usa alert ou console)
      if (typeof showToast === 'function') {
        showToast("Compartilhamento nativo indisponível no PC. Baixando imagem...");
      } else {
        alert("Neste dispositivo, a imagem será baixada para você enviar manualmente.");
      }
      
      // Fallback: Clica no botão de download automaticamente
      shareDownloadBtn?.click();
    }
    shareNativeBtn.innerHTML = originalText;
  }
});
//fim da func sharenativebtn
init();
performWeeklyBackup();
renderProfileSwitcher();

const STORAGE_KEY = "caderneta.bets.v1";
const BANKROLL_KEY = "caderneta.bankroll.base.v1";
const CASHFLOW_KEY = "caderneta.cashflow.v1";

const form = document.getElementById("bet-form");
const potentialProfitEl = document.getElementById("potential-profit");
const betsBody = document.getElementById("bets-body");
const resetButton = document.getElementById("reset-button");
const submitButton = document.getElementById("submit-button");
const cashflowForm = document.getElementById("cashflow-form");
const cashflowBody = document.getElementById("cashflow-body");
const cashflowReset = document.getElementById("cashflow-reset");
const cashflowSubmit = document.getElementById("cashflow-submit");

const bankrollInput = document.getElementById("bankroll-input");
const bankrollProgress = document.getElementById("bankroll-progress");
const bankrollExposure = document.getElementById("bankroll-exposure");
const bankrollExposureValue = document.getElementById("bankroll-exposure-value");
const bookFilter = document.getElementById("book-filter");
const statusFilter = document.getElementById("status-filter");

const kpiProfit = document.getElementById("kpi-profit");
const kpiWinrate = document.getElementById("kpi-winrate");

let bets = [];
let cashflows = [];
let editingId = null;
let cashflowEditingId = null;
let balanceChart = null;
let baseBankroll = null;

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
  const raw = localStorage.getItem(STORAGE_KEY);
  bets = raw ? JSON.parse(raw) : [];
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

    return {
      ...bet,
      status: statusMap[bet.status] || bet.status,
      stake: Number(bet.stake),
      odds: Number(bet.odds),
      isFreebet: Boolean(bet.isFreebet || bet.freebet),
    };
  });
}

function loadCashflows() {
  const raw = localStorage.getItem(CASHFLOW_KEY);
  cashflows = raw ? JSON.parse(raw) : [];
  cashflows = cashflows.map((flow) => ({
    ...flow,
    amount: Number(flow.amount),
  }));
}

function loadBankrollBase() {
  const raw = localStorage.getItem(BANKROLL_KEY);
  const value = Number(raw);
  baseBankroll = Number.isFinite(value) ? value : null;
}

function saveBankrollBase() {
  if (Number.isFinite(baseBankroll)) {
    localStorage.setItem(BANKROLL_KEY, String(baseBankroll));
  } else {
    localStorage.removeItem(BANKROLL_KEY);
  }
}

function saveBets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
}

function saveCashflows() {
  localStorage.setItem(CASHFLOW_KEY, JSON.stringify(cashflows));
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
  if (!selected || selected === "all") {
    if (status === "pending") {
      return bets.filter((bet) => bet.status === "pending");
    }
    if (status === "settled") {
      return bets.filter((bet) => bet.status === "win" || bet.status === "loss");
    }
    return bets;
  }
  return bets.filter((bet) => {
    const matchBook = bet.book === selected;
    if (status === "pending") {
      return matchBook && bet.status === "pending";
    }
    if (status === "settled") {
      return matchBook && (bet.status === "win" || bet.status === "loss");
    }
    return matchBook;
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
    cell.colSpan = 9;
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

    // 9. Botões de Ação
    const tdActions = document.createElement("td");
    tdActions.innerHTML = `
      <button type="button" class="ghost" data-action="edit" data-id="${bet.id}">Editar</button>
      <button type="button" class="ghost" data-action="delete" data-id="${bet.id}">Excluir</button>
    `; // Botões fixos são seguros usar innerHTML, mas poderíamos criar elemento a elemento também
    row.appendChild(tdActions);

    betsBody.appendChild(row);
  });
}

function cashflowLabel(type) {
  const map = {
    deposit: "Depósito",
    withdraw: "Saque",
  };
  return map[type] || type;
}

function renderCashflowTable() {
  if (!cashflowBody) {
    return;
  }

  cashflowBody.innerHTML = "";

  if (cashflows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "Nenhuma movimentação cadastrada ainda.";
    row.appendChild(cell);
    cashflowBody.appendChild(row);
    return;
  }

  cashflows.forEach((flow) => {
    const row = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = flow.date;
    row.appendChild(tdDate);

    const tdType = document.createElement("td");
    tdType.textContent = cashflowLabel(flow.type);
    row.appendChild(tdType);

    const tdAmount = document.createElement("td");
    const signedAmount = flow.type === "withdraw" ? -Math.abs(flow.amount) : flow.amount;
    tdAmount.textContent = formatProfit(signedAmount);
    row.appendChild(tdAmount);

    const tdNote = document.createElement("td");
    tdNote.textContent = flow.note || "-";
    row.appendChild(tdNote);

    const tdActions = document.createElement("td");
    tdActions.innerHTML = `
      <button type="button" class="ghost" data-action="edit" data-id="${flow.id}">Editar</button>
      <button type="button" class="ghost" data-action="delete" data-id="${flow.id}">Excluir</button>
    `;
    row.appendChild(tdActions);

    cashflowBody.appendChild(row);
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
  const data = getFilteredBets();
  const settled = data.filter((bet) => bet.status === "win" || bet.status === "loss");
  const totalStake = settled.reduce((sum, bet) => sum + bet.stake, 0);
  const totalProfit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);
  const wins = settled.filter((bet) => bet.status === "win").length;
  const winrate = settled.length ? wins / settled.length : 0;

  kpiProfit.textContent = formatProfit(totalProfit);
  kpiWinrate.textContent = percentFormatter.format(winrate);
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

  const data = getFilteredBets()
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
  renderCashflowTable();
  renderKpis();
  updateBankrollDisplay();
  updateBankrollExposure();
  renderBalanceChart();
}

function resetForm() {
  form.reset();
  updatePotentialProfit();
  editingId = null;
  submitButton.textContent = "Salvar aposta";
}

function resetCashflowForm() {
  if (!cashflowForm) {
    return;
  }
  cashflowForm.reset();
  cashflowEditingId = null;
  cashflowSubmit.textContent = "Salvar movimentação";
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

function handleCashflowSubmit(event) {
  event.preventDefault();

  const rawDate = document.getElementById("cashflow-date").value.trim();
  const formattedDate = formatDateDisplay(rawDate);
  const amountValue = parseLocaleNumber(document.getElementById("cashflow-amount").value);

  const flow = {
    id: crypto.randomUUID(),
    date: formattedDate,
    type: document.getElementById("cashflow-type").value,
    amount: amountValue,
    note: document.getElementById("cashflow-note").value.trim(),
  };

  if (!flow.date || !Number.isFinite(flow.amount)) {
    alert("Preencha data e valor da movimentação.");
    return;
  }

  if (cashflowEditingId) {
    const index = cashflows.findIndex((item) => item.id === cashflowEditingId);
    if (index >= 0) {
      cashflows[index] = { ...cashflows[index], ...flow };
    }
  } else {
    cashflows.unshift(flow);
  }

  saveCashflows();
  refreshAll();
  resetCashflowForm();
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
  updatePotentialProfit();
  submitButton.textContent = "Atualizar aposta";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startCashflowEdit(flow) {
  cashflowEditingId = flow.id;
  document.getElementById("cashflow-date").value = formatDateForInput(flow.date);
  document.getElementById("cashflow-type").value = flow.type;
  document.getElementById("cashflow-amount").value = numberFormatter.format(flow.amount);
  document.getElementById("cashflow-note").value = flow.note || "";
  cashflowSubmit.textContent = "Atualizar movimentação";
  cashflowForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  if (button.dataset.action === "edit") {
    const bet = bets.find((item) => item.id === id);
    if (bet) {
      startEdit(bet);
    }
    return;
  }
  if (button.dataset.action === "delete") {
    bets = bets.filter((bet) => bet.id !== id);
    saveBets();
    refreshAll();
  }
}

function handleCashflowClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.id;
  if (button.dataset.action === "edit") {
    const flow = cashflows.find((item) => item.id === id);
    if (flow) {
      startCashflowEdit(flow);
    }
    return;
  }

  if (button.dataset.action === "delete") {
    cashflows = cashflows.filter((flow) => flow.id !== id);
    saveCashflows();
    refreshAll();
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

    dayEl.title = `${day}/${month + 1}/${year}: ${formatProfit(profit)}`;
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

function init() {
  loadBets();
  loadCashflows();
  loadBankrollBase();
  updatePotentialProfit();
  refreshAll();
  renderCalendar();
}

form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);
cashflowForm?.addEventListener("submit", handleCashflowSubmit);
cashflowReset?.addEventListener("click", resetCashflowForm);

["bet-stake", "bet-odds"].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("input", updatePotentialProfit);
});

bankrollInput.addEventListener("input", handleBankrollInput);
bookFilter.addEventListener("change", refreshAll);
statusFilter?.addEventListener("change", refreshAll);
betsBody.addEventListener("click", handleTableClick);
cashflowBody?.addEventListener("click", handleCashflowClick);

// Calendar event listeners
calendarViewSelect?.addEventListener('change', (e) => {
  calendarView = e.target.value;
  renderCalendar();
});

calendarPrev?.addEventListener('click', () => handleCalendarNavigation(-1));
calendarNext?.addEventListener('click', () => handleCalendarNavigation(1));

init();

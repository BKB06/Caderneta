const STORAGE_KEY = "caderneta.bets.v1";
const BANKROLL_KEY = "caderneta.bankroll.base.v1";

const form = document.getElementById("bet-form");
const potentialProfitEl = document.getElementById("potential-profit");
const betsBody = document.getElementById("bets-body");
const resetButton = document.getElementById("reset-button");
const submitButton = document.getElementById("submit-button");

const bankrollInput = document.getElementById("bankroll-input");
const bankrollProgress = document.getElementById("bankroll-progress");
const bankrollExposure = document.getElementById("bankroll-exposure");
const bankrollExposureValue = document.getElementById("bankroll-exposure-value");
const bookFilter = document.getElementById("book-filter");
const statusFilter = document.getElementById("status-filter");

const kpiProfit = document.getElementById("kpi-profit");
const kpiWinrate = document.getElementById("kpi-winrate");

let bets = [];
let editingId = null;
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
    };
  });
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
    return -bet.stake;
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

function getEffectiveBankroll() {
  if (!Number.isFinite(baseBankroll)) {
    return null;
  }
  return baseBankroll + calcSettledProfit();
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
    .filter((bet) => bet.status === "pending")
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

  baseBankroll = current - calcSettledProfit();
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

function init() {
  loadBets();
  loadBankrollBase();
  updatePotentialProfit();
  refreshAll();
}

form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);

["bet-stake", "bet-odds"].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("input", updatePotentialProfit);
});

bankrollInput.addEventListener("input", handleBankrollInput);
bookFilter.addEventListener("change", refreshAll);
statusFilter?.addEventListener("change", refreshAll);
betsBody.addEventListener("click", handleTableClick);

init();

const PROFILES_KEY = "caderneta.profiles.v1";
const ACTIVE_PROFILE_KEY = "caderneta.activeProfile.v1";

function getActiveProfileId() {
  const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  let activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  
  if (profiles.length === 0) {
    return null;
  }
  
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

let bets = [];
let bookDistributionChart = null;
let bookProfitChart = null;

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

function calcRankingStats() {
  const settled = bets.filter((bet) => bet.status === 'win' || bet.status === 'loss');
  const wins = bets.filter((bet) => bet.status === 'win');
  const losses = bets.filter((bet) => bet.status === 'loss');
  const pending = bets.filter((bet) => bet.status === 'pending');

  // Maior lucro em uma única aposta
  let maxProfitBet = null;
  let maxProfit = 0;
  wins.forEach((bet) => {
    const profit = calcProfit(bet);
    if (profit > maxProfit) {
      maxProfit = profit;
      maxProfitBet = bet;
    }
  });

  // Maior perda em uma única aposta
  let maxLossBet = null;
  let maxLoss = 0;
  losses.forEach((bet) => {
    const loss = Math.abs(calcProfit(bet));
    if (loss > maxLoss) {
      maxLoss = loss;
      maxLossBet = bet;
    }
  });

  // Maior odd acertada
  let maxOddWinBet = null;
  let maxOddWin = 0;
  wins.forEach((bet) => {
    if (bet.odds > maxOddWin) {
      maxOddWin = bet.odds;
      maxOddWinBet = bet;
    }
  });

  // Menor odd perdida
  let minOddLossBet = null;
  let minOddLoss = Infinity;
  losses.forEach((bet) => {
    if (bet.odds < minOddLoss) {
      minOddLoss = bet.odds;
      minOddLossBet = bet;
    }
  });

  // Estatísticas adicionais
  const totalProfit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);
  const winrate = settled.length ? wins.length / settled.length : 0;
  const avgOdd = settled.length ? settled.reduce((sum, bet) => sum + bet.odds, 0) / settled.length : 0;
  const avgStake = settled.length ? settled.reduce((sum, bet) => sum + bet.stake, 0) / settled.length : 0;

  return {
    totalBets: bets.length,
    totalGreens: wins.length,
    totalReds: losses.length,
    totalPending: pending.length,
    totalProfit,
    winrate,
    avgOdd,
    avgStake,
    maxProfitBet,
    maxProfit,
    maxLossBet,
    maxLoss,
    maxOddWinBet,
    maxOddWin,
    minOddLossBet,
    minOddLoss: minOddLoss === Infinity ? 0 : minOddLoss,
  };
}

function calcStatsByBook() {
  const books = Array.from(new Set(bets.map((bet) => bet.book))).sort();
  
  return books.map((book) => {
    const bookBets = bets.filter((bet) => bet.book === book);
    const settled = bookBets.filter((bet) => bet.status === 'win' || bet.status === 'loss');
    const wins = bookBets.filter((bet) => bet.status === 'win');
    const losses = bookBets.filter((bet) => bet.status === 'loss');
    const profit = settled.reduce((sum, bet) => sum + calcProfit(bet), 0);
    const totalStake = settled.reduce((sum, bet) => sum + bet.stake, 0);
    const winrate = settled.length ? wins.length / settled.length : 0;
    const roi = totalStake > 0 ? profit / totalStake : 0;

    return {
      book,
      total: bookBets.length,
      greens: wins.length,
      reds: losses.length,
      winrate,
      profit,
      roi,
    };
  });
}

function getTopProfits(count = 5) {
  return bets
    .filter((bet) => bet.status === 'win')
    .map((bet) => ({ ...bet, profit: calcProfit(bet) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, count);
}

function getTopLosses(count = 5) {
  return bets
    .filter((bet) => bet.status === 'loss')
    .map((bet) => ({ ...bet, profit: calcProfit(bet) }))
    .sort((a, b) => a.profit - b.profit)
    .slice(0, count);
}

function renderRecords() {
  const stats = calcRankingStats();

  // Recordes
  const maxProfitEl = document.getElementById('ranking-max-profit');
  const maxProfitDetailEl = document.getElementById('ranking-max-profit-detail');
  const maxLossEl = document.getElementById('ranking-max-loss');
  const maxLossDetailEl = document.getElementById('ranking-max-loss-detail');
  const maxOddWinEl = document.getElementById('ranking-max-odd-win');
  const maxOddWinDetailEl = document.getElementById('ranking-max-odd-win-detail');
  const minOddLossEl = document.getElementById('ranking-min-odd-loss');
  const minOddLossDetailEl = document.getElementById('ranking-min-odd-loss-detail');

  if (maxProfitEl) {
    maxProfitEl.textContent = formatProfit(stats.maxProfit);
    maxProfitDetailEl.textContent = stats.maxProfitBet 
      ? `${stats.maxProfitBet.event} @ ${numberFormatter.format(stats.maxProfitBet.odds)}x`
      : '-';
  }

  if (maxLossEl) {
    maxLossEl.textContent = formatProfit(-stats.maxLoss);
    maxLossDetailEl.textContent = stats.maxLossBet 
      ? `${stats.maxLossBet.event} @ ${numberFormatter.format(stats.maxLossBet.odds)}x`
      : '-';
  }

  if (maxOddWinEl) {
    maxOddWinEl.textContent = `${numberFormatter.format(stats.maxOddWin)}x`;
    maxOddWinDetailEl.textContent = stats.maxOddWinBet 
      ? `${stats.maxOddWinBet.event} - ${formatProfit(calcProfit(stats.maxOddWinBet))}`
      : '-';
  }

  if (minOddLossEl) {
    minOddLossEl.textContent = stats.minOddLoss > 0 ? `${numberFormatter.format(stats.minOddLoss)}x` : '-';
    minOddLossDetailEl.textContent = stats.minOddLossBet 
      ? `${stats.minOddLossBet.event} - ${formatProfit(calcProfit(stats.minOddLossBet))}`
      : '-';
  }
}

function renderStats() {
  const stats = calcRankingStats();

  document.getElementById('stats-total-bets').textContent = stats.totalBets;
  document.getElementById('stats-total-greens').textContent = stats.totalGreens;
  document.getElementById('stats-total-reds').textContent = stats.totalReds;
  document.getElementById('stats-pending').textContent = stats.totalPending;
  document.getElementById('stats-winrate').textContent = percentFormatter.format(stats.winrate);
  
  const profitEl = document.getElementById('stats-total-profit');
  profitEl.textContent = formatProfit(stats.totalProfit);
  profitEl.style.color = stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)';

  document.getElementById('stats-avg-odd').textContent = `${numberFormatter.format(stats.avgOdd)}x`;
  document.getElementById('stats-avg-stake').textContent = formatProfit(stats.avgStake);
}

function renderTopLists() {
  const topProfits = getTopProfits(5);
  const topLosses = getTopLosses(5);

  const profitsContainer = document.getElementById('top-profits');
  const lossesContainer = document.getElementById('top-losses');

  // Top Lucros
  profitsContainer.innerHTML = '';
  if (topProfits.length === 0) {
    profitsContainer.innerHTML = '<p class="empty-message">Nenhum green registrado ainda.</p>';
  } else {
    topProfits.forEach((bet, index) => {
      const item = document.createElement('div');
      item.className = 'top-item';
      item.innerHTML = `
        <span class="top-rank">#${index + 1}</span>
        <div class="top-info">
          <strong>${bet.event}</strong>
          <span class="top-detail">${bet.date} • ${bet.book} • ${numberFormatter.format(bet.odds)}x</span>
        </div>
        <span class="top-value positive">${formatProfit(bet.profit)}</span>
      `;
      profitsContainer.appendChild(item);
    });
  }

  // Top Perdas
  lossesContainer.innerHTML = '';
  if (topLosses.length === 0) {
    lossesContainer.innerHTML = '<p class="empty-message">Nenhum red registrado ainda.</p>';
  } else {
    topLosses.forEach((bet, index) => {
      const item = document.createElement('div');
      item.className = 'top-item';
      item.innerHTML = `
        <span class="top-rank">#${index + 1}</span>
        <div class="top-info">
          <strong>${bet.event}</strong>
          <span class="top-detail">${bet.date} • ${bet.book} • ${numberFormatter.format(bet.odds)}x</span>
        </div>
        <span class="top-value negative">${formatProfit(bet.profit)}</span>
      `;
      lossesContainer.appendChild(item);
    });
  }
}

function renderBookTable() {
  const byBook = calcStatsByBook();
  const rankingByBookBody = document.getElementById('ranking-by-book');

  rankingByBookBody.innerHTML = '';

  if (byBook.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = 'Nenhuma aposta cadastrada ainda.';
    row.appendChild(cell);
    rankingByBookBody.appendChild(row);
    return;
  }

  // Ordenar por lucro (maior para menor)
  byBook.sort((a, b) => b.profit - a.profit);

  byBook.forEach((item, index) => {
    const row = document.createElement('tr');

    const tdRank = document.createElement('td');
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
    tdRank.textContent = medal;
    row.appendChild(tdRank);

    const tdBook = document.createElement('td');
    tdBook.innerHTML = `<strong>${item.book}</strong>`;
    row.appendChild(tdBook);

    const tdTotal = document.createElement('td');
    tdTotal.textContent = item.total;
    row.appendChild(tdTotal);

    const tdGreens = document.createElement('td');
    tdGreens.textContent = item.greens;
    tdGreens.style.color = 'var(--success)';
    row.appendChild(tdGreens);

    const tdReds = document.createElement('td');
    tdReds.textContent = item.reds;
    tdReds.style.color = 'var(--danger)';
    row.appendChild(tdReds);

    const tdWinrate = document.createElement('td');
    tdWinrate.textContent = percentFormatter.format(item.winrate);
    row.appendChild(tdWinrate);

    const tdProfit = document.createElement('td');
    tdProfit.textContent = formatProfit(item.profit);
    tdProfit.style.color = item.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    tdProfit.style.fontWeight = '600';
    row.appendChild(tdProfit);

    const tdRoi = document.createElement('td');
    tdRoi.textContent = percentFormatter.format(item.roi);
    tdRoi.style.color = item.roi >= 0 ? 'var(--success)' : 'var(--danger)';
    row.appendChild(tdRoi);

    rankingByBookBody.appendChild(row);
  });
}

function renderCharts() {
  const byBook = calcStatsByBook();

  if (byBook.length === 0) return;

  const colors = [
    '#7c5cff', '#2dd4bf', '#f59e0b', '#ec4899', '#22c55e',
    '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f97316'
  ];

  // Gráfico de Distribuição por Casa
  const distributionCtx = document.getElementById('book-distribution-chart');
  if (distributionCtx && typeof Chart !== 'undefined') {
    if (bookDistributionChart) {
      bookDistributionChart.destroy();
    }

    bookDistributionChart = new Chart(distributionCtx, {
      type: 'doughnut',
      data: {
        labels: byBook.map(b => b.book),
        datasets: [{
          data: byBook.map(b => b.total),
          backgroundColor: colors.slice(0, byBook.length),
          borderColor: 'rgba(0,0,0,0.2)',
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'rgba(245, 247, 255, 0.8)',
              padding: 12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }

  // Gráfico de Lucro por Casa
  const profitCtx = document.getElementById('book-profit-chart');
  if (profitCtx && typeof Chart !== 'undefined') {
    if (bookProfitChart) {
      bookProfitChart.destroy();
    }

    const sortedByProfit = [...byBook].sort((a, b) => b.profit - a.profit);

    bookProfitChart = new Chart(profitCtx, {
      type: 'bar',
      data: {
        labels: sortedByProfit.map(b => b.book),
        datasets: [{
          label: 'Lucro',
          data: sortedByProfit.map(b => b.profit),
          backgroundColor: sortedByProfit.map(b => b.profit >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(255, 107, 107, 0.7)'),
          borderColor: sortedByProfit.map(b => b.profit >= 0 ? '#22c55e' : '#ff6b6b'),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            ticks: { color: 'rgba(245, 247, 255, 0.6)' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            ticks: { color: 'rgba(245, 247, 255, 0.6)' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  }
}

function init() {
  loadBets();
  renderRecords();
  renderStats();
  renderTopLists();
  renderBookTable();
  renderCharts();
  renderProfileSwitcher();
}

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
    window.location.reload();
  }
});

init();

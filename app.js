/**
 * CRYPTO PULSE
 * Realtids kryptovalutaspårare
 * CoinGecko API (gratis, ingen nyckel krävs)
 */

// =============================================
// KONSTANTER & KONFIGURATION
// =============================================

const API_BASE     = 'https://api.coingecko.com/api/v3';
const CURRENCY     = 'usd';
const COIN_COUNT   = 30;
const STORAGE_KEY  = 'cryptopulse_watchlist';

// =============================================
// STATE
// =============================================

let allCoins        = [];
let watchlist       = loadWatchlist();
let currentView     = 'dashboard';
let previousPrices  = {};
let isRefreshing    = false;

// =============================================
// INIT
// =============================================

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
  showToast('✓ Crypto Pulse installerad!');
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'none';
});

window.addEventListener('DOMContentLoaded', () => {
  initSplash();
  bindEvents();
  registerServiceWorker();
});

function initSplash() {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    const app    = document.getElementById('app');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      app.classList.remove('hidden');
      fetchCoins();
    }, 500);
  }, 1800);
}

// =============================================
// SERVICE WORKER
// =============================================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// =============================================
// API
// =============================================

async function fetchCoins(showIndicator = false) {
  try {
    showRefreshing(true, showIndicator);
    const url = `${API_BASE}/coins/markets?vs_currency=${CURRENCY}&order=market_cap_desc&per_page=${COIN_COUNT}&page=1&sparkline=true&price_change_percentage=24h`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('API-fel');
    const data = await res.json();
    allCoins = data;
    renderDashboard(allCoins);
    updateLastUpdated();
  } catch (e) {
    showToast('⚠️ Kunde inte hämta data. Försök igen.');
  } finally {
    showRefreshing(false);
  }
}

async function fetchCoinDetail(coinId) {
  try {
    const url = `${API_BASE}/coins/${coinId}/market_chart?vs_currency=${CURRENCY}&days=7`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return null;
  }
}

// =============================================
// RENDER: DASHBOARD
// =============================================

function renderDashboard(coins) {
  const list = document.getElementById('coin-list');
  list.innerHTML = '';

  if (!coins.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Inga resultat</p></div>';
    return;
  }

  coins.forEach((coin, i) => {
    const card = createCoinCard(coin, i);
    list.appendChild(card);
  });
}

function createCoinCard(coin, index) {
  const card    = document.createElement('div');
  card.className = 'coin-card';
  card.style.animationDelay = `${index * 40}ms`;

  const change   = coin.price_change_percentage_24h ?? 0;
  const isUp     = change >= 0;
  const price    = formatPrice(coin.current_price);
  const changeStr = `${isUp ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;

  card.innerHTML = `
    <img class="coin-logo" src="${coin.image}" alt="${coin.name}" loading="lazy" />
    <div class="coin-info">
      <div class="coin-name">${coin.name}</div>
      <div class="coin-symbol">${coin.symbol}</div>
    </div>
    <div class="coin-right">
      <div class="coin-price" id="price-${coin.id}">${price}</div>
      <div class="coin-change ${isUp ? 'up' : 'down'}">${changeStr}</div>
    </div>
  `;

  // Flash om priset har ändrats
  if (previousPrices[coin.id] !== undefined) {
    const priceEl = card.querySelector('.coin-price');
    if (coin.current_price > previousPrices[coin.id]) {
      flashPrice(priceEl, 'up');
    } else if (coin.current_price < previousPrices[coin.id]) {
      flashPrice(priceEl, 'down');
    }
  }
  previousPrices[coin.id] = coin.current_price;

  card.addEventListener('click', () => openDetail(coin.id));
  return card;
}

// =============================================
// RENDER: WATCHLIST
// =============================================

function renderWatchlist() {
  const list  = document.getElementById('watchlist-list');
  const badge = document.getElementById('watchlist-count');
  badge.textContent = watchlist.length;
  list.innerHTML = '';

  if (!watchlist.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">★</div>
        <p>Din watchlist är tom</p>
        <small>Gå till Marknaden och spara dina favoriter</small>
      </div>`;
    return;
  }

  const savedCoins = allCoins.filter(c => watchlist.includes(c.id));
  savedCoins.forEach((coin, i) => {
    const card = createCoinCard(coin, i);
    list.appendChild(card);
  });
}

// =============================================
// RENDER: DETAIL
// =============================================

async function openDetail(coinId) {
  const coin = allCoins.find(c => c.id === coinId);
  if (!coin) return;

  switchView('detail');

  const container = document.getElementById('detail-content');
  container.innerHTML = `<div class="empty-state"><div class="pull-spinner" style="margin:auto"></div></div>`;

  const chartData   = await fetchCoinDetail(coinId);
  const inWatchlist = watchlist.includes(coinId);
  const change      = coin.price_change_percentage_24h ?? 0;
  const isUp        = change >= 0;

  container.innerHTML = `
    <div class="detail-hero">
      <img class="detail-logo" src="${coin.image}" alt="${coin.name}" />
      <div class="detail-title">
        <h1>${coin.name}</h1>
        <span>${coin.symbol.toUpperCase()}</span>
      </div>
    </div>

    <div class="detail-price-block">
      <div class="detail-price">${formatPrice(coin.current_price)}</div>
      <div class="detail-change">
        <span class="detail-change-badge ${isUp ? 'up' : 'down'}">
          ${isUp ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%
        </span>
        <span class="detail-change-period">senaste 24h</span>
      </div>
    </div>

    <div class="chart-wrapper">
      <div class="chart-title">Prisutveckling — 7 dagar</div>
      <canvas id="price-chart"></canvas>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Börsvärde</div>
        <div class="stat-value">${formatLarge(coin.market_cap)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rank</div>
        <div class="stat-value">#${coin.market_cap_rank}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Högst 24h</div>
        <div class="stat-value">${formatPrice(coin.high_24h)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Lägst 24h</div>
        <div class="stat-value">${formatPrice(coin.low_24h)}</div>
      </div>
    </div>

    <button class="watchlist-btn ${inWatchlist ? 'remove' : 'add'}" id="wl-btn" data-id="${coinId}">
      <span class="star-icon">${inWatchlist ? '★' : '☆'}</span>
      ${inWatchlist ? 'Ta bort från watchlist' : 'Lägg till watchlist'}
    </button>
  `;

  // Rita grafen
  if (chartData && chartData.prices) {
    drawChart(chartData.prices, isUp);
  }

  // Watchlist-knapp event
  document.getElementById('wl-btn').addEventListener('click', (e) => {
    toggleWatchlist(coinId, e.currentTarget);
  });
}

// =============================================
// CHART
// =============================================

function drawChart(prices, isUp) {
  const canvas = document.getElementById('price-chart');
  if (!canvas) return;

  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const rect   = canvas.parentElement.getBoundingClientRect();
  const W      = rect.width - 32;
  const H      = 140;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const vals = prices.map(p => p[1]);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const toX = (i) => (i / (vals.length - 1)) * W;
  const toY = (v) => H - ((v - minV) / range) * (H * 0.8) - H * 0.1;

  const color = isUp ? '#22C55E' : '#EF4444';

  // Gradient fyll
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  // Animera ritning via requestAnimationFrame
  let progress = 0;
  const totalPoints = vals.length;

  function animate() {
    ctx.clearRect(0, 0, W, H);
    progress = Math.min(progress + 2, totalPoints - 1);
    const drawn = Math.ceil(progress);

    // Fyllnad
    ctx.beginPath();
    ctx.moveTo(toX(0), H);
    for (let i = 0; i <= drawn; i++) ctx.lineTo(toX(i), toY(vals[i]));
    ctx.lineTo(toX(drawn), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Linje
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(vals[0]));
    for (let i = 1; i <= drawn; i++) ctx.lineTo(toX(i), toY(vals[i]));
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Glödande punkt
    if (drawn < totalPoints - 1) {
      ctx.beginPath();
      ctx.arc(toX(drawn), toY(vals[drawn]), 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    if (drawn < totalPoints - 1) requestAnimationFrame(animate);
    else {
      // Sista punkt
      ctx.beginPath();
      ctx.arc(toX(totalPoints - 1), toY(vals[totalPoints - 1]), 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur  = 0;
    }
  }

  requestAnimationFrame(animate);
}

// =============================================
// WATCHLIST
// =============================================

function toggleWatchlist(coinId, btn) {
  const starEl = btn.querySelector('.star-icon');
  starEl.classList.remove('star-pop');
  void starEl.offsetWidth; // reflow
  starEl.classList.add('star-pop');

  if (watchlist.includes(coinId)) {
    watchlist = watchlist.filter(id => id !== coinId);
    btn.className = 'watchlist-btn add';
    btn.innerHTML = `<span class="star-icon">☆</span> Lägg till watchlist`;
    showToast('Borttagen från watchlist');
  } else {
    watchlist.push(coinId);
    btn.className = 'watchlist-btn remove';
    btn.innerHTML = `<span class="star-icon">★</span> Ta bort från watchlist`;
    showToast('✓ Sparad i watchlist!');
  }

  // Ny star-pop på ny knapp
  const newStar = btn.querySelector('.star-icon');
  newStar.classList.add('star-pop');

  saveWatchlist();
  renderWatchlist();
}

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveWatchlist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist)); } catch {}
}

// =============================================
// NAVIGATION
// =============================================

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  const btn = document.querySelector(`[data-view="${viewName}"]`);
  if (btn) btn.classList.add('active');

  currentView = viewName;

  if (viewName === 'watchlist') renderWatchlist();
}

// =============================================
// EVENTS
// =============================================

function bindEvents() {
  // Nav-knappar
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });

  // Tillbaka från detalj
  document.getElementById('back-btn').addEventListener('click', () => {
    switchView(currentView === 'detail' ? 'dashboard' : currentView);
    switchView('dashboard');
  });

  // Refresh-knapp
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (!isRefreshing) fetchCoins(true);
  });

  // PWA Install-knapp
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') showToast('✓ Installerar Crypto Pulse...');
      deferredInstallPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  // Sök
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = q
      ? allCoins.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
      : allCoins;
    renderDashboard(filtered);
  });

  // Pull-to-refresh med korrekt detektion
  let touchStartY = 0;
  let touchStartX = 0;
  let isPulling = false;
  const viewContainer = document.querySelector('.view-container');

  viewContainer.addEventListener('touchstart', e => {
    const activeView = document.querySelector('.view.active');
    // Starta bara om vi är högst upp på sidan
    if (activeView && activeView.scrollTop <= 0) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      isPulling = true;
    } else {
      isPulling = false;
    }
  }, { passive: true });

  viewContainer.addEventListener('touchmove', e => {
    if (!isPulling) return;
    const deltaY = e.touches[0].clientY - touchStartY;
    const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
    // Avbryt om rörelsen är mer horisontell än vertikal
    if (deltaX > deltaY) { isPulling = false; return; }
  }, { passive: true });

  viewContainer.addEventListener('touchend', e => {
    if (!isPulling || isRefreshing) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
    // Kräv tydlig nedåtrörelse (120px) och mer vertikal än horisontell
    if (deltaY > 120 && deltaY > deltaX * 2) {
      fetchCoins(true);
    }
    isPulling = false;
  }, { passive: true });
}

// =============================================
// HELPERS
// =============================================

function showRefreshing(state, showIndicator = false) {
  isRefreshing = state;
  const indicator = document.getElementById('pull-indicator');
  const refreshBtn = document.getElementById('refresh-btn');

  if (state) {
    if (showIndicator) indicator.style.height = '44px';
    refreshBtn.classList.add('spinning');
  } else {
    setTimeout(() => {
      indicator.style.height = '0px';
      refreshBtn.classList.remove('spinning');
    }, 400);
  }
}

function flashPrice(el, dir) {
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(dir === 'up' ? 'flash-up' : 'flash-down');
}

function updateLastUpdated() {
  const now = new Date();
  document.getElementById('last-updated').textContent =
    now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function formatPrice(n) {
  if (n === null || n === undefined) return '–';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatLarge(n) {
  if (!n) return '–';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString();
}
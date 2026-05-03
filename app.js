/* =========================================================
   Spend — Personal monthly tracker (PWA)
   Local-only data via IndexedDB. No network required.
   ========================================================= */

(() => {
  'use strict';

  // -------------------- Default categories --------------------
  const DEFAULT_CATS = [
    { name: 'Food', emoji: '🍽️', color: '#ff6b6b',
      subs: ['Veg', 'Non-Veg', 'Tiffin', 'Fast Food', 'Snacks', 'Sweets / Desserts'] },
    { name: 'Beverages', emoji: '🥤', color: '#4ecdc4',
      subs: ['Coconut Water', 'Buttermilk', 'Milkshakes', 'Juices', 'Tea / Coffee', 'Soft Drinks', 'Energy Drinks', 'Bottled Water'] },
    { name: 'Groceries', emoji: '🛒', color: '#ffa94d',
      subs: ['Vegetables', 'Detergent', 'Dish Wash', 'Cleaning Supplies', 'Soap & Sanitizer', 'Household'] },
    { name: 'Fruits', emoji: '🍎', color: '#fb7185',
      subs: ['Daily', 'Seasonal', 'Dry Fruits', 'Imported'] },
    { name: 'Transport', emoji: '🚗', color: '#4cc9f0',
      subs: ['Bike', 'Fuel', 'Auto', 'Cab', 'Bus', 'Train / Metro', 'Flight', 'Parking'] },
    { name: 'Bills & Utilities', emoji: '💡', color: '#fab005',
      subs: ['Electricity', 'Water', 'Internet', 'Mobile Recharge', 'Gas', 'Subscriptions'] },
    { name: 'Rent & Housing', emoji: '🏠', color: '#845ef7',
      subs: ['Rent', 'Maintenance', 'Repairs'] },
    { name: 'Health', emoji: '💊', color: '#51cf66',
      subs: ['Medicines', 'Doctor', 'Gym', 'Supplements'] },
    { name: 'Shopping', emoji: '🛍️', color: '#f06595',
      subs: ['Clothes', 'Footwear', 'Electronics', 'Accessories'] },
    { name: 'Entertainment', emoji: '🎬', color: '#22b8cf',
      subs: ['Movies', 'Games', 'Events', 'Streaming'] },
    { name: 'Personal Care', emoji: '💇', color: '#cc5de8',
      subs: ['Salon / Haircut', 'Skincare', 'Toiletries'] },
    { name: 'Education', emoji: '📚', color: '#3bc9db',
      subs: ['Books', 'Courses', 'Stationery'] },
    { name: 'Travel', emoji: '✈️', color: '#ff8787',
      subs: ['Hotels', 'Tickets', 'Activities'] },
    { name: 'Gifts & Donations', emoji: '🎁', color: '#fcc419',
      subs: ['Gifts', 'Charity'] },
    { name: 'Misc', emoji: '✨', color: '#868e96',
      subs: ['Other'] },
  ];

  const COLOR_PALETTE = [
    '#ff6b6b','#4ecdc4','#ffa94d','#5b6cff','#fab005','#845ef7',
    '#51cf66','#f06595','#22b8cf','#cc5de8','#3bc9db','#ff8787',
    '#fcc419','#868e96','#20c997','#e64980'
  ];

  const CURRENCY_SYMBOLS = { INR: '₹', USD: '$' };

  // -------------------- IndexedDB --------------------
  const DB_NAME = 'spend_db';
  const DB_VERSION = 2;
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!d.objectStoreNames.contains('categories')) {
          d.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('expenses')) {
          const s = d.createObjectStore('expenses', { keyPath: 'id' });
          s.createIndex('byDate', 'date');
          s.createIndex('byCat', 'categoryId');
        }
        if (!d.objectStoreNames.contains('savingsGoals')) {
          d.createObjectStore('savingsGoals', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('savingsEntries')) {
          const s = d.createObjectStore('savingsEntries', { keyPath: 'id' });
          s.createIndex('byDate', 'date');
          s.createIndex('byGoal', 'goalId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return db.transaction(store, mode).objectStore(store);
  }
  function dbGet(store, key) {
    return new Promise((res, rej) => {
      const r = tx(store).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function dbAll(store) {
    return new Promise((res, rej) => {
      const r = tx(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function dbPut(store, value) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').put(value);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function dbDel(store, key) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').delete(key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }
  function dbClear(store) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }

  // -------------------- App state --------------------
  const state = {
    currency: 'INR',
    allowance: 0,
    categories: [],
    expenses: [],
    viewMonth: monthKey(new Date()),
    selectedScreen: 'home',
    expandedCat: null,
    insightsRange: 'month',
    sheet: { mode: null, expense: null, catId: null, subId: null },
    catSheet: { mode: null, cat: null, color: null },
  };

  // -------------------- Helpers --------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function parseMonthKey(k) {
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  function monthLabel(k) {
    const d = parseMonthKey(k);
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }
  function shortMonthLabel(k) {
    const d = parseMonthKey(k);
    return d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
  }
  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }
  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  function daysInMonth(k) {
    const d = parseMonthKey(k);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  function fmtMoney(n) {
    const sym = CURRENCY_SYMBOLS[state.currency] || '';
    const v = Math.round((n + Number.EPSILON) * 100) / 100;
    const opts = state.currency === 'INR'
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 };
    return sym + v.toLocaleString(undefined, opts);
  }
  function fmtMoneyCompact(n) {
    const sym = CURRENCY_SYMBOLS[state.currency] || '';
    const v = Math.abs(n);
    if (v >= 100000) return sym + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
    if (v >= 1000)   return sym + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return sym + Math.round(n).toLocaleString();
  }
  function symbol() { return CURRENCY_SYMBOLS[state.currency] || ''; }
  function expensesForMonth(k) {
    return state.expenses.filter(e => e.date && e.date.startsWith(k));
  }
  function sumAmounts(arr) { return arr.reduce((a, b) => a + (b.amount || 0), 0); }

  // -------------------- Initialization --------------------
  async function init() {
    db = await openDB();

    const cur = await dbGet('settings', 'currency');
    const allow = await dbGet('settings', 'allowance');
    const cats = await dbAll('categories');
    const exps = await dbAll('expenses');

    if (cur) state.currency = cur.value;
    if (allow) state.allowance = allow.value;
    state.categories = cats;
    state.expenses = exps;

    if (!cur || !allow) {
      showOnboarding();
    } else {
      if (state.categories.length === 0) await seedCategories();
      await migrateCategories();
      showApp();
    }
  }

  const CATS_VERSION = 2;
  async function migrateCategories() {
    const v = await dbGet('settings', 'catsVersion');
    if ((v?.value || 1) >= CATS_VERSION) return;

    const groceries = state.categories.find(c => c.name === 'Groceries');
    let fruits = state.categories.find(c => c.name === 'Fruits');
    const oldFruitsSub = groceries?.subs.find(s => s.name === 'Fruits');

    if (!fruits) {
      fruits = {
        id: uid(),
        name: 'Fruits',
        emoji: '🍎',
        color: '#fb7185',
        subs: ['Daily', 'Seasonal', 'Dry Fruits', 'Imported']
          .map(n => ({ id: uid(), name: n })),
      };
      const groceriesIdx = state.categories.findIndex(c => c.name === 'Groceries');
      const insertAt = groceriesIdx >= 0 ? groceriesIdx + 1 : state.categories.length;
      state.categories.splice(insertAt, 0, fruits);
      await dbPut('categories', fruits);
    }

    if (groceries) {
      const drop = new Set(['Fruits', 'Dairy', 'Staples']);
      groceries.subs = groceries.subs.filter(s => !drop.has(s.name));
      const have = new Set(groceries.subs.map(s => s.name));
      ['Detergent', 'Dish Wash', 'Cleaning Supplies', 'Soap & Sanitizer'].forEach(n => {
        if (!have.has(n)) groceries.subs.push({ id: uid(), name: n });
      });
      await dbPut('categories', groceries);
    }

    if (oldFruitsSub && fruits) {
      const newSub = fruits.subs[0];
      for (const e of state.expenses) {
        if (e.subId === oldFruitsSub.id) {
          e.categoryId = fruits.id;
          e.subId = newSub.id;
          await dbPut('expenses', e);
        }
      }
    }

    await dbPut('settings', { key: 'catsVersion', value: CATS_VERSION });
  }

  async function seedCategories() {
    state.categories = DEFAULT_CATS.map(c => ({
      id: uid(),
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      subs: c.subs.map(s => ({ id: uid(), name: s })),
    }));
    for (const c of state.categories) await dbPut('categories', c);
  }

  // -------------------- Onboarding --------------------
  function showOnboarding() {
    $('#onboarding').classList.remove('hidden');
    $('#app').classList.add('hidden');

    let chosen = null;
    $$('.currency-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.currency-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        chosen = btn.dataset.cur;
        $('#onb-prefix').textContent = CURRENCY_SYMBOLS[chosen];
      });
    });

    $('#onb-continue').addEventListener('click', async () => {
      const amt = parseFloat($('#onb-allowance').value);
      if (!chosen) return toast('Pick a currency');
      if (!amt || amt <= 0) return toast('Enter your monthly allowance');
      state.currency = chosen;
      state.allowance = amt;
      await dbPut('settings', { key: 'currency', value: chosen });
      await dbPut('settings', { key: 'allowance', value: amt });
      await seedCategories();
      $('#onboarding').classList.add('hidden');
      showApp();
    });
  }

  // -------------------- App boot --------------------
  function showApp() {
    $('#app').classList.remove('hidden');
    bindNav();
    bindFab();
    bindSheets();
    bindSettings();
    bindInsights();
    renderAll();
  }

  function bindNav() {
    $$('[data-nav]').forEach(el => {
      el.addEventListener('click', () => switchScreen(el.dataset.nav));
    });
  }
  function switchScreen(name) {
    state.selectedScreen = name;
    $$('#app .screen').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== name));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === name));
    renderAll();
    window.scrollTo(0, 0);
  }

  function bindFab() {
    $('#fab').addEventListener('click', () => openExpenseSheet({ mode: 'create' }));
  }

  // -------------------- Render --------------------
  function renderAll() {
    if (state.selectedScreen === 'home') renderHome();
    if (state.selectedScreen === 'insights') renderInsights();
    if (state.selectedScreen === 'history') renderHistory();
    if (state.selectedScreen === 'settings') renderSettings();
  }

  // ---- HOME ----
  function renderHome() {
    const k = monthKey(new Date());
    const exps = expensesForMonth(k);
    const total = sumAmounts(exps);
    const allowance = state.allowance || 0;
    const pct = allowance > 0 ? Math.min(100, (total / allowance) * 100) : 0;
    const today = new Date();
    const dim = daysInMonth(k);
    const elapsed = today.getDate();
    const daysLeft = Math.max(0, dim - elapsed);
    const remaining = Math.max(0, allowance - total);
    const pace = daysLeft > 0 ? remaining / daysLeft : 0;

    const items = aggregateByCategory(exps);

    $('#month-name').textContent = monthLabel(k);
    $('#hero-spent').textContent = fmtMoney(total);
    $('#hero-allowance').textContent = fmtMoney(allowance);
    $('#hero-pct').textContent = `${Math.round(pct)}%`;
    $('#hero-progress').style.width = `${pct}%`;
    $('#hero-progress').style.background = pct >= 100 ? '#ffd6d6' : pct >= 85 ? '#ffeaa6' : 'white';
    $('#hero-remaining').textContent = fmtMoney(remaining);
    $('#hero-pace').textContent = `${fmtMoney(pace)}/day`;
    $('#hero-days').textContent = daysLeft;
    $('#total-tx').textContent = `${exps.length} transaction${exps.length === 1 ? '' : 's'}`;
    $('#donut-total').textContent = fmtMoney(total);

    renderDonut(items, total);
    renderCatList(items, total);
    renderRecent();
  }

  function renderRecent() {
    const list = $('#recent-list');
    if (!list) return;
    list.innerHTML = '';
    const all = state.expenses.slice().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt - a.createdAt)
    ).slice(0, 10);

    if (all.length === 0) {
      list.innerHTML = `<li class="empty">No transactions yet.<br>Tap + to add one.</li>`;
      return;
    }

    let lastDate = '';
    all.forEach(e => {
      const cat = state.categories.find(c => c.id === e.categoryId);
      const sub = cat?.subs.find(s => s.id === e.subId);
      if (e.date !== lastDate) {
        const head = document.createElement('li');
        head.className = 'date-head';
        head.textContent = formatDateLabel(e.date);
        list.appendChild(head);
        lastDate = e.date;
      }
      const timeStr = formatTime(e.time);
      const li = document.createElement('li');
      li.className = 'tx-row';
      li.innerHTML = `
        <div class="cat-dot" style="background:${(cat?.color || '#888')}22;color:${cat?.color || '#888'}">${cat?.emoji || '•'}</div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(e.note || sub?.name || cat?.name || 'Expense')}</div>
          <div class="tx-meta">${escapeHtml(cat?.name || '—')}${sub ? ' · ' + escapeHtml(sub.name) : ''}${timeStr ? ' · ' + timeStr : ''}</div>
        </div>
        <div class="tx-amt">${fmtMoney(e.amount)}</div>
      `;
      li.addEventListener('click', () => openExpenseSheet({ mode: 'edit', expense: e }));
      list.appendChild(li);
    });
  }

  function renderDonut(items, total) {
    const svg = $('#donut');
    $$('.donut-seg', svg).forEach(s => s.remove());
    if (total <= 0) return;

    const r = 80;
    const c = 2 * Math.PI * r;
    let offset = 0;

    items.forEach(({ cat, amount }) => {
      const frac = amount / total;
      const len = c * frac;
      const seg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      seg.setAttribute('cx', '100');
      seg.setAttribute('cy', '100');
      seg.setAttribute('r', r);
      seg.setAttribute('class', 'donut-seg');
      seg.setAttribute('stroke', cat.color);
      seg.setAttribute('stroke-dasharray', `${len} ${c - len}`);
      seg.setAttribute('stroke-dashoffset', `-${offset}`);
      svg.appendChild(seg);
      offset += len;
    });
  }

  function aggregateByCategory(exps) {
    const map = new Map();
    exps.forEach(e => {
      const cur = map.get(e.categoryId) || 0;
      map.set(e.categoryId, cur + (e.amount || 0));
    });
    const result = [];
    state.categories.forEach(c => {
      const a = map.get(c.id) || 0;
      if (a > 0) result.push({ cat: c, amount: a });
    });
    result.sort((a, b) => b.amount - a.amount);
    return result;
  }

  function aggregateBySub(exps, catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return [];
    const map = new Map();
    exps.filter(e => e.categoryId === catId).forEach(e => {
      const cur = map.get(e.subId) || 0;
      map.set(e.subId, cur + (e.amount || 0));
    });
    return cat.subs.map(s => ({ sub: s, amount: map.get(s.id) || 0 }))
      .filter(x => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }

  function renderCatList(items, total) {
    const list = $('#cat-list');
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = `<li class="empty">No expenses yet this month.<br>Tap + to add your first.</li>`;
      return;
    }
    const k = monthKey(new Date());
    const exps = expensesForMonth(k);
    items.forEach(({ cat, amount }) => {
      const pct = total > 0 ? (amount / total) * 100 : 0;
      const expanded = state.expandedCat === cat.id;
      const li = document.createElement('li');
      li.className = 'cat-row' + (expanded ? ' expanded' : '');
      li.innerHTML = `
        <div class="cat-dot" style="background:${cat.color}22;color:${cat.color}">${cat.emoji || '•'}</div>
        <div class="cat-info">
          <div class="cat-name">${escapeHtml(cat.name)}</div>
          <div class="cat-sub">${Math.round(pct)}% of total</div>
        </div>
        <div>
          <div class="cat-amt">${fmtMoney(amount)}</div>
        </div>
      `;
      li.addEventListener('click', () => {
        state.expandedCat = expanded ? null : cat.id;
        renderHome();
      });
      list.appendChild(li);

      if (expanded) {
        const sb = document.createElement('div');
        sb.className = 'sub-breakdown';
        const subs = aggregateBySub(exps, cat.id);
        if (subs.length === 0) {
          sb.innerHTML = `<div class="muted small">No sub-category breakdown</div>`;
        } else {
          sb.innerHTML = subs.map(({ sub, amount }) =>
            `<div class="sub-row"><span class="sn">${escapeHtml(sub.name)}</span><span>${fmtMoney(amount)}</span></div>`
          ).join('');
        }
        list.appendChild(sb);
      }
    });
  }

  // ---- INSIGHTS ----
  function bindInsights() {
    $$('#ins-range .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.insightsRange = btn.dataset.range;
        $$('#ins-range .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderInsights();
      });
    });
  }

  function rangeWindow(range) {
    const now = new Date();
    if (range === 'month') {
      const k = monthKey(now);
      const start = parseMonthKey(k);
      return { start, end: now, label: monthLabel(k) };
    }
    if (range === '3m') {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { start, end: now, label: 'Last 3 months' };
    }
    // all
    const dates = state.expenses.map(e => e.date).filter(Boolean).sort();
    const startStr = dates[0];
    const start = startStr ? new Date(startStr + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now, label: 'All time' };
  }

  function expensesInRange(range) {
    const { start, end } = rangeWindow(range);
    const startStr = isoDate(start);
    const endStr = isoDate(end);
    return state.expenses.filter(e => e.date && e.date >= startStr && e.date <= endStr);
  }

  function isoDate(d) {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    const ms = b.setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0);
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }

  function renderInsights() {
    const range = state.insightsRange;
    const exps = expensesInRange(range);
    const total = sumAmounts(exps);
    const win = rangeWindow(range);
    const days = daysBetween(win.start, new Date(win.end));

    $('#ins-total').textContent = fmtMoney(total);
    $('#ins-count').textContent = exps.length;
    $('#ins-avg-day').textContent = fmtMoney(days > 0 ? total / days : 0);
    $('#ins-avg-tx').textContent = fmtMoney(exps.length > 0 ? total / exps.length : 0);

    renderInsTip(exps, total, days, range);
    renderInsCats(exps, total);
    renderInsSubs(exps, total);
    renderInsWeekday(exps, days);
    renderInsDaily();
    renderInsMoM();
    renderInsBiggest(exps);
  }

  function renderInsTip(exps, total, days, range) {
    const tip = $('#ins-tip');
    if (exps.length === 0) {
      tip.classList.add('hidden');
      return;
    }
    if (range === 'month') {
      const k = monthKey(new Date());
      const dim = daysInMonth(k);
      const elapsed = new Date().getDate();
      const projected = elapsed > 0 ? (total / elapsed) * dim : 0;
      const allowance = state.allowance || 0;
      if (allowance > 0 && projected > allowance) {
        const over = projected - allowance;
        tip.className = 'insight-card bad';
        tip.innerHTML = `<span class="ic-emoji">⚠️</span><div class="ic-body"><h3>You're trending over by ${fmtMoney(over)}</h3><p>At your current pace you'll spend ${fmtMoney(projected)} this month — ${Math.round((projected/allowance)*100)}% of your ${fmtMoney(allowance)} allowance.</p></div>`;
        tip.classList.remove('hidden');
        return;
      }
      if (allowance > 0 && projected < allowance * 0.85) {
        const surplus = allowance - projected;
        tip.className = 'insight-card good';
        tip.innerHTML = `<span class="ic-emoji">✨</span><div class="ic-body"><h3>You're on track to save ${fmtMoney(surplus)}</h3><p>Projected spend ${fmtMoney(projected)} vs ${fmtMoney(allowance)} allowance.</p></div>`;
        tip.classList.remove('hidden');
        return;
      }
    }
    // Top-category callout (always useful)
    const cats = aggregateByCategory(exps);
    if (cats.length && total > 0) {
      const top = cats[0];
      const pct = Math.round((top.amount / total) * 100);
      if (pct >= 30) {
        tip.className = 'insight-card warn';
        tip.innerHTML = `<span class="ic-emoji">${top.cat.emoji || '📊'}</span><div class="ic-body"><h3>${escapeHtml(top.cat.name)} is ${pct}% of your spend</h3><p>${fmtMoney(top.amount)} in ${top.cat.name.toLowerCase()} ${range === 'month' ? 'this month' : range === '3m' ? 'over 3 months' : 'overall'}. Worth a closer look.</p></div>`;
        tip.classList.remove('hidden');
        return;
      }
    }
    tip.classList.add('hidden');
  }

  function renderInsCats(exps, total) {
    const list = $('#ins-cats');
    list.innerHTML = '';
    const items = aggregateByCategory(exps).slice(0, 8);
    if (items.length === 0) {
      list.innerHTML = `<li class="empty">No data for this period.</li>`;
      return;
    }
    const max = items[0].amount || 1;
    items.forEach(({ cat, amount }) => {
      const pct = total > 0 ? (amount / total) * 100 : 0;
      const w = (amount / max) * 100;
      const li = document.createElement('li');
      li.className = 'bar-item';
      li.innerHTML = `
        <div class="bar-head">
          <div class="bar-head-left">
            <div class="bar-emoji" style="background:${cat.color}22;color:${cat.color}">${cat.emoji || '•'}</div>
            <div class="bar-name">${escapeHtml(cat.name)}</div>
          </div>
          <div class="bar-amt">${fmtMoney(amount)}</div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${cat.color}"></div></div>
        <div class="bar-meta"><span>${Math.round(pct)}% of total</span></div>
      `;
      list.appendChild(li);
    });
  }

  function renderInsSubs(exps, total) {
    const list = $('#ins-subs');
    list.innerHTML = '';
    const map = new Map();
    exps.forEach(e => {
      if (!e.subId) return;
      const cat = state.categories.find(c => c.id === e.categoryId);
      const sub = cat?.subs.find(s => s.id === e.subId);
      if (!sub || !cat) return;
      const key = e.subId;
      const cur = map.get(key) || { cat, sub, amount: 0, count: 0 };
      cur.amount += e.amount || 0;
      cur.count += 1;
      map.set(key, cur);
    });
    const items = Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 6);
    if (items.length === 0) {
      list.innerHTML = `<li class="empty">No sub-category data yet.</li>`;
      return;
    }
    const max = items[0].amount || 1;
    items.forEach(({ cat, sub, amount, count }) => {
      const w = (amount / max) * 100;
      const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
      const li = document.createElement('li');
      li.className = 'bar-item';
      li.innerHTML = `
        <div class="bar-head">
          <div class="bar-head-left">
            <div class="bar-emoji" style="background:${cat.color}22;color:${cat.color}">${cat.emoji || '•'}</div>
            <div>
              <div class="bar-name">${escapeHtml(sub.name)}</div>
              <div class="muted small">${escapeHtml(cat.name)} · ${count} tx</div>
            </div>
          </div>
          <div class="bar-amt">${fmtMoney(amount)}</div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${cat.color}"></div></div>
        <div class="bar-meta"><span>${pct}% of total</span></div>
      `;
      list.appendChild(li);
    });
  }

  function renderInsWeekday(exps) {
    const wrap = $('#ins-weekday');
    wrap.innerHTML = '';
    const labels = ['S','M','T','W','T','F','S'];
    const sums = [0,0,0,0,0,0,0];
    const counts = [0,0,0,0,0,0,0];
    exps.forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date + 'T12:00:00').getDay();
      sums[d] += e.amount || 0;
      counts[d] += 1;
    });
    const max = Math.max(1, ...sums);
    let topIdx = 0;
    sums.forEach((v, i) => { if (v > sums[topIdx]) topIdx = i; });
    const fullNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    $('#ins-wkday-hint').textContent = sums[topIdx] > 0 ? `${fullNames[topIdx]} is heaviest` : '';

    sums.forEach((v, i) => {
      const h = (v / max) * 100;
      const col = document.createElement('div');
      col.className = 'bg-col' + (i === topIdx && v > 0 ? ' highlight' : '');
      col.innerHTML = `
        <div class="bg-val">${v > 0 ? fmtMoneyCompact(v) : ''}</div>
        <div class="bg-bar-wrap"><div class="bg-bar${v === 0 ? ' empty' : ''}" style="height:${Math.max(2, h)}%"></div></div>
        <div class="bg-label">${labels[i]}</div>
      `;
      wrap.appendChild(col);
    });
  }

  function renderInsDaily() {
    const wrap = $('#ins-daily');
    wrap.innerHTML = '';
    const k = monthKey(new Date());
    const dim = daysInMonth(k);
    const exps = expensesForMonth(k);
    const sums = new Array(dim).fill(0);
    exps.forEach(e => {
      const day = parseInt((e.date || '').slice(8, 10), 10);
      if (day >= 1 && day <= dim) sums[day - 1] += e.amount || 0;
    });
    const max = Math.max(1, ...sums);
    const today = new Date().getDate();
    let peakIdx = 0;
    sums.forEach((v, i) => { if (v > sums[peakIdx]) peakIdx = i; });
    const peakAmt = sums[peakIdx];

    $('#ins-daily-hint').textContent = peakAmt > 0
      ? `Peak: day ${peakIdx + 1} · ${fmtMoneyCompact(peakAmt)}`
      : 'No expenses yet';

    const bars = document.createElement('div');
    bars.className = 'daily-bars';
    sums.forEach((v, i) => {
      const day = i + 1;
      const isToday = day === today;
      const isFuture = day > today;
      const h = (v / max) * 100;
      const cls = ['daily-bar'];
      if (v === 0) cls.push('empty');
      if (isToday) cls.push('today');
      if (isFuture) cls.push('future');
      const bar = document.createElement('div');
      bar.className = cls.join(' ');
      bar.style.height = `${Math.max(v > 0 ? 4 : 2, h)}%`;
      bar.title = `Day ${day}: ${fmtMoney(v)}`;
      bars.appendChild(bar);
    });
    wrap.appendChild(bars);

    const axis = document.createElement('div');
    axis.className = 'daily-axis';
    [1, Math.ceil(dim/4), Math.ceil(dim/2), Math.ceil(3*dim/4), dim].forEach(d => {
      const sp = document.createElement('span');
      sp.textContent = d;
      axis.appendChild(sp);
    });
    wrap.appendChild(axis);
  }

  function renderInsMoM() {
    const wrap = $('#ins-mom');
    wrap.innerHTML = '';
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    const sums = months.map(k => sumAmounts(expensesForMonth(k)));
    const max = Math.max(1, ...sums);
    let peakIdx = 0;
    sums.forEach((v, i) => { if (v > sums[peakIdx]) peakIdx = i; });

    const cur = sums[5];
    const prev = sums[4];
    if (prev > 0) {
      const diff = cur - prev;
      const pct = Math.round((diff / prev) * 100);
      const sign = diff > 0 ? '+' : '';
      const dir = diff > 0 ? 'more than' : 'less than';
      $('#ins-mom-hint').textContent = `${sign}${pct}% ${dir} last month`;
    } else {
      $('#ins-mom-hint').textContent = '';
    }

    sums.forEach((v, i) => {
      const h = (v / max) * 100;
      const isCur = i === 5;
      const col = document.createElement('div');
      col.className = 'bg-col' + (isCur ? ' current' : '') + (i === peakIdx && v > 0 ? ' highlight' : '');
      col.innerHTML = `
        <div class="bg-val">${v > 0 ? fmtMoneyCompact(v) : ''}</div>
        <div class="bg-bar-wrap"><div class="bg-bar${v === 0 ? ' empty' : ''}" style="height:${Math.max(2, h)}%"></div></div>
        <div class="bg-label">${shortMonthLabel(months[i]).split(' ')[0]}</div>
      `;
      wrap.appendChild(col);
    });
  }

  function renderInsBiggest(exps) {
    const list = $('#ins-biggest');
    list.innerHTML = '';
    const top = exps.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 5);
    if (top.length === 0) {
      list.innerHTML = `<li class="empty">No transactions in this period.</li>`;
      return;
    }
    top.forEach(e => {
      const cat = state.categories.find(c => c.id === e.categoryId);
      const sub = cat?.subs.find(s => s.id === e.subId);
      const li = document.createElement('li');
      li.className = 'tx-row';
      li.innerHTML = `
        <div class="cat-dot" style="background:${(cat?.color || '#888')}22;color:${cat?.color || '#888'}">${cat?.emoji || '•'}</div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(e.note || sub?.name || cat?.name || 'Expense')}</div>
          <div class="tx-meta">${escapeHtml(cat?.name || '—')}${sub ? ' · ' + escapeHtml(sub.name) : ''} · ${formatDateLabel(e.date)}</div>
        </div>
        <div class="tx-amt">${fmtMoney(e.amount)}</div>
      `;
      li.addEventListener('click', () => openExpenseSheet({ mode: 'edit', expense: e }));
      list.appendChild(li);
    });
  }

  // ---- HISTORY ----
  function renderHistory() {
    const months = collectMonths();
    if (!months.includes(state.viewMonth)) state.viewMonth = months[0] || monthKey(new Date());

    const picker = $('#month-picker');
    picker.innerHTML = '';
    months.forEach(k => {
      const b = document.createElement('button');
      b.className = 'month-pill' + (k === state.viewMonth ? ' active' : '');
      b.textContent = shortMonthLabel(k);
      b.addEventListener('click', () => { state.viewMonth = k; renderHistory(); });
      picker.appendChild(b);
    });

    const exps = expensesForMonth(state.viewMonth)
      .slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const total = sumAmounts(exps);
    $('#hist-month-label').textContent = monthLabel(state.viewMonth);
    $('#hist-total').textContent = `${exps.length} • ${fmtMoney(total)}`;

    const list = $('#tx-list');
    list.innerHTML = '';
    if (exps.length === 0) {
      list.innerHTML = `<li class="empty">No expenses in ${monthLabel(state.viewMonth)}.</li>`;
      return;
    }

    let lastDate = '';
    exps.forEach(e => {
      const cat = state.categories.find(c => c.id === e.categoryId);
      const sub = cat?.subs.find(s => s.id === e.subId);
      if (e.date !== lastDate) {
        const head = document.createElement('li');
        head.className = 'date-head';
        head.textContent = formatDateLabel(e.date);
        list.appendChild(head);
        lastDate = e.date;
      }
      const timeStr = formatTime(e.time);
      const li = document.createElement('li');
      li.className = 'tx-row';
      li.innerHTML = `
        <div class="cat-dot" style="background:${(cat?.color || '#888')}22;color:${cat?.color || '#888'}">${cat?.emoji || '•'}</div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(e.note || sub?.name || cat?.name || 'Expense')}</div>
          <div class="tx-meta">${escapeHtml(cat?.name || '—')}${sub ? ' · ' + escapeHtml(sub.name) : ''}${timeStr ? ' · ' + timeStr : ''}</div>
        </div>
        <div class="tx-amt">${fmtMoney(e.amount)}</div>
      `;
      li.addEventListener('click', () => openExpenseSheet({ mode: 'edit', expense: e }));
      list.appendChild(li);
    });
  }

  function collectMonths() {
    const set = new Set(state.expenses.map(e => e.date?.slice(0, 7)).filter(Boolean));
    set.add(monthKey(new Date()));
    return Array.from(set).sort().reverse();
  }
  function formatDateLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d.getTime() === yest.getTime()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ---- SETTINGS ----
  function renderSettings() {
    $('#set-prefix').textContent = symbol();
    $('#set-allowance').value = state.allowance || '';
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.cur === state.currency));

    const list = $('#cat-edit-list');
    list.innerHTML = '';
    state.categories.forEach(cat => {
      const li = document.createElement('li');
      li.className = 'cat-edit-row';
      li.innerHTML = `
        <div class="cat-dot" style="background:${cat.color}22;color:${cat.color}">${cat.emoji || '•'}</div>
        <div class="cat-info">
          <div class="cat-name">${escapeHtml(cat.name)}</div>
          <div class="cat-sub">${cat.subs.length} sub-categor${cat.subs.length === 1 ? 'y' : 'ies'}</div>
        </div>
        <span class="arrow">›</span>
      `;
      li.addEventListener('click', () => openCategorySheet({ mode: 'edit', cat }));
      list.appendChild(li);
    });
  }

  function bindSettings() {
    $('#set-allowance').addEventListener('change', async (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v) && v >= 0) {
        state.allowance = v;
        await dbPut('settings', { key: 'allowance', value: v });
        toast('Allowance updated');
      }
    });

    $$('.seg-btn[data-cur]').forEach(b => {
      b.addEventListener('click', async () => {
        state.currency = b.dataset.cur;
        await dbPut('settings', { key: 'currency', value: state.currency });
        renderAll();
        toast(`Currency set to ${state.currency}`);
      });
    });

    $('#add-cat').addEventListener('click', () => openCategorySheet({ mode: 'create' }));

    $('#export-data').addEventListener('click', exportData);
    $('#import-data').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#reset-data').addEventListener('click', resetData);
  }

  async function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      currency: state.currency,
      allowance: state.allowance,
      categories: state.categories,
      expenses: state.expenses,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spend-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.categories || !data.expenses) throw new Error('Invalid backup');
        if (!confirm('This will replace all current data. Continue?')) return;
        await dbClear('categories');
        await dbClear('expenses');
        for (const c of data.categories) await dbPut('categories', c);
        for (const ex of data.expenses) await dbPut('expenses', ex);
        if (data.currency) {
          await dbPut('settings', { key: 'currency', value: data.currency });
          state.currency = data.currency;
        }
        if (data.allowance) {
          await dbPut('settings', { key: 'allowance', value: data.allowance });
          state.allowance = data.allowance;
        }
        state.categories = data.categories;
        state.expenses = data.expenses;
        renderAll();
        toast('Data imported');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function resetData() {
    if (!confirm('This will erase all expenses and reset categories. Are you sure?')) return;
    if (!confirm('Really erase everything? This cannot be undone.')) return;
    await dbClear('settings');
    await dbClear('categories');
    await dbClear('expenses');
    location.reload();
  }

  // -------------------- Sheets --------------------
  function bindSheets() {
    // Expense sheet
    $('#sheet-cancel').addEventListener('click', closeExpenseSheet);
    $('#sheet-close').addEventListener('click', closeExpenseSheet);
    $('.sheet-backdrop', $('#sheet')).addEventListener('click', closeExpenseSheet);
    $('#sheet-save').addEventListener('click', saveExpense);
    $('#sheet-delete').addEventListener('click', deleteExpense);

    // Category sheet
    $('#cat-cancel').addEventListener('click', closeCategorySheet);
    $('#cat-close').addEventListener('click', closeCategorySheet);
    $('.sheet-backdrop', $('#cat-sheet')).addEventListener('click', closeCategorySheet);
    $('#cat-save').addEventListener('click', saveCategory);
    $('#cat-delete').addEventListener('click', deleteCategory);
    $('#sub-add').addEventListener('click', addSubInline);
    $('#sub-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSubInline(); } });
  }

  function openExpenseSheet({ mode, expense = null }) {
    state.sheet.mode = mode;
    state.sheet.expense = expense;
    state.sheet.catId = expense?.categoryId || state.categories[0]?.id || null;
    state.sheet.subId = expense?.subId || null;

    $('#sheet').classList.remove('hidden');
    $('#sheet-title').textContent = mode === 'edit' ? 'Edit expense' : 'New expense';
    $('#sheet-save').textContent = mode === 'edit' ? 'Save' : 'Add';
    $('#sheet-prefix').textContent = symbol();
    $('#sheet-amount').value = expense?.amount || '';
    $('#sheet-note').value = expense?.note || '';
    $('#sheet-date').value = expense?.date || todayISO();
    $('#sheet-time').value = expense?.time || nowTime();
    $('#sheet-delete').classList.toggle('hidden', mode !== 'edit');
    renderSheetCats();
    renderSheetSubs();
    setTimeout(() => $('#sheet-amount').focus(), 100);
  }
  function closeExpenseSheet() { $('#sheet').classList.add('hidden'); }

  function renderSheetCats() {
    const row = $('#sheet-cats');
    row.innerHTML = '';
    state.categories.forEach(c => {
      const card = document.createElement('button');
      const selected = c.id === state.sheet.catId;
      card.className = 'cat-card' + (selected ? ' selected' : '');
      card.innerHTML = `
        <span class="ic" style="color:${c.color}">${c.emoji || '•'}</span>
        <span class="nm">${escapeHtml(c.name)}</span>
      `;
      card.addEventListener('click', () => {
        state.sheet.catId = c.id;
        state.sheet.subId = null;
        renderSheetCats();
        renderSheetSubs();
      });
      row.appendChild(card);
    });
  }
  function renderSheetSubs() {
    const row = $('#sheet-subs');
    row.innerHTML = '';
    const cat = state.categories.find(c => c.id === state.sheet.catId);
    if (!cat || !cat.subs.length) {
      row.innerHTML = `<span class="muted small">No sub-categories</span>`;
      return;
    }
    cat.subs.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'sub-chip' + (s.id === state.sheet.subId ? ' selected' : '');
      chip.textContent = s.name;
      chip.addEventListener('click', () => {
        state.sheet.subId = s.id;
        renderSheetSubs();
      });
      row.appendChild(chip);
    });
  }

  async function saveExpense() {
    const amt = parseFloat($('#sheet-amount').value);
    if (!amt || amt <= 0) return toast('Enter an amount');
    if (!state.sheet.catId) return toast('Pick a category');

    const cat = state.categories.find(c => c.id === state.sheet.catId);
    if (cat?.subs.length && !state.sheet.subId) return toast('Pick a sub-category');

    const e = state.sheet.expense || { id: uid(), createdAt: Date.now() };
    e.amount = amt;
    e.categoryId = state.sheet.catId;
    e.subId = state.sheet.subId;
    e.note = $('#sheet-note').value.trim();
    e.date = $('#sheet-date').value || todayISO();
    e.time = $('#sheet-time').value || nowTime();

    await dbPut('expenses', e);
    if (state.sheet.mode === 'edit') {
      const idx = state.expenses.findIndex(x => x.id === e.id);
      if (idx >= 0) state.expenses[idx] = e;
    } else {
      state.expenses.push(e);
    }
    closeExpenseSheet();
    renderAll();
    toast(state.sheet.mode === 'edit' ? 'Updated' : 'Saved');
  }

  async function deleteExpense() {
    if (!state.sheet.expense) return;
    if (!confirm('Delete this expense?')) return;
    await dbDel('expenses', state.sheet.expense.id);
    state.expenses = state.expenses.filter(x => x.id !== state.sheet.expense.id);
    closeExpenseSheet();
    renderAll();
    toast('Deleted');
  }

  // ---- Category sheet ----
  function openCategorySheet({ mode, cat = null }) {
    state.catSheet.mode = mode;
    state.catSheet.cat = cat ? JSON.parse(JSON.stringify(cat)) : {
      id: uid(),
      name: '',
      emoji: '✨',
      color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
      subs: [],
    };
    $('#cat-sheet').classList.remove('hidden');
    $('#cat-title').textContent = mode === 'edit' ? 'Edit category' : 'New category';
    $('#cat-name').value = state.catSheet.cat.name;
    $('#cat-emoji').value = state.catSheet.cat.emoji;
    $('#cat-delete').classList.toggle('hidden', mode !== 'edit');
    renderCatColors();
    renderSubEditList();
  }
  function closeCategorySheet() { $('#cat-sheet').classList.add('hidden'); }

  function renderCatColors() {
    const row = $('#cat-colors');
    row.innerHTML = '';
    COLOR_PALETTE.forEach(col => {
      const sw = document.createElement('button');
      sw.className = 'color-swatch' + (col === state.catSheet.cat.color ? ' selected' : '');
      sw.style.background = col;
      sw.addEventListener('click', () => {
        state.catSheet.cat.color = col;
        renderCatColors();
      });
      row.appendChild(sw);
    });
  }

  function renderSubEditList() {
    const list = $('#sub-edit-list');
    list.innerHTML = '';
    state.catSheet.cat.subs.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'sub-edit-row';
      li.innerHTML = `<span>${escapeHtml(s.name)}</span><button class="x" aria-label="Remove">✕</button>`;
      li.querySelector('.x').addEventListener('click', () => {
        state.catSheet.cat.subs.splice(i, 1);
        renderSubEditList();
      });
      list.appendChild(li);
    });
  }
  function addSubInline() {
    const input = $('#sub-new');
    const v = input.value.trim();
    if (!v) return;
    state.catSheet.cat.subs.push({ id: uid(), name: v });
    input.value = '';
    renderSubEditList();
    input.focus();
  }

  async function saveCategory() {
    const name = $('#cat-name').value.trim();
    const emoji = $('#cat-emoji').value.trim() || '✨';
    if (!name) return toast('Enter a name');
    state.catSheet.cat.name = name;
    state.catSheet.cat.emoji = emoji;
    await dbPut('categories', state.catSheet.cat);

    if (state.catSheet.mode === 'edit') {
      const idx = state.categories.findIndex(c => c.id === state.catSheet.cat.id);
      if (idx >= 0) state.categories[idx] = state.catSheet.cat;
    } else {
      state.categories.push(state.catSheet.cat);
    }
    closeCategorySheet();
    renderAll();
    toast('Saved');
  }

  async function deleteCategory() {
    if (state.catSheet.mode !== 'edit') return;
    const id = state.catSheet.cat.id;
    const used = state.expenses.some(e => e.categoryId === id);
    const msg = used
      ? 'This category has expenses linked to it. Delete category and ALL its expenses?'
      : 'Delete this category?';
    if (!confirm(msg)) return;
    await dbDel('categories', id);
    state.categories = state.categories.filter(c => c.id !== id);
    if (used) {
      const toRemove = state.expenses.filter(e => e.categoryId === id);
      for (const e of toRemove) await dbDel('expenses', e.id);
      state.expenses = state.expenses.filter(e => e.categoryId !== id);
    }
    closeCategorySheet();
    renderAll();
    toast('Deleted');
  }

  // -------------------- Toast --------------------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // -------------------- Service worker --------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // -------------------- Go --------------------
  init().catch(err => {
    console.error(err);
    document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif">
      <h2>Couldn't start</h2><p>${escapeHtml(err.message)}</p></div>`;
  });
})();

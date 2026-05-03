/* =========================================================
   Spend — Personal monthly tracker (PWA)
   Local-only data via IndexedDB. No network required.
   ========================================================= */

(() => {
  'use strict';

  // -------------------- Default categories --------------------
  // Order = display order (most common first).
  const DEFAULT_CATS = [
    { name: 'Food', emoji: '🍽️', color: '#c44545',
      subs: ['Veg', 'Non-Veg', 'Tiffin', 'Fast Food', 'Snacks', 'Sweets / Desserts'] },
    { name: 'Transport', emoji: '🚗', color: '#2d63a8',
      subs: ['Bike', 'Fuel', 'Auto', 'Cab', 'Bus', 'Train / Metro', 'Flight', 'Parking'] },
    { name: 'Beverages', emoji: '🥤', color: '#20897a',
      subs: ['Coconut Water', 'Buttermilk', 'Milkshakes', 'Juices', 'Tea / Coffee', 'Soft Drinks', 'Energy Drinks', 'Bottled Water'] },
    { name: 'Groceries', emoji: '🛒', color: '#d39728',
      subs: ['Vegetables', 'Detergent', 'Dish Wash', 'Cleaning Supplies', 'Soap & Sanitizer', 'Household'] },
    { name: 'Fruits', emoji: '🍎', color: '#a93151',
      subs: ['Daily', 'Seasonal', 'Dry Fruits', 'Imported'] },
    { name: 'Bills & Utilities', emoji: '💡', color: '#e0a91a',
      subs: ['Electricity', 'Water', 'Internet', 'Mobile Recharge', 'Gas', 'Subscriptions'] },
    { name: 'Rent & Housing', emoji: '🏠', color: '#6f3d85',
      subs: ['Rent', 'Maintenance', 'Repairs'] },
    { name: 'Health', emoji: '💊', color: '#4a824a',
      subs: ['Medicines', 'Doctor', 'Gym', 'Supplements'] },
    { name: 'Shopping', emoji: '🛍️', color: '#be4b81',
      subs: ['Clothes', 'Footwear', 'Electronics', 'Accessories'] },
    { name: 'Entertainment', emoji: '🎬', color: '#347c8d',
      subs: ['Movies', 'Games', 'Events', 'Streaming'] },
    { name: 'Personal Care', emoji: '💇', color: '#8b4a9d',
      subs: ['Salon / Haircut', 'Skincare', 'Toiletries'] },
    { name: 'Education', emoji: '📚', color: '#557da6',
      subs: ['Books', 'Courses', 'Stationery'] },
    { name: 'Travel', emoji: '✈️', color: '#b8632a',
      subs: ['Hotels', 'Tickets', 'Activities'] },
    { name: 'Gifts & Donations', emoji: '🎁', color: '#cd9824',
      subs: ['Gifts', 'Charity'] },
    { name: 'Misc', emoji: '✨', color: '#7d7167',
      subs: ['Other'] },
  ];

  const DEFAULT_ORDER = {};
  DEFAULT_CATS.forEach((c, i) => { DEFAULT_ORDER[c.name] = (i + 1) * 10; });

  const COLOR_PALETTE = [
    '#c44545','#2d63a8','#20897a','#d39728','#a93151','#e0a91a',
    '#6f3d85','#4a824a','#be4b81','#347c8d','#8b4a9d','#557da6',
    '#b8632a','#cd9824','#7d7167','#5a4742'
  ];

  // Maps both the original brights and the v3 muted set to the v4 rich set.
  const COLOR_MIGRATION_V4 = {
    '#ff6b6b': '#c44545', '#a04848': '#c44545',
    '#4ecdc4': '#20897a', '#5a8b85': '#20897a',
    '#ffa94d': '#d39728', '#b58339': '#d39728',
    '#fb7185': '#a93151', '#8d3a47': '#a93151',
    '#4cc9f0': '#2d63a8', '#4a6885': '#2d63a8',
    '#fab005': '#e0a91a', '#c89a3e': '#e0a91a',
    '#845ef7': '#6f3d85', '#6e4a7d': '#6f3d85',
    '#51cf66': '#4a824a', '#618451': '#4a824a',
    '#f06595': '#be4b81', '#9d567a': '#be4b81',
    '#22b8cf': '#347c8d', '#5d8083': '#347c8d',
    '#cc5de8': '#8b4a9d', '#8f6e93': '#8b4a9d',
    '#3bc9db': '#557da6', '#6c8aa0': '#557da6',
    '#ff8787': '#b8632a', '#936239': '#b8632a',
    '#fcc419': '#cd9824', '#b08948': '#cd9824',
    '#868e96': '#7d7167', '#7d7163': '#7d7167',
  };

  const CURRENCY_SYMBOLS = { INR: '₹', USD: '$' };

  // -------------------- IndexedDB --------------------
  const DB_NAME = 'spend_db';
  const DB_VERSION = 4;
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
        if (!d.objectStoreNames.contains('extras')) {
          const s = d.createObjectStore('extras', { keyPath: 'id' });
          s.createIndex('byMonth', 'month');
        }
        if (!d.objectStoreNames.contains('cash')) {
          const s = d.createObjectStore('cash', { keyPath: 'id' });
          s.createIndex('byDate', 'date');
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
    extras: [],
    cash: [],
    viewMonth: monthKey(new Date()),
    selectedScreen: 'home',
    expandedCat: null,
    insightsRange: 'month',
    sheet: { mode: null, expense: null, catId: null, subId: null },
    catSheet: { mode: null, cat: null, color: null },
    extraSheet: { mode: null, extra: null },
    cashSheet: { mode: null, entry: null, type: 'add', catId: null, subId: null },
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
  function focusAmount(sel) {
    const el = $(sel);
    if (!el) return;
    el.offsetHeight; // flush layout so focus works on freshly-shown sheets
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    if (typeof el.select === 'function') el.select();
  }
  function expensesForMonth(k) {
    return state.expenses.filter(e => e.date && e.date.startsWith(k));
  }
  function extrasForMonth(k) {
    return state.extras.filter(x => x.month === k);
  }
  function cashAddsForMonth(k) {
    return state.cash.filter(c => c.type !== 'use' && c.date && c.date.startsWith(k));
  }
  function cashUsesForMonth(k) {
    return state.cash.filter(c => c.type === 'use' && c.date && c.date.startsWith(k));
  }
  function allowanceForMonth(k) {
    return (state.allowance || 0)
      + sumAmounts(extrasForMonth(k))
      + sumAmounts(cashAddsForMonth(k));
  }
  function cashUseAsExpense(c) {
    return {
      id: 'cash:' + c.id,
      cashId: c.id,
      isCash: true,
      amount: c.amount,
      categoryId: c.categoryId,
      subId: c.subId,
      note: c.note,
      date: c.date,
      time: c.time,
      createdAt: c.createdAt,
    };
  }
  function getAllExpenses() {
    return [...state.expenses, ...state.cash.filter(c => c.type === 'use').map(cashUseAsExpense)];
  }
  function getAllExpensesForMonth(k) {
    return [...expensesForMonth(k), ...cashUsesForMonth(k).map(cashUseAsExpense)];
  }
  function sumAmounts(arr) { return arr.reduce((a, b) => a + (b.amount || 0), 0); }
  function cashBalance() {
    return state.cash.reduce((a, c) => a + (c.type === 'use' ? -1 : 1) * (c.amount || 0), 0);
  }

  // -------------------- Initialization --------------------
  async function init() {
    db = await openDB();

    const cur = await dbGet('settings', 'currency');
    const allow = await dbGet('settings', 'allowance');
    const cats = await dbAll('categories');
    const exps = await dbAll('expenses');
    const extras = await dbAll('extras');
    const cash = await dbAll('cash');

    if (cur) state.currency = cur.value;
    if (allow) state.allowance = allow.value;
    state.categories = cats;
    state.expenses = exps;
    state.extras = extras;
    state.cash = cash;

    if (!cur || !allow) {
      showOnboarding();
    } else {
      if (state.categories.length === 0) await seedCategories();
      await migrateCategories();
      sortCats();
      showApp();
    }
  }

  const CATS_VERSION = 4;
  async function migrateCategories() {
    const v = await dbGet('settings', 'catsVersion');
    const cur = v?.value || 1;
    if (cur >= CATS_VERSION) return;

    if (cur < 2) {
      const groceries = state.categories.find(c => c.name === 'Groceries');
      let fruits = state.categories.find(c => c.name === 'Fruits');
      const oldFruitsSub = groceries?.subs.find(s => s.name === 'Fruits');

      if (!fruits) {
        fruits = {
          id: uid(),
          name: 'Fruits',
          emoji: '🍎',
          color: '#8d3a47',
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
    }

    if (cur < 4) {
      for (const cat of state.categories) {
        let changed = false;
        if (cat.order == null) {
          cat.order = DEFAULT_ORDER[cat.name] ?? 200;
          changed = true;
        }
        const next = COLOR_MIGRATION_V4[(cat.color || '').toLowerCase()];
        if (next && cat.color !== next) {
          cat.color = next;
          changed = true;
        }
        if (changed) await dbPut('categories', cat);
      }
    }

    await dbPut('settings', { key: 'catsVersion', value: CATS_VERSION });
  }

  async function seedCategories() {
    state.categories = DEFAULT_CATS.map((c, i) => ({
      id: uid(),
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      order: (i + 1) * 10,
      subs: c.subs.map(s => ({ id: uid(), name: s })),
    }));
    for (const c of state.categories) await dbPut('categories', c);
  }

  function sortCats() {
    state.categories.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
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
      sortCats();
      await dbPut('settings', { key: 'catsVersion', value: CATS_VERSION });
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
    $('#fab').addEventListener('click', () => {
      if (state.selectedScreen === 'cash') openCashSheet({ mode: 'create', type: 'add' });
      else openExpenseSheet({ mode: 'create' });
    });
    $('#add-extra').addEventListener('click', () => openExtraSheet({ mode: 'create' }));
    $('#hero-extra-line').addEventListener('click', () => openExtraList());
    $('#cash-add-btn').addEventListener('click', () => openCashSheet({ mode: 'create', type: 'add' }));
    $('#cash-use-btn').addEventListener('click', () => openCashSheet({ mode: 'create', type: 'use' }));
  }

  // ---- Cash ----
  function renderCash() {
    const balance = cashBalance();
    $('#cash-balance').textContent = fmtMoney(balance);
    const totalIn = sumAmounts(state.cash.filter(c => c.type !== 'use'));
    const totalOut = sumAmounts(state.cash.filter(c => c.type === 'use'));
    $('#cash-summary').textContent = state.cash.length === 0
      ? 'No entries yet'
      : `${fmtMoney(totalIn)} in · ${fmtMoney(totalOut)} out`;

    const list = $('#cash-list');
    list.innerHTML = '';
    const sorted = state.cash.slice().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt - a.createdAt)
    );
    if (sorted.length === 0) {
      list.innerHTML = `<li class="empty">No cash movements yet.<br>Tap "+ Add cash" when you load your wallet.</li>`;
      return;
    }
    let lastDate = '';
    sorted.forEach(c => {
      if (c.date !== lastDate) {
        const head = document.createElement('li');
        head.className = 'date-head';
        head.textContent = formatDateLabel(c.date);
        list.appendChild(head);
        lastDate = c.date;
      }
      const isUse = c.type === 'use';
      const sign = isUse ? '−' : '+';
      const timeStr = formatTime(c.time);
      const cat = isUse ? state.categories.find(x => x.id === c.categoryId) : null;
      const sub = cat?.subs.find(s => s.id === c.subId);
      const title = c.note || sub?.name || cat?.name || (isUse ? 'Used cash' : 'Added cash');
      const meta = isUse
        ? `${cat ? escapeHtml(cat.name) : '—'}${sub ? ' · ' + escapeHtml(sub.name) : ''}${timeStr ? ' · ' + timeStr : ''}`
        : `Loaded into wallet${timeStr ? ' · ' + timeStr : ''}`;
      const li = document.createElement('li');
      li.className = 'tx-row cash-row' + (isUse ? ' use' : ' add');
      li.innerHTML = `
        <div class="cash-dot ${isUse ? 'use' : 'add'}"${cat ? ` style="background:${cat.color}22;color:${cat.color}"` : ''}>${cat?.emoji || (isUse ? '−' : '+')}</div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(title)}</div>
          <div class="tx-meta">${meta}</div>
        </div>
        <div class="tx-amt cash-amt ${isUse ? 'use' : 'add'}">${sign}${fmtMoney(c.amount)}</div>
      `;
      li.addEventListener('click', () => openCashSheet({ mode: 'edit', entry: c }));
      list.appendChild(li);
    });
  }

  function openCashSheet({ mode, entry = null, type = null }) {
    state.cashSheet.mode = mode;
    state.cashSheet.entry = entry;
    state.cashSheet.type = entry?.type || type || 'add';
    state.cashSheet.catId = entry?.categoryId || (state.cashSheet.type === 'use' ? state.categories[0]?.id : null) || null;
    state.cashSheet.subId = entry?.subId || null;
    $('#cash-sheet').classList.remove('hidden');
    $('#cash-sheet-title').textContent = mode === 'edit'
      ? (state.cashSheet.type === 'use' ? 'Edit cash used' : 'Edit cash added')
      : (state.cashSheet.type === 'use' ? 'Used cash' : 'Add cash');
    $('#cash-sheet-save').textContent = mode === 'edit' ? 'Save' : (state.cashSheet.type === 'use' ? 'Subtract' : 'Add');
    $('#cash-prefix').textContent = symbol();
    $('#cash-amount').value = entry?.amount || '';
    $('#cash-note').value = entry?.note || '';
    $('#cash-date').value = entry?.date || todayISO();
    $('#cash-time').value = entry?.time || nowTime();
    $('#cash-delete').classList.toggle('hidden', mode !== 'edit');
    $('#cash-sheet').classList.toggle('use-mode', state.cashSheet.type === 'use');
    $$('.cash-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === state.cashSheet.type));
    renderCashSheetCategorySection();
    focusAmount('#cash-amount');
  }

  function renderCashSheetCategorySection() {
    const section = $('#cash-cat-section');
    if (!section) return;
    const isUse = state.cashSheet.type === 'use';
    section.classList.toggle('hidden', !isUse);
    if (!isUse) return;
    const catRow = $('#cash-cats');
    catRow.innerHTML = '';
    state.categories.forEach(c => {
      const card = document.createElement('button');
      const selected = c.id === state.cashSheet.catId;
      card.className = 'cat-card' + (selected ? ' selected' : '');
      card.innerHTML = `
        <span class="ic" style="color:${c.color}">${c.emoji || '•'}</span>
        <span class="nm">${escapeHtml(c.name)}</span>
      `;
      card.addEventListener('click', () => {
        state.cashSheet.catId = c.id;
        state.cashSheet.subId = null;
        renderCashSheetCategorySection();
      });
      catRow.appendChild(card);
    });
    const subRow = $('#cash-subs');
    subRow.innerHTML = '';
    const cat = state.categories.find(c => c.id === state.cashSheet.catId);
    if (!cat || !cat.subs.length) {
      subRow.innerHTML = `<span class="muted small">No sub-categories</span>`;
      return;
    }
    cat.subs.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'sub-chip' + (s.id === state.cashSheet.subId ? ' selected' : '');
      chip.textContent = s.name;
      chip.addEventListener('click', () => {
        state.cashSheet.subId = s.id;
        renderCashSheetCategorySection();
      });
      subRow.appendChild(chip);
    });
  }
  function closeCashSheet() { $('#cash-sheet').classList.add('hidden'); }

  async function saveCash() {
    const amt = parseFloat($('#cash-amount').value);
    if (!amt || amt <= 0) return toast('Enter an amount');
    const isUse = state.cashSheet.type === 'use';
    if (isUse) {
      if (!state.cashSheet.catId) return toast('Pick a category');
      const cat = state.categories.find(c => c.id === state.cashSheet.catId);
      if (cat?.subs.length && !state.cashSheet.subId) return toast('Pick a sub-category');
    }
    const c = state.cashSheet.entry || { id: uid(), createdAt: Date.now() };
    c.amount = amt;
    c.type = state.cashSheet.type;
    c.note = $('#cash-note').value.trim();
    c.date = $('#cash-date').value || todayISO();
    c.time = $('#cash-time').value || nowTime();
    c.categoryId = isUse ? state.cashSheet.catId : null;
    c.subId = isUse ? state.cashSheet.subId : null;
    await dbPut('cash', c);
    if (state.cashSheet.mode === 'edit') {
      const idx = state.cash.findIndex(x => x.id === c.id);
      if (idx >= 0) state.cash[idx] = c;
    } else {
      state.cash.push(c);
    }
    closeCashSheet();
    renderAll();
    const verb = c.type === 'use' ? 'Subtracted' : 'Added';
    toast(state.cashSheet.mode === 'edit' ? 'Updated' : `${verb} ${fmtMoney(amt)}`);
  }

  async function deleteCash() {
    if (!state.cashSheet.entry) return;
    if (!confirm('Delete this cash entry?')) return;
    await dbDel('cash', state.cashSheet.entry.id);
    state.cash = state.cash.filter(x => x.id !== state.cashSheet.entry.id);
    closeCashSheet();
    renderAll();
    toast('Deleted');
  }

  function openExtraSheet({ mode, extra = null }) {
    state.extraSheet.mode = mode;
    state.extraSheet.extra = extra;
    $('#extra-sheet').classList.remove('hidden');
    $('#extra-sheet-title').textContent = mode === 'edit' ? 'Edit extra income' : 'Add extra income';
    $('#extra-sheet-save').textContent = mode === 'edit' ? 'Save' : 'Add';
    $('#extra-prefix').textContent = symbol();
    $('#extra-amount').value = extra?.amount || '';
    $('#extra-note').value = extra?.note || '';
    $('#extra-date').value = extra?.date || todayISO();
    $('#extra-delete').classList.toggle('hidden', mode !== 'edit');
    focusAmount('#extra-amount');
  }
  function closeExtraSheet() { $('#extra-sheet').classList.add('hidden'); }

  async function saveExtra() {
    const amt = parseFloat($('#extra-amount').value);
    if (!amt || amt <= 0) return toast('Enter an amount');
    const date = $('#extra-date').value || todayISO();
    const e = state.extraSheet.extra || { id: uid(), createdAt: Date.now() };
    e.amount = amt;
    e.note = $('#extra-note').value.trim();
    e.date = date;
    e.month = date.slice(0, 7);
    await dbPut('extras', e);
    if (state.extraSheet.mode === 'edit') {
      const idx = state.extras.findIndex(x => x.id === e.id);
      if (idx >= 0) state.extras[idx] = e;
    } else {
      state.extras.push(e);
    }
    closeExtraSheet();
    renderAll();
    toast(state.extraSheet.mode === 'edit' ? 'Updated' : `+${fmtMoney(amt)} added`);
  }

  async function deleteExtra() {
    if (!state.extraSheet.extra) return;
    if (!confirm('Delete this income entry?')) return;
    await dbDel('extras', state.extraSheet.extra.id);
    state.extras = state.extras.filter(x => x.id !== state.extraSheet.extra.id);
    closeExtraSheet();
    renderAll();
    toast('Deleted');
  }

  function openExtraList() {
    const k = monthKey(new Date());
    const list = extrasForMonth(k).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (list.length === 0) return openExtraSheet({ mode: 'create' });
    if (list.length === 1) return openExtraSheet({ mode: 'edit', extra: list[0] });
    const lines = list.map((x, i) => `${i + 1}. ${fmtMoney(x.amount)}${x.note ? ' — ' + x.note : ''} (${x.date})`).join('\n');
    const choice = prompt(`Extra income this month:\n\n${lines}\n\nType a number to edit, or "new" to add another:`, 'new');
    if (choice === null) return;
    if (choice === 'new' || choice === '') return openExtraSheet({ mode: 'create' });
    const idx = parseInt(choice, 10) - 1;
    if (idx >= 0 && idx < list.length) openExtraSheet({ mode: 'edit', extra: list[idx] });
  }

  // -------------------- Render --------------------
  function renderAll() {
    if (state.selectedScreen === 'home') renderHome();
    if (state.selectedScreen === 'cash') renderCash();
    if (state.selectedScreen === 'insights') renderInsights();
    if (state.selectedScreen === 'history') renderHistory();
    if (state.selectedScreen === 'settings') renderSettings();
  }

  // ---- HOME ----
  function renderHome() {
    const k = monthKey(new Date());
    const exps = getAllExpensesForMonth(k);
    const total = sumAmounts(exps);
    const monthExtras = extrasForMonth(k);
    const extrasTotal = sumAmounts(monthExtras);
    const allowance = allowanceForMonth(k);
    const pct = allowance > 0 ? Math.min(100, (total / allowance) * 100) : 0;
    const today = new Date();
    const dim = daysInMonth(k);
    const elapsed = today.getDate();
    const daysLeft = Math.max(0, dim - elapsed);
    // Remaining excludes cash flow — that lives in the Cash tab.
    const digitalAllowance = (state.allowance || 0) + extrasTotal;
    const digitalSpent = sumAmounts(expensesForMonth(k));
    const remaining = Math.max(0, digitalAllowance - digitalSpent);
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

    const extraLine = $('#hero-extra-line');
    if (extrasTotal > 0) {
      extraLine.classList.remove('hidden');
      extraLine.innerHTML = `+${fmtMoney(extrasTotal)} extra income · <span>tap to manage</span>`;
    } else {
      extraLine.classList.add('hidden');
    }

    renderDonut(items, total);
    renderCatList(items, total);
    renderRecent();
  }

  function renderRecent() {
    const list = $('#recent-list');
    if (!list) return;
    list.innerHTML = '';
    const all = getAllExpenses().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt - a.createdAt)
    ).slice(0, 10);

    if (all.length === 0) {
      list.innerHTML = `<li class="empty">No transactions yet.<br>Tap + to add one.</li>`;
      return;
    }

    let lastDate = '';
    all.forEach(e => {
      if (e.date !== lastDate) {
        const head = document.createElement('li');
        head.className = 'date-head';
        head.textContent = formatDateLabel(e.date);
        list.appendChild(head);
        lastDate = e.date;
      }
      list.appendChild(renderTxRow(e));
    });
  }

  function renderTxRow(e) {
    const cat = state.categories.find(c => c.id === e.categoryId);
    const sub = cat?.subs.find(s => s.id === e.subId);
    const timeStr = formatTime(e.time);
    const li = document.createElement('li');
    li.className = 'tx-row' + (e.isCash ? ' cash-tx' : '');
    li.innerHTML = `
      <div class="cat-dot" style="background:${(cat?.color || '#888')}22;color:${cat?.color || '#888'}">${cat?.emoji || '•'}</div>
      <div class="tx-info">
        <div class="tx-title">${escapeHtml(e.note || sub?.name || cat?.name || 'Expense')}</div>
        <div class="tx-meta">${e.isCash ? '<span class="cash-badge">CASH</span> ' : ''}${escapeHtml(cat?.name || '—')}${sub ? ' · ' + escapeHtml(sub.name) : ''}${timeStr ? ' · ' + timeStr : ''}</div>
      </div>
      <div class="tx-amt">${fmtMoney(e.amount)}</div>
    `;
    li.addEventListener('click', () => {
      if (e.isCash) {
        const entry = state.cash.find(c => c.id === e.cashId);
        if (entry) openCashSheet({ mode: 'edit', entry });
      } else {
        openExpenseSheet({ mode: 'edit', expense: e });
      }
    });
    return li;
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
    const exps = getAllExpensesForMonth(k);
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
    const dates = getAllExpenses().map(e => e.date).filter(Boolean).sort();
    const startStr = dates[0];
    const start = startStr ? new Date(startStr + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now, label: 'All time' };
  }

  function expensesInRange(range) {
    const { start, end } = rangeWindow(range);
    const startStr = isoDate(start);
    const endStr = isoDate(end);
    return getAllExpenses().filter(e => e.date && e.date >= startStr && e.date <= endStr);
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
      const allowance = allowanceForMonth(k);
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
    const exps = getAllExpensesForMonth(k);
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
    const sums = months.map(k => sumAmounts(getAllExpensesForMonth(k)));
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

    const exps = getAllExpensesForMonth(state.viewMonth)
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
      if (e.date !== lastDate) {
        const head = document.createElement('li');
        head.className = 'date-head';
        head.textContent = formatDateLabel(e.date);
        list.appendChild(head);
        lastDate = e.date;
      }
      list.appendChild(renderTxRow(e));
    });
  }

  function collectMonths() {
    const set = new Set();
    state.expenses.forEach(e => { if (e.date) set.add(e.date.slice(0, 7)); });
    state.cash.forEach(c => { if (c.date) set.add(c.date.slice(0, 7)); });
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

    // Extra income sheet
    $('#extra-cancel').addEventListener('click', closeExtraSheet);
    $('#extra-close').addEventListener('click', closeExtraSheet);
    $('.sheet-backdrop', $('#extra-sheet')).addEventListener('click', closeExtraSheet);
    $('#extra-sheet-save').addEventListener('click', saveExtra);
    $('#extra-delete').addEventListener('click', deleteExtra);

    // Cash sheet
    $('#cash-cancel').addEventListener('click', closeCashSheet);
    $('#cash-close').addEventListener('click', closeCashSheet);
    $('.sheet-backdrop', $('#cash-sheet')).addEventListener('click', closeCashSheet);
    $('#cash-sheet-save').addEventListener('click', saveCash);
    $('#cash-delete').addEventListener('click', deleteCash);
    $$('.cash-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.cashSheet.type = btn.dataset.type;
        if (state.cashSheet.type === 'use' && !state.cashSheet.catId) {
          state.cashSheet.catId = state.categories[0]?.id || null;
        }
        $$('.cash-type-btn').forEach(b => b.classList.toggle('active', b === btn));
        $('#cash-sheet').classList.toggle('use-mode', state.cashSheet.type === 'use');
        $('#cash-sheet-title').textContent = state.cashSheet.mode === 'edit'
          ? (state.cashSheet.type === 'use' ? 'Edit cash used' : 'Edit cash added')
          : (state.cashSheet.type === 'use' ? 'Used cash' : 'Add cash');
        if (state.cashSheet.mode !== 'edit') {
          $('#cash-sheet-save').textContent = state.cashSheet.type === 'use' ? 'Subtract' : 'Add';
        }
        renderCashSheetCategorySection();
      });
    });
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
    focusAmount('#sheet-amount');
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
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage({ type: 'skip-waiting' });
            }
          });
        });
      }).catch(() => {});
      let reloadingFromSW = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingFromSW) return;
        reloadingFromSW = true;
        setTimeout(() => window.location.reload(), 50);
      });
    });
  }

  // -------------------- Go --------------------
  init().catch(err => {
    console.error(err);
    document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif">
      <h2>Couldn't start</h2><p>${escapeHtml(err.message)}</p></div>`;
  });
})();

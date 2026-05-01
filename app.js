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
      subs: ['Vegetables', 'Fruits', 'Dairy', 'Staples', 'Household'] },
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
  const DB_VERSION = 1;
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
  function isCurrentMonth(k) {
    return k === monthKey(new Date());
  }
  function fmtMoney(n) {
    const sym = CURRENCY_SYMBOLS[state.currency] || '';
    const v = Math.round((n + Number.EPSILON) * 100) / 100;
    const opts = state.currency === 'INR'
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 };
    return sym + v.toLocaleString(undefined, opts);
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
      showApp();
    }
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

    renderQuickInsight(exps, total, allowance, elapsed, dim);
    renderDonut(exps, total);
    renderCatList(exps, total);
  }

  function renderQuickInsight(exps, total, allowance, elapsed, dim) {
    const el = $('#quick-insight');
    if (!exps.length || allowance <= 0) {
      el.classList.add('hidden');
      return;
    }
    const expectedPace = (allowance / dim) * elapsed;
    const ratio = total / Math.max(1, expectedPace);
    let cls = 'good', emoji = '✅', title = 'On track', body = '';

    if (total >= allowance) {
      cls = 'bad'; emoji = '🚨';
      title = 'Allowance exceeded';
      body = `You're ${fmtMoney(total - allowance)} over budget with ${dim - elapsed} days left.`;
    } else if (ratio > 1.25) {
      cls = 'bad'; emoji = '⚠️';
      title = 'Spending too fast';
      const projected = (total / elapsed) * dim;
      body = `At this pace you'll hit ${fmtMoney(projected)} — ${fmtMoney(projected - allowance)} over allowance.`;
    } else if (ratio > 1.05) {
      cls = 'warn'; emoji = '⏱️';
      title = 'A bit ahead of pace';
      body = `You've spent ${Math.round(ratio * 100 - 100)}% more than expected by day ${elapsed}.`;
    } else if (ratio < 0.75 && elapsed > 5) {
      cls = 'good'; emoji = '🎯';
      title = 'Comfortably under pace';
      body = `Spending ${Math.round((1 - ratio) * 100)}% less than expected. Nice.`;
    } else {
      title = 'On track';
      body = `Pace looks healthy — ${fmtMoney(allowance - total)} left for ${dim - elapsed} days.`;
    }
    el.className = `insight-card ${cls}`;
    el.innerHTML = `<span class="ic-emoji">${emoji}</span><div class="ic-body"><h3>${title}</h3><p>${body}</p></div>`;
  }

  function renderDonut(exps, total) {
    const svg = $('#donut');
    // clear segments
    $$('.donut-seg', svg).forEach(s => s.remove());
    if (total <= 0) return;

    const byCat = aggregateByCategory(exps);
    const r = 80;
    const c = 2 * Math.PI * r;
    let offset = 0;

    byCat.forEach(({ cat, amount }) => {
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

  function renderCatList(exps, total) {
    const list = $('#cat-list');
    list.innerHTML = '';
    const byCat = aggregateByCategory(exps);
    if (byCat.length === 0) {
      list.innerHTML = `<li class="empty">No expenses yet this month.<br>Tap + to add your first.</li>`;
      return;
    }
    byCat.forEach(({ cat, amount }) => {
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
        const subs = aggregateBySub(exps, cat.id);
        const sb = document.createElement('div');
        sb.className = 'sub-breakdown';
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
  function renderInsights() {
    const k = monthKey(new Date());
    const exps = expensesForMonth(k);
    const total = sumAmounts(exps);
    const allowance = state.allowance || 0;
    const today = new Date();
    const dim = daysInMonth(k);
    const elapsed = today.getDate();
    const daysLeft = Math.max(0, dim - elapsed);

    const prevK = prevMonthKey(k);
    const prevExps = expensesForMonth(prevK);
    const prevTotal = sumAmounts(prevExps);

    const list = $('#insights-list');
    list.innerHTML = '';

    const insights = [];

    // 1) Overall budget health
    if (allowance > 0) {
      const projected = elapsed > 0 ? (total / elapsed) * dim : 0;
      if (total >= allowance) {
        insights.push({
          cls: 'bad', emoji: '🚨',
          title: 'Allowance exceeded',
          body: `You've spent ${fmtMoney(total)} of your ${fmtMoney(allowance)} allowance with ${daysLeft} days left. Pause non-essentials.`,
        });
      } else if (projected > allowance * 1.1) {
        const cap = daysLeft > 0 ? (allowance - total) / daysLeft : 0;
        insights.push({
          cls: 'warn', emoji: '⚠️',
          title: 'On pace to overshoot',
          body: `Projected month-end: ${fmtMoney(projected)} (${fmtMoney(projected - allowance)} over). Try to keep daily spend under ${fmtMoney(cap)}.`,
        });
      } else if (projected < allowance * 0.85 && elapsed > 7) {
        insights.push({
          cls: 'good', emoji: '🎯',
          title: 'Tracking well below allowance',
          body: `Projected month-end: ${fmtMoney(projected)} — about ${fmtMoney(allowance - projected)} under budget. Consider saving the surplus.`,
        });
      } else if (allowance - total > 0 && daysLeft > 0) {
        const cap = (allowance - total) / daysLeft;
        insights.push({
          cls: 'good', emoji: '✅',
          title: 'Healthy daily budget',
          body: `You can spend up to ${fmtMoney(cap)} per day for the next ${daysLeft} day${daysLeft === 1 ? '' : 's'} and stay on budget.`,
        });
      }
    } else {
      insights.push({
        cls: 'warn', emoji: '💡',
        title: 'Set an allowance',
        body: 'Add a monthly allowance in Settings to unlock pace and budget insights.',
      });
    }

    // 2) Top categories
    const byCat = aggregateByCategory(exps);
    if (byCat.length > 0) {
      const top = byCat[0];
      const share = total > 0 ? (top.amount / total) * 100 : 0;
      if (share > 35) {
        insights.push({
          cls: 'warn', emoji: top.cat.emoji || '📊',
          title: `${top.cat.name} is ${Math.round(share)}% of your spend`,
          body: `That's a large concentration. If it's discretionary, try setting a soft cap of ${fmtMoney(top.amount * 0.7)} next month.`,
        });
      } else {
        insights.push({
          cls: 'good', emoji: top.cat.emoji || '📊',
          title: `Top category: ${top.cat.name}`,
          body: `${fmtMoney(top.amount)} so far (${Math.round(share)}% of total). Within a reasonable share.`,
        });
      }
    }

    // 3) Month-over-month comparison per category
    if (prevExps.length > 0 && byCat.length > 0) {
      const prevMap = new Map();
      prevExps.forEach(e => prevMap.set(e.categoryId, (prevMap.get(e.categoryId) || 0) + e.amount));
      const changes = [];
      byCat.forEach(({ cat, amount }) => {
        const prev = prevMap.get(cat.id) || 0;
        if (prev > 0) {
          const change = ((amount - prev) / prev) * 100;
          changes.push({ cat, amount, prev, change });
        }
      });
      const surged = changes.filter(c => c.change >= 50).sort((a, b) => b.change - a.change);
      const dropped = changes.filter(c => c.change <= -30).sort((a, b) => a.change - b.change);
      if (surged.length) {
        const c = surged[0];
        insights.push({
          cls: 'warn', emoji: '📈',
          title: `${c.cat.name} jumped ${Math.round(c.change)}% vs last month`,
          body: `${fmtMoney(c.prev)} → ${fmtMoney(c.amount)}. Worth a quick look at why.`,
        });
      }
      if (dropped.length) {
        const c = dropped[0];
        insights.push({
          cls: 'good', emoji: '📉',
          title: `${c.cat.name} down ${Math.round(Math.abs(c.change))}% vs last month`,
          body: `${fmtMoney(c.prev)} → ${fmtMoney(c.amount)}. Keep it up.`,
        });
      }
    }

    // 4) Sub-category insights — find biggest sub spend across all
    const subTotals = [];
    state.categories.forEach(cat => {
      cat.subs.forEach(sub => {
        const amt = exps.filter(e => e.categoryId === cat.id && e.subId === sub.id).reduce((a, b) => a + b.amount, 0);
        if (amt > 0) subTotals.push({ cat, sub, amount: amt });
      });
    });
    subTotals.sort((a, b) => b.amount - a.amount);
    if (subTotals.length > 0 && total > 0) {
      const top = subTotals[0];
      const share = (top.amount / total) * 100;
      if (share > 20) {
        insights.push({
          cls: 'warn', emoji: '🔍',
          title: `${top.sub.name} (${top.cat.name}) is ${Math.round(share)}% of spend`,
          body: `Single sub-category eating a big chunk. Consider whether this can be reduced.`,
        });
      }
    }

    // 5) Beverage / fast food specific guidance (lifestyle)
    const bev = state.categories.find(c => c.name === 'Beverages');
    const food = state.categories.find(c => c.name === 'Food');
    if (bev) {
      const bevAmt = exps.filter(e => e.categoryId === bev.id).reduce((a, b) => a + b.amount, 0);
      if (total > 0 && bevAmt / total > 0.12) {
        insights.push({
          cls: 'warn', emoji: '🥤',
          title: 'High spend on beverages',
          body: `${fmtMoney(bevAmt)} on drinks (${Math.round(bevAmt / total * 100)}% of total). Switching some to home-made could save ~${fmtMoney(bevAmt * 0.4)}.`,
        });
      }
    }
    if (food) {
      const ff = food.subs.find(s => /fast food/i.test(s.name));
      if (ff) {
        const ffAmt = exps.filter(e => e.categoryId === food.id && e.subId === ff.id).reduce((a, b) => a + b.amount, 0);
        if (total > 0 && ffAmt / total > 0.15) {
          insights.push({
            cls: 'warn', emoji: '🍔',
            title: 'Fast food adding up',
            body: `${fmtMoney(ffAmt)} on fast food this month (${Math.round(ffAmt / total * 100)}% of spend). Cooking 2 more meals/week at home could free ~${fmtMoney(ffAmt * 0.3)}.`,
          });
        }
      }
    }

    // 6) Frequency insight
    if (exps.length > 15 && elapsed > 0) {
      const perDay = exps.length / elapsed;
      if (perDay > 3) {
        insights.push({
          cls: 'warn', emoji: '🧾',
          title: 'Lots of small purchases',
          body: `Averaging ${perDay.toFixed(1)} transactions/day. Frequent small spends often hide leaks.`,
        });
      }
    }

    // 7) Comparison with last month total
    if (prevTotal > 0) {
      const change = ((total - prevTotal) / prevTotal) * 100;
      if (Math.abs(change) >= 15) {
        insights.push({
          cls: change > 0 ? 'warn' : 'good',
          emoji: change > 0 ? '📊' : '📊',
          title: `${change > 0 ? 'Up' : 'Down'} ${Math.round(Math.abs(change))}% vs last month`,
          body: `${monthLabel(prevK)}: ${fmtMoney(prevTotal)} → ${monthLabel(k)}: ${fmtMoney(total)}.`,
        });
      }
    }

    if (insights.length === 0) {
      list.innerHTML = `<div class="card empty">Add a few expenses and insights will appear here.</div>`;
      return;
    }

    insights.forEach(ins => {
      const el = document.createElement('div');
      el.className = `insight-card ${ins.cls}`;
      el.innerHTML = `<span class="ic-emoji">${ins.emoji}</span><div class="ic-body"><h3>${escapeHtml(ins.title)}</h3><p>${escapeHtml(ins.body)}</p></div>`;
      list.appendChild(el);
    });
  }

  function prevMonthKey(k) {
    const d = parseMonthKey(k);
    d.setMonth(d.getMonth() - 1);
    return monthKey(d);
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

    $$('.seg-btn').forEach(b => {
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

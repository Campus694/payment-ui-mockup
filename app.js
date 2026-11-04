// ===== Настройки =====
    const SUPPORT_URL = '#';

    // Реквизиты для перевода
    const REQUISITES = {
      bank: 'Банк',
      account: '0000 0000 0000 0000'
    };

    // ===== Проверка платежа через balance-diff worker =====
    const BALANCE_API = 'https://balance-diff.rabotaspin.workers.dev';
    const BALANCE_TOKEN = 'bdf_124f7629197dc4ad030bd0bb';
    const POLL_INTERVAL_MS = 3000;
    const POLL_MAX_ATTEMPTS = 15;

    const STORAGE_LANG = 'pp_lang';
    const STORAGE_PAYMENT = 'pp_payment';

    // ===== Безопасная работа с localStorage =====
    const store = {
      get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
      },
      set(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* хранилище недоступно */ }
      },
      remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* хранилище недоступно */ }
      }
    };

    // ===== Переводы =====
    const dict = {
      ru: {
        title: 'ParityPay — Grand Market',
        commission: 'Комиссия: 0',
        chooseMethod: 'Выберите метод',
        byCard: 'Банковской картой',
        cardTitle: 'Перевод по реквизитам',
        toPay: 'К оплате:',
        reqBank: 'Банк',
        reqAccount: 'Номер карты / счёта',
        reqAmount: 'Сумма',
        payBtn: 'Проверить платёж',
        pendingTitle: 'Обработка',
        pendingNote: 'Проверка занимает<br>до 2 минут, ожидайте.',
        copyTitle: 'Скопировать ID',
        sheetTitle: 'Подтвердите перевод',
        successTitle: 'Успешно!',
        checkFailed: 'Не удалось подтвердить',
        checkRetry: 'Повторить',
        cooldown: 'Слишком часто. Подождите',
        sec: 'сек.',
        netError: 'Сеть недоступна. Проверьте соединение.',
        reqError: 'Не удалось создать запрос проверки.',
        timeoutError: 'Превышено время ожидания проверки.'
      },
      en: {
        title: 'ParityPay — Grand Market',
        commission: 'Commission: 0',
        chooseMethod: 'Choose a method',
        byCard: 'Bank card',
        cardTitle: 'Transfer details',
        toPay: 'To pay:',
        reqBank: 'Bank',
        reqAccount: 'Card / account number',
        reqAmount: 'Amount',
        payBtn: 'Check payment',
        pendingTitle: 'Processing',
        pendingNote: 'Verification takes<br>up to 2 minutes, please wait.',
        copyTitle: 'Copy ID',
        sheetTitle: 'Confirm the transfer',
        successTitle: 'Success!',
        checkFailed: 'Verification failed',
        checkRetry: 'Retry',
        cooldown: 'Too frequent. Wait',
        sec: 'sec.',
        netError: 'Network unavailable. Check your connection.',
        reqError: 'Could not create verification request.',
        timeoutError: 'Verification timed out.'
      }
    };

    let currentLang = 'ru';

    function setLang(lang) {
      if (!dict[lang]) lang = 'ru';
      currentLang = lang;
      const t = dict[lang];
      document.documentElement.lang = lang;
      document.title = t.title;

      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) {
          if (key === 'pendingNote') el.innerHTML = t[key];
          else el.textContent = t[key];
        }
      });

      document.getElementById('copyBtn').title = t.copyTitle;

      document.querySelectorAll('.lang-btn').forEach(btn => {
        const active = btn.dataset.lang === lang;
        btn.classList.toggle('active', active);
        btn.classList.toggle('inactive', !active);
      });

      store.set(STORAGE_LANG, lang);
    }

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });

    // ===== Уникальный ID заказа =====
    function generateId() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      const bytes = new Uint8Array(16);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }

    // ===== Скелетон + загрузка данных =====
    const API_BASE = 'https://checkout-demo-8le.pages.dev';

    const SKEL = {
      merchantTitle: 'skel-title',
      orderIdText:   'skel-id',
      amountMain:    'skel-amount',
      subAmount:     'skel-line',
      reqBank:       'skel-line',
      reqAccount:    'skel-line',
      reqAmount:     'skel-line'
    };

    let AMOUNT = '0.00';
    let orderId = '';

    function setSkeleton(on) {
      for (const [id, cls] of Object.entries(SKEL)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.remove('skeleton', 'skel-title', 'skel-id', 'skel-amount', 'skel-line');
        if (on) {
          el.classList.add('skeleton', cls);
          el.textContent = '';
        }
      }
    }

    function getOrderCode() {
      const fromQuery = new URLSearchParams(location.search).get('order');
      if (fromQuery) return fromQuery;
      const segs = location.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1] || '';
      if (/^[A-Za-z0-9]{6,32}$/.test(last) && !last.endsWith('.html') && last !== 'payment-ui-mockup') return last;
      return 'demo';
    }

    function showRetry() {
      const row = document.querySelector('.order-id-row');
      if (row.querySelector('.retry-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'retry-btn';
      btn.textContent = 'Повторить';
      btn.addEventListener('click', () => {
        btn.remove();
        startLoading();
      });
      row.appendChild(btn);
    }

    async function loadOrder() {
      const id = getOrderCode();
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(API_BASE + '/api/order?id=' + encodeURIComponent(id));
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          AMOUNT = data.amount;
          orderId = data.id;
          document.getElementById('merchantTitle').textContent = data.merchant;
          document.getElementById('orderIdText').textContent = 'ID: ' + data.id;
          document.getElementById('amountMain').textContent = data.amount;
          document.getElementById('subAmount').textContent = data.amount;
          document.getElementById('reqBank').textContent = data.bank;
          const accEl = document.getElementById('reqAccount');
          accEl.dataset.value = data.account;
          accEl.textContent = maskAccount(data.account);
          document.getElementById('reqAmount').textContent = data.amount;
          setSkeleton(false);
          return;
        } catch (e) {
          if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
        }
      }
      setSkeleton(false);
      document.getElementById('orderIdText').textContent = 'ID: ' + id;
      document.getElementById('amountMain').textContent = '—';
      document.getElementById('subAmount').textContent = '—';
      document.getElementById('reqBank').textContent = '—';
      document.getElementById('reqAmount').textContent = '—';
      showRetry();
    }

    function maskAccount(value) {
      const digits = String(value || '').replace(/\s+/g, '');
      if (digits.length < 10) return value;
      return digits.slice(0, 4) + ' •••• •••• ' + digits.slice(-4);
    }

    function startLoading() {
      setSkeleton(true);
      loadOrder();
    }

    startLoading();

    // ===== Копирование с галочкой =====
    function copyText(text, btn) {
      navigator.clipboard?.writeText(text);
      const original = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12.5L10 17.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = original;
      }, 1200);
    }

    document.getElementById('copyBtn').addEventListener('click', (e) => {
      copyText(orderId, e.currentTarget);
    });

    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.copy);
        copyText(target.dataset.value || target.textContent, btn);
      });
    });

    // ===== Поддержка =====
    document.getElementById('chatFab').href = SUPPORT_URL;

    // ===== Экраны =====
    const screenMain = document.getElementById('screenMain');
    const screenCard = document.getElementById('screenCard');
    const cardForm = document.getElementById('cardForm');
    const cardSuccess = document.getElementById('cardSuccess');
    const cardDone = document.getElementById('cardDone');

    function showCardScreen() {
      screenMain.classList.add('hidden');
      screenCard.classList.remove('hidden');
      screenCard.classList.add('form-mode');
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function showPendingState() {
      cardForm.classList.add('hidden');
      cardDone.classList.add('hidden');
      cardSuccess.classList.remove('hidden');
      screenCard.classList.remove('form-mode');
    }

    function showDoneState() {
      cardForm.classList.add('hidden');
      cardSuccess.classList.add('hidden');
      cardDone.classList.remove('hidden');
      screenCard.classList.remove('form-mode');
    }

    // Кнопка «Банковской картой» → сразу на реквизиты (без предупреждения)
    document.getElementById('cardMethod').addEventListener('click', showCardScreen);
    // ===== Ползунок подтверждения =====
    const sheet = document.getElementById('sheet');
    const sheetOverlay = document.getElementById('sheetOverlay');
    const slider = document.getElementById('slider');
    const handle = document.getElementById('sliderHandle');

    let dragging = false;
    let startX = 0;
    let pos = 0;

    function maxPos() {
      return slider.clientWidth - handle.offsetWidth - 8;
    }

    function setHandle(x, animate) {
      handle.style.transition = animate ? 'transform 0.25s ease' : 'none';
      handle.style.transform = `translateX(${x}px)`;
    }

    function openSheet() {
      resetSlider(false);
      sheetOverlay.classList.add('open');
      sheet.classList.add('open');
    }

    function closeSheet() {
      sheetOverlay.classList.remove('open');
      sheet.classList.remove('open');
      resetSlider(false);
    }

    function resetSlider(animate) {
      pos = 0;
      setHandle(0, animate);
    }

    function confirmPayment() {
      pos = maxPos();
      setHandle(pos, true);
      setTimeout(() => {
        closeSheet();
        store.set(STORAGE_PAYMENT, JSON.stringify({
          orderId,
          amount: AMOUNT,
          status: 'pending',
          createdAt: Date.now()
        }));
        showPendingState();
        startBalanceCheck();
      }, 250);
    }

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX - pos;
      handle.setPointerCapture(e.pointerId);
      handle.style.transition = 'none';
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      pos = Math.min(Math.max(0, e.clientX - startX), maxPos());
      setHandle(pos, false);
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (pos >= maxPos() * 0.9) {
        confirmPayment();
      } else {
        resetSlider(true);
      }
    }

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    document.getElementById('payBtn').addEventListener('click', openSheet);
    sheetOverlay.addEventListener('click', closeSheet);

    // ===================================================================
    // ===== ПРОВЕРКА ПЛАТЕЖА ЧЕРЕЗ balance-diff WORKER =====
    // ===================================================================

    let checkAbort = false;

    const retryBtn = document.getElementById('checkRetryBtn');
    retryBtn.addEventListener('click', () => {
      retryBtn.classList.add('hidden');
      startBalanceCheck();
    });

    function resetPendingVisual() {
      cardSuccess.classList.remove('pp-check-error');
      const title = cardSuccess.querySelector('.pending-title span');
      if (title) title.textContent = dict[currentLang].pendingTitle;
      const note = cardSuccess.querySelector('.pending-note');
      if (note) note.innerHTML = dict[currentLang].pendingNote;
      retryBtn.classList.add('hidden');
      retryBtn.disabled = false;
      retryBtn.textContent = dict[currentLang].checkRetry;
    }

    function setPendingTitle(text) {
      const title = cardSuccess.querySelector('.pending-title span');
      if (title) title.textContent = text;
    }

    function setPendingNote(html) {
      const note = cardSuccess.querySelector('.pending-note');
      if (note) note.innerHTML = html;
    }

    function renderSuccess() {
      store.set(STORAGE_PAYMENT, JSON.stringify({
        orderId,
        amount: AMOUNT,
        status: 'done',
        createdAt: Date.now()
      }));
      showDoneState();
    }

    function renderCheckError(message, remainingSec) {
      cardSuccess.classList.add('pp-check-error');
      const t = dict[currentLang];
      setPendingTitle(t.checkFailed);
      setPendingNote(message || '');

      retryBtn.textContent = t.checkRetry;
      retryBtn.classList.remove('hidden');
      retryBtn.disabled = false;

      if (remainingSec && remainingSec > 0) {
        let left = Math.ceil(remainingSec);
        const tick = () => {
          if (left <= 0) {
            retryBtn.disabled = false;
            retryBtn.textContent = t.checkRetry;
            return;
          }
          retryBtn.disabled = true;
          retryBtn.textContent = `${t.checkRetry} (${left} ${t.sec})`;
          left--;
          setTimeout(tick, 1000);
        };
        tick();
      }
    }

    async function apiRequest() {
      const res = await fetch(BALANCE_API + '/request', {
        method: 'POST',
        headers: { 'X-App-Token': BALANCE_TOKEN }
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    }

    async function apiResult(id) {
      const res = await fetch(BALANCE_API + '/result?id=' + encodeURIComponent(id), {
        headers: { 'X-App-Token': BALANCE_TOKEN }
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function startBalanceCheck() {
      resetPendingVisual();
      showPendingState();

      checkAbort = false;
      const t = dict[currentLang];
      setPendingTitle(t.pendingTitle);
      setPendingNote(t.pendingNote);

      // Шаг 1: создаём запрос
      let req;
      try {
        req = await apiRequest();
      } catch (e) {
        renderCheckError(t.netError, 0);
        return;
      }

      if (!req.ok && req.data && req.data.error === 'cooldown') {
        const sec = Math.ceil((req.data.remaining_ms || 0) / 1000) || req.data.remaining_sec || 60;
        renderCheckError(`${t.cooldown} ${sec} ${t.sec}.`, sec);
        return;
      }

      if (!req.ok || !req.data || !req.data.id) {
        renderCheckError(t.reqError, 0);
        return;
      }

      const id = req.data.id;

      // Шаг 2: поллинг результата
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (checkAbort) return;
        await sleep(POLL_INTERVAL_MS);
        if (checkAbort) return;

        let r;
        try {
          r = await apiResult(id);
        } catch (e) {
          continue;
        }

        const d = r.data || {};

        if (d.status === 'done') {
          renderSuccess();
          return;
        }
        if (d.status === 'failed' || (d.error && d.error !== 'cooldown')) {
          renderCheckError(t.checkFailed, 0);
          return;
        }
      }

      renderCheckError(t.timeoutError, 0);
    }

    function stopBalanceCheck() {
      checkAbort = true;
    }

    // ===== Восстановление состояния =====
    function restoreState() {
      const savedLang = store.get(STORAGE_LANG);
      setLang(savedLang || 'ru');

      const raw = store.get(STORAGE_PAYMENT);
      if (!raw) return;
      try {
        const payment = JSON.parse(raw);
        if (payment && payment.status === 'pending') {
          showCardScreen();
          showPendingState();
          startBalanceCheck();
        } else if (payment && payment.status === 'done') {
          showCardScreen();
          showDoneState();
        }
      } catch (e) {
        store.remove(STORAGE_PAYMENT);
      }
    }

    restoreState();

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

    // ===== Переводы (данные приходят из D1 через /api/order) =====
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
        warnText: 'Оплатите строго указанную сумму, иначе платёж будет утерян.',
        warnBtn: 'Продолжить',
        // новые ключи для проверки
        checkTitle: 'Проверка платежа',
        checkWait: 'Сверяем баланс, ожидайте…',
        checkDone: 'Платёж подтверждён',
        checkDiff: 'Зачислено:',
        checkBefore: 'Было:',
        checkAfter: 'Стало:',
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
        warnText: 'Pay the exact amount shown, otherwise the payment will be lost.',
        warnBtn: 'Continue',
        // new keys
        checkTitle: 'Payment verification',
        checkWait: 'Checking balance, please wait…',
        checkDone: 'Payment confirmed',
        checkDiff: 'Credited:',
        checkBefore: 'Before:',
        checkAfter: 'After:',
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

    // ===== Уникальный ID заказа (новый при каждом открытии) =====
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

    // ===== Скелетон + загрузка данных с воркера =====
    // Сайт статичен (GitHub Pages), данные тянет Cloudflare Worker + D1.
    // Код заказа берём из пути URL: domain.com/fj62hdksj83jfkdg7dgsj1 → «fj62hdksj83jfkdg7dgsj1»
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
      // код заказа: 6–32 латинских буквы/цифр, не имя раздела и не файл
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
      // Фолбэк: не блокируем путь — пускаем на второй экран с заглушками
      document.getElementById('orderIdText').textContent = 'ID: ' + id;
      document.getElementById('amountMain').textContent = '—';
      document.getElementById('subAmount').textContent = '—';
      document.getElementById('reqBank').textContent = '—';
      document.getElementById('reqAmount').textContent = '—';
      showRetry();
    }

    // Маска номера карты: первые 4 и последние 4, середина под звёздами
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
        // копируем полное значение (для карты — из data-value, не маску)
        copyText(target.dataset.value || target.textContent, btn);
      });
    });

    // ===== Поддержка → Telegram-бот =====
    document.getElementById('chatFab').href = SUPPORT_URL;

    // ===== Экраны =====
    const screenMain = document.getElementById('screenMain');
    const screenCard = document.getElementById('screenCard');
    const cardForm = document.getElementById('cardForm');
    const cardSuccess = document.getElementById('cardSuccess');

    function showCardScreen() {
      screenMain.classList.add('hidden');
      screenCard.classList.remove('hidden');
      screenCard.classList.add('form-mode');
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function showPendingState() {
      cardForm.classList.add('hidden');
      cardSuccess.classList.remove('hidden');
      screenCard.classList.remove('form-mode');
    }

    // ===== Предупреждение с кнопкой продолжения =====
    const warnOverlay = document.getElementById('warnOverlay');
    const warnBox = document.getElementById('warnBox');

    function openWarn() {
      warnOverlay.classList.add('open');
      warnBox.classList.add('open');
    }

    function proceedToRequisites() {
      warnOverlay.classList.remove('open');
      warnBox.classList.remove('open');
      showCardScreen();
      cardForm.classList.remove('hidden');
      cardSuccess.classList.add('hidden');
    }

    document.getElementById('warnBtn').addEventListener('click', proceedToRequisites);
    warnOverlay.addEventListener('click', proceedToRequisites);

    document.getElementById('cardMethod').addEventListener('click', openWarn);

    // ===== Панель подтверждения с ползунком =====
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
        // запускаем проверку через balance-diff
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

    // Внедряем стили для блока результата проверки (один раз)
    (function injectCheckStyles() {
      if (document.getElementById('pp-check-styles')) return;
      const style = document.createElement('style');
      style.id = 'pp-check-styles';
      style.textContent = `
        .pp-check-result { margin-top: 18px; width: 100%; max-width: 300px; }
        .pp-check-row {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 10px; padding: 7px 0; border-bottom: 1px solid #333333;
          font-size: 14px; color: #b5b5b5;
        }
        .pp-check-row:last-child { border-bottom: none; }
        .pp-check-row .pp-val { color: #ffffff; font-weight: 500; }
        .pp-check-row.pp-diff .pp-val { color: #4caf7a; font-size: 16px; }
        .pp-check-row.pp-diff.negative .pp-val { color: #e05a5a; }
        .pp-check-done .pending-title { color: #4caf7a; }
        .pp-check-done .status-icon .warn { display: none; }
        .pp-check-done .status-icon::before {
          content: ''; display: block; width: 64px; height: 64px; margin: 0 auto;
          border-radius: 50%; background: #4caf7a;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M5 12.5L10 17.5L19 7' stroke='%23fff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-size: 36px 36px; background-position: center; background-repeat: no-repeat;
        }
        .pp-check-done .status-spinner { display: none; }
        .pp-check-error .status-icon .warn { opacity: .9; }
        .pp-check-error .pending-title { color: #e05a5a; }
        .pp-check-error .status-spinner .ring { animation: none; border-top-color: #e05a5a; }
        .pp-check-btn {
          margin-top: 18px; background: none; border: 1px solid #3c3c3c;
          border-radius: 8px; color: #e0e0e0; font-family: inherit; font-size: 14px;
          font-weight: 500; padding: 10px 26px; cursor: pointer;
          transition: border-color .15s ease, color .15s ease, background-color .15s ease;
        }
        .pp-check-btn:hover { border-color: #DF5A28; color: #DF5A28; background-color: rgba(223,90,40,.06); }
        .pp-check-btn:disabled { opacity: .55; cursor: default; border-color: #3c3c3c; color: #8c8c8c; background: none; }
      `;
      document.head.appendChild(style);
    })();

    function ensureCheckUI() {
      if (!cardSuccess.querySelector('.pp-check-result')) {
        const res = document.createElement('div');
        res.className = 'pp-check-result hidden';
        cardSuccess.appendChild(res);
      }
      if (!cardSuccess.querySelector('.pp-check-btn')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pp-check-btn hidden';
        btn.addEventListener('click', () => {
          btn.classList.add('hidden');
          startBalanceCheck();
        });
        cardSuccess.appendChild(btn);
      }
    }

    function resetPendingVisual() {
      cardSuccess.classList.remove('pp-check-done', 'pp-check-error');
      const title = cardSuccess.querySelector('.pending-title span');
      if (title) title.textContent = dict[currentLang].pendingTitle;
      const note = cardSuccess.querySelector('.pending-note');
      if (note) note.innerHTML = dict[currentLang].pendingNote;
      const res = cardSuccess.querySelector('.pp-check-result');
      if (res) { res.innerHTML = ''; res.classList.add('hidden'); }
      const btn = cardSuccess.querySelector('.pp-check-btn');
      if (btn) {
        btn.classList.add('hidden');
        btn.disabled = false;
        btn.textContent = dict[currentLang].checkRetry;
      }
    }

    function setPendingTitle(text) {
      const title = cardSuccess.querySelector('.pending-title span');
      if (title) title.textContent = text;
    }

    function setPendingNote(html) {
      const note = cardSuccess.querySelector('.pending-note');
      if (note) note.innerHTML = html;
    }

    function renderCheckDone(data) {
      cardSuccess.classList.add('pp-check-done');
      const t = dict[currentLang];
      setPendingTitle(t.checkDone);
      setPendingNote('');

      const res = cardSuccess.querySelector('.pp-check-result');
      if (!res) return;
      res.classList.remove('hidden');

      const diff = Number(data.diff) || 0;
      const sign = diff > 0 ? '+' : '';
      const negClass = diff < 0 ? ' negative' : '';

      res.innerHTML = `
        <div class="pp-check-row pp-diff${negClass}">
          <span>${t.checkDiff}</span>
          <span class="pp-val">${sign}${diff.toFixed(2)} ₽</span>
        </div>
        <div class="pp-check-row">
          <span>${t.checkBefore}</span>
          <span class="pp-val">${Number(data.before).toFixed(2)} ₽</span>
        </div>
        <div class="pp-check-row">
          <span>${t.checkAfter}</span>
          <span class="pp-val">${Number(data.after).toFixed(2)} ₽</span>
        </div>
      `;

      store.set(STORAGE_PAYMENT, JSON.stringify({
        orderId,
        amount: AMOUNT,
        status: 'done',
        diff,
        before: data.before,
        after: data.after,
        createdAt: Date.now()
      }));
    }

    function renderCheckError(message, remainingSec) {
      cardSuccess.classList.add('pp-check-error');
      const t = dict[currentLang];
      setPendingTitle(t.checkFailed);
      setPendingNote(message || '');

      const res = cardSuccess.querySelector('.pp-check-result');
      if (res) { res.innerHTML = ''; res.classList.add('hidden'); }

      const btn = cardSuccess.querySelector('.pp-check-btn');
      if (!btn) return;

      btn.textContent = t.checkRetry;
      btn.classList.remove('hidden');
      btn.disabled = false;

      if (remainingSec && remainingSec > 0) {
        let left = Math.ceil(remainingSec);
        const tick = () => {
          if (left <= 0) {
            btn.disabled = false;
            btn.textContent = t.checkRetry;
            return;
          }
          btn.disabled = true;
          btn.textContent = `${t.checkRetry} (${left} ${t.sec})`;
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
      ensureCheckUI();
      resetPendingVisual();

      checkAbort = false;

      const t = dict[currentLang];
      setPendingTitle(t.pendingTitle);
      setPendingNote(t.checkWait);

      // Шаг 1: создаём запрос
      let req;
      try {
        req = await apiRequest();
      } catch (e) {
        renderCheckError(t.netError, 0);
        return;
      }

      // Кулдаун
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
      setPendingNote(`${t.checkWait}<br>Задача #${id}`);

      // Шаг 2: поллинг результата
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (checkAbort) return;
        await sleep(POLL_INTERVAL_MS);
        if (checkAbort) return;

        let r;
        try {
          r = await apiResult(id);
        } catch (e) {
          continue; // сеть моргнула — пробуем ещё
        }

        const d = r.data || {};

        if (d.status === 'done') {
          renderCheckDone(d);
          return;
        }
        if (d.status === 'failed' || (d.error && d.error !== 'cooldown')) {
          renderCheckError(t.checkFailed, 0);
          return;
        }
        // status === 'claimed' — ещё выполняется, ждём дальше
      }

      // Таймаут ожидания
      renderCheckError(t.timeoutError, 0);
    }

    function stopBalanceCheck() {
      checkAbort = true;
    }

    // ===== Восстановление состояния из localStorage =====
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
          showPendingState();
          renderCheckDone({
            diff: payment.diff,
            before: payment.before,
            after: payment.after
          });
        }
      } catch (e) {
        store.remove(STORAGE_PAYMENT);
      }
    }

    restoreState();

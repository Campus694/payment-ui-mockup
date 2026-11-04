    // ===== Настройки =====
    const SUPPORT_URL = '#';

    // Реквизиты для перевода
    const REQUISITES = {
      bank: 'Банк',
      account: '0000 0000 0000 0000'
    };


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
        warnBtn: 'Продолжить'
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
        warnBtn: 'Continue'
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
        }
      } catch (e) {
        store.remove(STORAGE_PAYMENT);
      }
    }

    restoreState();

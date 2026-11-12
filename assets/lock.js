/* 경호 업무 비서 - 로그인(잠금) 화면
 * - 주인(경호님) 비밀번호 하나로만 열려요. 비밀번호 자체는 어디에도 저장하지 않고,
 *   알아볼 수 없게 바꾼 값(PBKDF2-SHA256)만 assets/owner.js 에 등록돼요.
 * - 아직 등록 전이면: 비밀번호를 만들고 "등록 코드"를 받아서 루나에게 전달해요.
 * - 앱을 새로 켤 때마다, 그리고 컴퓨터를 1분 동안 안 쓰면 잠겨요(아래 자리비움 감지 참고).
 * - 잠겨도 화면 뒤의 작업 내용은 그대로 남아 있어요.
 * 이 파일은 <head> 에서 owner.js 바로 다음에 불러와야 화면이 잠깐이라도 보이지 않아요.
 */
const Lock = (() => {
  const IDLE_MS = 60 * 1000;          // 자동 잠금: 1분
  const ITER = 600000;                // 비밀번호를 바꾸는 횟수 (많을수록 풀기 어려움)
  const MIN_LEN = 8;                  // 비밀번호 최소 길이
  const SKEY = 'biseo.session';       // 지금 열려 있는 앱 창의 상태 (sessionStorage)
  const MAX_TRY = 5, WAIT_MS = 30 * 1000;

  const owner = () => (window.OWNER_LOCK && window.OWNER_LOCK.hash) ? window.OWNER_LOCK : null;
  const ss = {
    get() { try { return JSON.parse(sessionStorage.getItem(SKEY)) || {}; } catch { return {}; } },
    set(v) { try { sessionStorage.setItem(SKEY, JSON.stringify(v)); } catch { /* 무시 */ } },
  };
  // 예전 방식(컴퓨터마다 따로 만든 비밀번호)은 더 이상 쓰지 않아요
  try { localStorage.removeItem('biseo.lock'); } catch { /* 무시 */ }

  const html = document.documentElement;
  const isOpen = () => { const s = ss.get(); return s.open && Date.now() - (s.last || 0) < IDLE_MS; };
  if (!isOpen()) html.classList.add('locked');

  /* ── 비밀번호 처리 ── */
  const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = hex => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
  async function derive(pw, saltHex, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: iter }, key, 256);
    return toHex(bits);
  }
  async function makeRecord(pw) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    return { v: 1, salt, iter: ITER, hash: await derive(pw, salt, ITER) };
  }
  async function check(pw) {
    const rec = owner();
    if (!rec) return false;
    const h = await derive(pw, rec.salt, rec.iter);
    let diff = h.length ^ rec.hash.length;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (rec.hash.charCodeAt(i) || 0);
    return diff === 0;
  }
  const toCode = rec => 'JKT-' + btoa(JSON.stringify(rec));

  /* ── 열기 / 잠그기 ── */
  function open() {
    ss.set({ open: true, last: Date.now() });
    graceUntil = Date.now() + 10000;               // 방금 비밀번호를 쳤으니 사용 중이에요
    lastTick = Date.now();
    html.classList.remove('locked');
    const scr = document.getElementById('lockScreen');
    if (scr) scr.remove();
  }
  function lock() {
    ss.set({ open: false, last: 0 });
    html.classList.add('locked');
    if (document.body) show();
  }
  let lastSave = 0;
  function touch() {
    if (html.classList.contains('locked')) return;
    const now = Date.now();
    if (now - lastSave < 2000) return;
    lastSave = now;
    ss.set({ open: true, last: now });
  }
  ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(t =>
    addEventListener(t, touch, { passive: true, capture: true }));

  /* ── 컴퓨터 전체 기준 자리비움 감지 (카톡·네이트온처럼) ──
   * 크롬/엣지의 Idle Detection 기능으로 "컴퓨터 어디에서든" 마우스·키보드를 1분 동안
   * 안 쓰면 잠가요. 다른 프로그램을 쓰는 중이면 안 잠겨요.
   * 처음 한 번 "허용"을 눌러야 하고, 허용 안 하거나 안 되는 브라우저면 예전처럼
   * 이 앱 안에서 1분 동안 안 쓰면 잠가요. */
  const hasIdleApi = 'IdleDetector' in window;
  let det = null;                     // 감지기는 밖에 붙잡아 둬요 (사라지면 감지가 멈춰요)
  let permState = hasIdleApi ? 'unknown' : 'unsupported';
  let graceUntil = 0;                 // 막 비밀번호를 친 뒤 잠깐은 다시 잠그지 않아요
  const sysState = () => !det ? null : (det.screenState === 'locked' ? 'idle' : det.userState);
  async function startIdle() {
    if (!hasIdleApi || det) return;
    try {
      const d = new IdleDetector();
      d.addEventListener('change', heartbeat);
      await d.start({ threshold: IDLE_MS });
      det = d; permState = 'granted';
    } catch { det = null; }
  }
  function askIdle() {          // 클릭한 순간(사용자 동작 안)에 불러야 해요
    if (!hasIdleApi || det) return;
    try {
      IdleDetector.requestPermission()
        .then(s => { permState = s; if (s === 'granted') startIdle(); }).catch(() => {});
    } catch { /* 무시 */ }
  }
  if (hasIdleApi && navigator.permissions) {
    navigator.permissions.query({ name: 'idle-detection' }).then(p => {
      permState = p.state;
      if (p.state === 'granted') startIdle();
      // 이미 로그인된 상태라 물어볼 기회가 없었으면, 앱을 처음 클릭할 때 한 번 물어봐요
      else if (p.state === 'prompt') addEventListener('click', askIdle, { once: true, capture: true });
    }).catch(() => {});
  }

  /* 3초마다 확인해요. 크롬이 이 창을 오래 재워 둬서(최소화·가려짐) 그동안 컴퓨터를
   * 썼는지 알 수 없으면, 안전하게 잠가요. */
  const GAP_MS = 2 * IDLE_MS;
  let lastTick = Date.now();
  function heartbeat() {
    const now = Date.now(), gap = now - lastTick;
    lastTick = now;
    if (html.classList.contains('locked')) return;
    if (now < graceUntil) { lastSave = 0; touch(); return; }
    if (gap > GAP_MS) { lock(); return; }
    const s = sysState();
    if (s === 'idle') { lock(); return; }
    if (s === 'active') { lastSave = 0; touch(); return; }   // 컴퓨터를 쓰는 중이면 계속 열어 둬요
    if (!isOpen()) lock();                                    // 감지 기능이 없으면: 이 앱 안에서 1분
  }
  setInterval(heartbeat, 3000);
  document.addEventListener('visibilitychange', heartbeat);
  document.addEventListener('resume', heartbeat);
  addEventListener('focus', heartbeat);
  addEventListener('pageshow', heartbeat);
  const idleStatus = () => det ? 'on' : permState;

  /* ── 화면 ── */
  function greeting() {
    const h = new Date().getHours();
    return h < 11 ? '좋은 아침이에요 ☀️' : h < 14 ? '점심 맛있게 드셨어요? 🍚' : h < 18 ? '오후도 힘내요 💪' : '오늘도 수고 많았어요 🌙';
  }
  function pwField(id, label, auto) {
    return `<label class="lk-field"><span>${label}</span>
      <span class="lk-input"><input type="password" id="${id}" autocomplete="${auto}" maxlength="64" required>
      <button type="button" class="lk-eye" data-for="${id}" aria-label="비밀번호 보기">👁</button></span></label>`;
  }

  function show(mode, extra) {
    let scr = document.getElementById('lockScreen');
    if (!scr) { scr = document.createElement('div'); scr.id = 'lockScreen'; document.body.appendChild(scr); }
    mode = mode || (owner() ? 'login' : 'setup');

    let body = '';
    if (mode === 'setup') {
      body = `<p class="lk-sub">아직 <b>주인 비밀번호</b>가 등록되지 않았어요.<br>경호님만 아는 비밀번호를 만들어 주세요.</p>
        <form id="lkForm">${pwField('lkPw1', `새 비밀번호 (${MIN_LEN}자 이상)`, 'new-password')}${pwField('lkPw2', '한 번 더 입력', 'new-password')}
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn" type="submit">등록 코드 만들기</button></form>`;
    } else if (mode === 'code') {
      body = `<p class="lk-sub">아래 <b>등록 코드</b>를 복사해서 <b>루나에게 보내 주세요.</b><br>루나가 등록하면 그때부터 어느 컴퓨터에서든<br>이 비밀번호로만 들어올 수 있어요.</p>
        <textarea class="lk-code" id="lkCode" readonly>${extra}</textarea>
        <button class="lk-btn" type="button" id="lkCopy">📋 등록 코드 복사하기</button>
        <div class="lk-note">이 코드는 비밀번호가 아니라 알아볼 수 없게 바꾼 값이라<br>루나에게 보내도 괜찮아요. 비밀번호는 절대 보내지 마세요!</div>`;
    } else if (mode === 'login') {
      body = `<p class="lk-sub">경호님, ${greeting()}<br>비밀번호를 입력해 주세요.</p>
        <form id="lkForm">${pwField('lkPw', '비밀번호', 'current-password')}
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn" type="submit">들어가기</button></form>
        <button type="button" class="lk-link" id="lkForgot">비밀번호를 잊어버렸어요</button>`;
    } else if (mode === 'forgot') {
      body = `<p class="lk-sub">비밀번호는 경호님만 바꿀 수 있어요.<br><b>회사 컴퓨터에서 루나에게</b><br>"비밀번호 잊어버렸어, 새로 만들자"라고 말해 주세요. 🐯</p>
        <button type="button" class="lk-btn" id="lkBack">돌아가기</button>`;
    } else if (mode === 'change') {
      body = `<p class="lk-sub">비밀번호를 바꿔요.<br>새 등록 코드를 루나에게 보내야 적용돼요.</p>
        <form id="lkForm">${pwField('lkOld', '지금 비밀번호', 'current-password')}${pwField('lkPw1', `새 비밀번호 (${MIN_LEN}자 이상)`, 'new-password')}${pwField('lkPw2', '새 비밀번호 한 번 더', 'new-password')}
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn" type="submit">새 등록 코드 만들기</button></form>
        <button type="button" class="lk-link" id="lkCancel">취소</button>`;
    }
    const overlay = mode === 'change' || (mode === 'code' && !html.classList.contains('locked'));
    scr.className = overlay ? 'lk-over' : '';
    scr.innerHTML = `<div class="lk-card" role="dialog" aria-label="로그인">
      <img class="lk-logo" src="assets/icons/icon-512.png" alt=""><h1>경호 업무 비서</h1>${body}
      <div class="lk-foot">🔒 컴퓨터를 1분 동안 쓰지 않으면 자동으로 잠겨요</div></div>`;

    const $ = id => scr.querySelector('#' + id);
    const card = scr.querySelector('.lk-card');
    const err = t => { const e = $('lkErr'); e.textContent = t; e.classList.add('show'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); };
    scr.querySelectorAll('.lk-eye').forEach(b => b.addEventListener('click', () => {
      const i = $(b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'; i.focus();
    }));
    const first = scr.querySelector('form input'); if (first) setTimeout(() => first.focus(), 50);
    const btn = scr.querySelector('form .lk-btn');
    const busy = (on, label) => { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; };

    if ($('lkForm')) $('lkForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (mode === 'setup' || mode === 'change') {
        const a = $('lkPw1').value, b = $('lkPw2').value;
        if (mode === 'change') {
          busy(true, '확인 중…');
          const ok = await check($('lkOld').value);
          busy(false, '새 등록 코드 만들기');
          if (!ok) return err('지금 비밀번호가 맞지 않아요.');
        }
        if (a.length < MIN_LEN) return err(`비밀번호는 ${MIN_LEN}자 이상으로 만들어 주세요.`);
        if (!/[0-9]/.test(a) || !/[^0-9]/.test(a)) return err('글자와 숫자를 섞어서 만들어 주세요.');
        if (a !== b) return err('두 번 입력한 비밀번호가 달라요.');
        busy(true, '만드는 중…');
        const rec = await makeRecord(a);
        show('code', toCode(rec));
      } else if (mode === 'login') {
        askIdle();
        const st = ss.get();
        const waitLeft = (st.waitUntil || 0) - Date.now();
        if (waitLeft > 0) return err(`너무 많이 틀렸어요. ${Math.ceil(waitLeft / 1000)}초 뒤에 다시 해 주세요.`);
        busy(true, '확인 중…');
        const ok = await check($('lkPw').value);
        busy(false, '들어가기');
        if (ok) { open(); return; }
        const tries = (st.tries || 0) + 1;
        if (tries >= MAX_TRY) { ss.set({ ...st, tries: 0, waitUntil: Date.now() + WAIT_MS }); err(`${MAX_TRY}번 틀려서 30초 동안 쉬어요.`); }
        else { ss.set({ ...st, tries }); err(`비밀번호가 달라요. (${tries}/${MAX_TRY})`); }
        $('lkPw').select();
      }
    });
    if ($('lkCopy')) $('lkCopy').addEventListener('click', async () => {
      const t = $('lkCode'); t.select();
      try { await navigator.clipboard.writeText(t.value); } catch { document.execCommand('copy'); }
      $('lkCopy').textContent = '✓ 복사했어요! 루나에게 붙여넣어 주세요';
    });
    if ($('lkForgot')) $('lkForgot').addEventListener('click', () => show('forgot'));
    if ($('lkBack')) $('lkBack').addEventListener('click', () => show('login'));
    if ($('lkCancel')) $('lkCancel').addEventListener('click', () => scr.remove());
  }

  function start() { if (html.classList.contains('locked')) show(); else touch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { lock, changePassword: () => show('change'), IDLE_MS, idleStatus, askIdle };
})();

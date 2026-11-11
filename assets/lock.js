/* 경호 업무 비서 - 로그인(잠금) 화면
 * - 처음 켜면 비밀번호를 직접 만들어요. 비밀번호 자체는 어디에도 저장하지 않고,
 *   알아볼 수 없게 바꾼 값(PBKDF2-SHA256)만 이 컴퓨터 크롬에 저장해요.
 * - 앱을 새로 켤 때마다, 그리고 1분 동안 아무것도 안 하면 잠겨요.
 * - 잠겨도 화면 뒤의 작업 내용은 그대로 남아 있어요.
 * 이 파일은 <head> 맨 위에서 불러와야 화면이 잠깐이라도 보이지 않아요.
 */
const Lock = (() => {
  const IDLE_MS = 60 * 1000;          // 자동 잠금: 1분
  const ITER = 150000;                // 비밀번호 바꾸는 횟수(많을수록 풀기 어려움)
  const KEY = 'biseo.lock';           // 저장 이름 (localStorage)
  const SKEY = 'biseo.session';       // 지금 열려 있는 앱 창의 상태 (sessionStorage)
  const MAX_TRY = 5, WAIT_MS = 30 * 1000;

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const ss = {
    get() { try { return JSON.parse(sessionStorage.getItem(SKEY)) || {}; } catch { return {}; } },
    set(v) { try { sessionStorage.setItem(SKEY, JSON.stringify(v)); } catch { /* 무시 */ } },
  };

  const html = document.documentElement;
  const isOpen = () => { const s = ss.get(); return s.open && Date.now() - (s.last || 0) < IDLE_MS; };

  // 페이지가 그려지기 전에 먼저 가려 두기
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
    const rec = ls.get(KEY);
    if (!rec) return false;
    const h = await derive(pw, rec.salt, rec.iter);
    // 글자 하나하나 다 비교 (중간에 멈추지 않게)
    let diff = h.length ^ rec.hash.length;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (rec.hash.charCodeAt(i) || 0);
    return diff === 0;
  }

  /* ── 열기 / 잠그기 ── */
  function open() {
    ss.set({ open: true, last: Date.now() });
    html.classList.remove('locked');
    const scr = document.getElementById('lockScreen');
    if (scr) scr.remove();
  }
  function lock() {
    ss.set({ open: false, last: 0 });
    html.classList.add('locked');
    if (document.body) show();
  }

  // 움직임이 있으면 시간 갱신 (너무 자주 저장하지 않게 2초 간격)
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
  setInterval(() => {
    if (!html.classList.contains('locked') && !isOpen()) lock();
  }, 3000);
  // 다른 창에서 다시 보일 때 바로 확인
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !html.classList.contains('locked') && !isOpen()) lock();
  });

  /* ── 화면 ── */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function greeting() {
    const h = new Date().getHours();
    return h < 11 ? '좋은 아침이에요 ☀️' : h < 14 ? '점심 맛있게 드셨어요? 🍚' : h < 18 ? '오후도 힘내요 💪' : '오늘도 수고 많았어요 🌙';
  }
  function pwField(id, label, auto) {
    return `<label class="lk-field"><span>${label}</span>
      <span class="lk-input"><input type="password" id="${id}" autocomplete="${auto}" maxlength="64" required>
      <button type="button" class="lk-eye" data-for="${id}" aria-label="비밀번호 보기">👁</button></span></label>`;
  }

  function show(mode) {
    let scr = document.getElementById('lockScreen');
    if (!scr) {
      scr = document.createElement('div');
      scr.id = 'lockScreen';
      document.body.appendChild(scr);
    }
    const hasPw = !!ls.get(KEY);
    mode = mode || (hasPw ? 'login' : 'setup');

    const head = `<img class="lk-logo" src="assets/icons/icon-512.png" alt="">
      <h1>경호 업무 비서</h1>`;
    let body = '';
    if (mode === 'setup') {
      body = `<p class="lk-sub">처음 오셨네요! 이 앱에서 쓸 <b>비밀번호</b>를 만들어 주세요.<br>비밀번호는 이 컴퓨터에만 알아볼 수 없게 저장돼요.</p>
        <form id="lkForm">${pwField('lkPw1', '새 비밀번호 (4자 이상)', 'new-password')}${pwField('lkPw2', '한 번 더 입력', 'new-password')}
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn" type="submit">비밀번호 만들고 시작하기</button></form>`;
    } else if (mode === 'login') {
      body = `<p class="lk-sub">경호님, ${greeting()}<br>비밀번호를 입력해 주세요.</p>
        <form id="lkForm">${pwField('lkPw', '비밀번호', 'current-password')}
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn" type="submit">들어가기</button></form>
        <button type="button" class="lk-link" id="lkForgot">비밀번호를 잊어버렸어요</button>`;
    } else if (mode === 'reset') {
      body = `<p class="lk-sub"><b>초기화하면 이 컴퓨터에 저장된 할일·메모·일정·링크가 모두 지워져요.</b><br>계속하려면 아래 칸에 <b>초기화</b>라고 써 주세요.</p>
        <form id="lkForm"><label class="lk-field"><span>확인</span><span class="lk-input"><input type="text" id="lkConfirm" placeholder="초기화" required></span></label>
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn danger" type="submit">모두 지우고 비밀번호 새로 만들기</button></form>
        <button type="button" class="lk-link" id="lkBack">← 돌아가기</button>`;
    } else if (mode === 'change') {
      body = `<p class="lk-sub">비밀번호를 바꿔요.</p>
        <form id="lkForm">${pwField('lkOld', '지금 비밀번호', 'current-password')}${pwField('lkPw1', '새 비밀번호 (4자 이상)', 'new-password')}${pwField('lkPw2', '새 비밀번호 한 번 더', 'new-password')}
        <div class="lk-err" id="lkErr"></div>
        <button class="lk-btn" type="submit">바꾸기</button></form>
        <button type="button" class="lk-link" id="lkCancel">취소</button>`;
    }
    scr.className = mode === 'change' ? 'lk-over' : '';
    scr.innerHTML = `<div class="lk-card" role="dialog" aria-label="로그인">${head}${body}
      <div class="lk-foot">🔒 1분 동안 쓰지 않으면 자동으로 잠겨요</div></div>`;

    const $ = id => scr.querySelector('#' + id);
    const err = t => { const e = $('lkErr'); e.textContent = t; e.classList.add('show'); scr.querySelector('.lk-card').classList.remove('shake'); void scr.offsetWidth; scr.querySelector('.lk-card').classList.add('shake'); };
    scr.querySelectorAll('.lk-eye').forEach(b => b.addEventListener('click', () => {
      const i = $(b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'; i.focus();
    }));
    const first = scr.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
    const btn = scr.querySelector('.lk-btn');
    const busy = on => { btn.disabled = on; };

    $('lkForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (mode === 'setup' || mode === 'change') {
        const a = $('lkPw1').value, b = $('lkPw2').value;
        if (mode === 'change') {
          busy(true);
          const ok = await check($('lkOld').value);
          busy(false);
          if (!ok) return err('지금 비밀번호가 맞지 않아요.');
        }
        if (a.length < 4) return err('비밀번호는 4자 이상으로 만들어 주세요.');
        if (a !== b) return err('두 번 입력한 비밀번호가 달라요.');
        busy(true);
        const rec = await makeRecord(a);
        if (!ls.set(KEY, rec)) { busy(false); return err('저장이 안 됐어요. 크롬 설정에서 사이트 데이터 저장을 허용해 주세요.'); }
        if (mode === 'change') { scr.remove(); alert('비밀번호를 바꿨어요! 🐯'); return; }
        open();
      } else if (mode === 'login') {
        const st = ss.get();
        const waitLeft = (st.waitUntil || 0) - Date.now();
        if (waitLeft > 0) return err(`너무 많이 틀렸어요. ${Math.ceil(waitLeft / 1000)}초 뒤에 다시 해 주세요.`);
        busy(true);
        const ok = await check($('lkPw').value);
        busy(false);
        if (ok) { open(); return; }
        const tries = (st.tries || 0) + 1;
        if (tries >= MAX_TRY) { ss.set({ ...st, tries: 0, waitUntil: Date.now() + WAIT_MS }); err(`${MAX_TRY}번 틀려서 30초 동안 쉬어요.`); }
        else { ss.set({ ...st, tries }); err(`비밀번호가 달라요. (${tries}/${MAX_TRY})`); }
        $('lkPw').select();
      } else if (mode === 'reset') {
        if ($('lkConfirm').value.trim() !== '초기화') return err('"초기화"라고 정확히 써 주세요.');
        try { Object.keys(localStorage).filter(k => k.startsWith('biseo.')).forEach(k => localStorage.removeItem(k)); } catch { /* 무시 */ }
        ss.set({});
        location.reload();
      }
    });
    if ($('lkForgot')) $('lkForgot').addEventListener('click', () => show('reset'));
    if ($('lkBack')) $('lkBack').addEventListener('click', () => show('login'));
    if ($('lkCancel')) $('lkCancel').addEventListener('click', () => scr.remove());
  }

  function start() { if (html.classList.contains('locked')) show(); else touch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { lock, changePassword: () => show('change'), IDLE_MS };
})();

/* 경호 업무 비서 - 공통 틀 (왼쪽 메뉴 + 위쪽 바)
 * 모든 페이지에서 이 파일을 불러오면, 페이지 내용 주위에 메뉴와 위쪽 바를 둘러 줘요.
 * 새 도구를 만들면 아래 TOOLS 에 한 줄만 추가하면 메뉴·검색·대시보드에 자동으로 나와요.
 */
const TOOLS = [
  { href: 'work.html', icon: '🗺️', name: '내 업무 지도', group: '내 업무', ready: true,
    desc: '맡은 일을 분류·주기별로 모아서, 다음에 할 날짜를 계산해 챙겨 줘요.' },
  { href: 'office.html', icon: '🔧', name: '사무실 관리함', group: '내 업무', ready: true,
    desc: '전구·화장실·곰팡이·잡초 같은 사무실 문제를 적어 두고 끝날 때까지 챙겨요.' },
  { href: 'remit-check.html', icon: '🧾', name: '송금·인보이스 체크', group: '송금·인보이스', ready: true,
    desc: '송금영수증에서 금액 차이·도착 미확인·오래된 미입고를 찾고, 받을 돈 장부로 끝까지 챙겨요.' },
  { href: 'price-compare.html', icon: '💸', name: '엑셀 가격 비교', group: '행사 리스트', ready: true,
    desc: '이전/새 파일을 비교해서 바뀐 가격을 노란색으로 표시해요.' },
  { href: 'rep-list.html', icon: '⭐', name: '대표 품번 모으기', group: '행사 리스트', ready: true,
    desc: '"대표" 품번만 모아서 순번과 사진 폴더 이름을 붙여요.' },
  { href: 'brand-count.html', icon: '📊', name: '브랜드별 모델 수', group: '행사 리스트', ready: true,
    desc: '브랜드별 모델 수·대표 수·수량·금액을 세어요.' },
  { href: '', icon: '📦', name: '재고추가 양식 변환', group: '재고', ready: false,
    desc: '받은 재고 엑셀을 우리 양식으로 바꿔요. (준비중)' },
];

// 내 컴퓨터(브라우저)에 저장하기 - 실패해도 화면은 멀쩡하게
const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('biseo.' + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('biseo.' + key, JSON.stringify(value)); } catch { /* 저장 안 돼도 그냥 넘어가요 */ }
  },
};

// 내 업무 지도의 기본 분류 (업무 지도를 아직 안 열어 봤을 때 메뉴에 보여 줄 것, work.js 와 같아야 해요)
const WORK_CATS_DEFAULT = [
  { id: 'hr', icon: '👥', name: '인사·급여' },
  { id: 'goods', icon: '📦', name: '입고·출고·인보이스' },
  { id: 'money', icon: '💰', name: '자금·페이백·고객' },
  { id: 'safety', icon: '🛡️', name: '안전·법정 교육·점검' },
  { id: 'office', icon: '🏢', name: '사무실 관리' },
];

// 루나(Claude)와 대화하는 곳 - 지금 쓰는 Claude 요금제 그대로라 추가 비용 없어요
const LUNA_URL = 'https://claude.ai/new';

(() => {
  const esc =s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isHome = page === '' || page === 'index.html';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();

  // 내 업무 지도의 분류를 메뉴에 그대로 보여 줘요 (날짜 지난 일이 있으면 빨간 숫자)
  function workNav() {
    const w = Store.get('work', null);
    const cats = (w && w.cats) || WORK_CATS_DEFAULT;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const over = id => w ? w.tasks.filter(t => t.cat === id && t.next && t.next <= today).length : 0;
    const cur = new URLSearchParams(location.search).get('cat');
    let html = `<div class="nav-group">내 업무</div>
      <a href="work.html" class="${page === 'work.html' && !cur ? 'active' : ''}"><span class="ico">🗺️</span><span class="label">내 업무 지도</span></a>`;
    for (const c of cats) {
      const n = over(c.id);
      html += `<a href="work.html?cat=${encodeURIComponent(c.id)}" class="sub ${page === 'work.html' && cur === c.id ? 'active' : ''}"><span class="ico">${esc(c.icon)}</span><span class="label">${esc(c.name)}</span>${n ? `<span class="state due">${n}</span>` : ''}</a>`;
    }
    const oo = Store.get('office.open', 0);
    html += `<a href="office.html" class="${page === 'office.html' ? 'active' : ''}"><span class="ico">🔧</span><span class="label">사무실 관리함</span>${oo ? `<span class="state due soft">${oo}</span>` : ''}</a>`;
    return html;
  }

  function navHTML() {
    let html = `<div class="nav-group">홈</div>
      <a href="index.html" class="${isHome ? 'active' : ''}"><span class="ico">🏠</span><span class="label">대시보드</span></a>
      <a href="${LUNA_URL}" target="_blank" rel="noopener"><span class="ico">💬</span><span class="label">루나랑 대화하기</span><span class="state">↗</span></a>`;
    html += workNav();
    const groups = [...new Set(TOOLS.filter(t => t.group !== '내 업무').map(t => t.group))];
    for (const g of groups) {
      html += `<div class="nav-group">${esc(g)}</div>`;
      for (const t of TOOLS.filter(x => x.group === g)) {
        if (!t.ready) {
          html += `<span class="disabled"><span class="ico">${t.icon}</span><span class="label">${esc(t.name)}</span><span class="state">준비중</span></span>`;
          continue;
        }
        const active = page === t.href.toLowerCase();
        html += `<a href="${t.href}" class="${active ? 'active' : ''}"><span class="ico">${t.icon}</span><span class="label">${esc(t.name)}</span>${active ? '' : '<span class="state">●</span>'}</a>`;
      }
    }
    return html;
  }

  function build() {
    const body = document.body;
    const kids = [...body.childNodes];

    const app = document.createElement('div');
    app.className = 'app';
    app.innerHTML = `
      <aside class="side" aria-label="메뉴">
        <a class="brand" href="index.html">
          <img src="assets/icons/icon-192.png" alt="">
          <span><b>경호 업무 비서</b><small>JKTiger 업무 도구모음</small></span>
        </a>
        <nav class="nav">${navHTML()}</nav>
        <div class="side-foot">엑셀 파일은 내 컴퓨터 안에서만 처리돼요 🔒</div>
      </aside>
      <div class="scrim"></div>
      <div class="main">
        <div class="topbar">
          <button class="icon-btn menu-btn" type="button" aria-label="메뉴 열기">☰</button>
          <button class="icon-btn" type="button" aria-label="새로고침" data-act="reload">⟳</button>
          <span class="top-date">${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})</span>
          <div class="search">
            <input type="search" placeholder="도구 검색…" aria-label="도구 검색">
            <div class="search-results hidden"></div>
          </div>
          <button class="help-btn" type="button">📖 <span>사용법</span></button>
          <button class="icon-btn" type="button" aria-label="잠그기" title="지금 잠그기" data-act="lock">🔒</button>
          <div class="profile">
            <img src="assets/icons/favicon-32.png" alt="">
            <div><b>경호</b><small>JKTiger</small></div>
          </div>
        </div>
        <main class="content"></main>
      </div>
      <a class="luna-fab" href="${LUNA_URL}" target="_blank" rel="noopener" title="루나랑 대화하기 (새 창으로 열려요)">
        <span class="luna-fab-ico">🐯</span><span class="luna-fab-txt">루나랑 대화</span>
      </a>`;
    // 다른 페이지에서 메뉴 숫자(날짜 지난 일 등)를 다시 그릴 때 써요
    window.refreshNav = () => { app.querySelector('.nav').innerHTML = navHTML(); };
    const content = app.querySelector('.content');
    kids.forEach(n => { if (n.nodeName !== 'SCRIPT' && n.id !== 'lockScreen') content.appendChild(n); });
    body.prepend(app);

    // 메뉴 (휴대폰)
    app.querySelector('.menu-btn').addEventListener('click', () => body.classList.add('nav-open'));
    app.querySelector('.scrim').addEventListener('click', () => body.classList.remove('nav-open'));
    app.querySelector('[data-act=reload]').addEventListener('click', () => location.reload());
    app.querySelector('[data-act=lock]').addEventListener('click', () => { if (window.Lock) Lock.lock(); });

    // 검색
    const input = app.querySelector('.search input');
    const box = app.querySelector('.search-results');
    let picked = 0, found = [];
    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.classList.add('hidden'); return; }
      found = TOOLS.filter(t => (t.name + ' ' + t.desc + ' ' + t.group).toLowerCase().includes(q));
      picked = Math.min(picked, Math.max(found.length - 1, 0));
      box.innerHTML = found.length
        ? found.map((t, i) => t.ready
            ? `<a href="${t.href}" class="${i === picked ? 'on' : ''}"><span>${t.icon}</span><span>${esc(t.name)}<br><small>${esc(t.desc)}</small></span></a>`
            : `<a class="${i === picked ? 'on' : ''}"><span>${t.icon}</span><span>${esc(t.name)}<br><small>준비중이에요</small></span></a>`).join('')
        : '<div class="empty">찾는 도구가 없어요. 루나한테 만들어 달라고 해보세요 🐯</div>';
      box.classList.remove('hidden');
    };
    input.addEventListener('input', () => { picked = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { picked = Math.min(picked + 1, found.length - 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { picked = Math.max(picked - 1, 0); render(); e.preventDefault(); }
      if (e.key === 'Enter' && found[picked] && found[picked].ready) location.href = found[picked].href;
      if (e.key === 'Escape') { input.value = ''; render(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) box.classList.add('hidden'); });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); input.focus(); }
    });

    // 사용법
    app.querySelector('.help-btn').addEventListener('click', () => {
      const st = window.Lock && Lock.idleStatus ? Lock.idleStatus() : 'unsupported';
      const idleLine = {
        on: '✅ <b>켜져 있어요.</b> 컴퓨터를 1분 동안 안 쓰면 잠겨요.',
        granted: '✅ <b>켜져 있어요.</b> 컴퓨터를 1분 동안 안 쓰면 잠겨요.',
        prompt: '⚠️ <b>아직 허용 전이에요.</b> <button type="button" data-act="idle">허용하기</button> 를 누르고 크롬 창에서 "허용"을 눌러 주세요.',
        denied: '❌ <b>차단돼 있어요.</b> 주소창 왼쪽 아이콘 → 사이트 설정에서 "기기 사용 감지"를 허용으로 바꿔 주세요. 그 전까지는 이 앱 안에서 1분 동안 안 쓰면 잠겨요.',
        unsupported: '⚠️ 이 브라우저는 지원하지 않아서, 이 앱 안에서 1분 동안 안 쓰면 잠겨요.',
      }[st] || '⏳ 확인 중이에요. 잠시 뒤 다시 열어 주세요.';
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-label="사용법">
        <h3>📖 경호 업무 비서 사용법</h3>
        <ul>
          ${TOOLS.filter(t => t.ready).map(t => `<li><b>${t.icon} ${esc(t.name)}</b> — ${esc(t.desc)}</li>`).join('')}
          <li>엑셀은 <b>끌어다 놓기</b>나 <b>클릭</b>으로 올려요. 파일은 내 컴퓨터 안에서만 처리되고 밖으로 나가지 않아요.</li>
          <li>위쪽 검색창은 <b>/</b> 키로 바로 열 수 있어요.</li>
          <li>대시보드의 할일·일정·메모·링크는 <b>이 컴퓨터의 크롬</b>에 저장돼요.</li>
          <li>🔒 <b>컴퓨터를 1분</b> 동안 쓰지 않으면 자동으로 잠겨요(카톡처럼 다른 프로그램을 쓰는 중이면 안 잠겨요. 처음에 "허용"을 눌러 주세요). 위쪽 🔒 버튼으로 바로 잠글 수도 있어요.<br><small>자리비움 감지: ${idleLine}</small></li>
          <li>💬 오른쪽 아래 <b>루나랑 대화</b> 버튼을 누르면 Claude 창이 새로 열려요. 지금 요금제 그대로라 돈이 더 들지 않아요.</li>
          <li>새 도구가 필요하면 루나한테 말해 주세요! 🐯</li>
        </ul>
        <div class="actions"><button type="button" data-act="pw">🔑 비밀번호 바꾸기</button><button class="primary" type="button">알겠어요</button></div>
      </div>`;
      bg.addEventListener('click', e => {
        if (e.target.dataset.act === 'pw') { bg.remove(); if (window.Lock) Lock.changePassword(); return; }
        if (e.target.dataset.act === 'idle') { if (window.Lock) Lock.askIdle(); bg.remove(); return; }
        if (e.target === bg || e.target.tagName === 'BUTTON') bg.remove();
      });
      document.body.appendChild(bg);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

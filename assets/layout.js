/* 경호 업무 비서 - 공통 틀 (왼쪽 메뉴 + 위쪽 바)
 * 모든 페이지에서 이 파일을 불러오면, 페이지 내용 주위에 메뉴와 위쪽 바를 둘러 줘요.
 * 새 도구를 만들면 아래 TOOLS 에 한 줄만 추가하면 메뉴·검색·대시보드에 자동으로 나와요.
 */
const TOOLS = [
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

(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isHome = page === '' || page === 'index.html';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();

  function navHTML() {
    let html = `<div class="nav-group">홈</div>
      <a href="index.html" class="${isHome ? 'active' : ''}"><span class="ico">🏠</span><span class="label">대시보드</span></a>`;
    const groups = [...new Set(TOOLS.map(t => t.group))];
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
          <div class="profile">
            <img src="assets/icons/favicon-32.png" alt="">
            <div><b>경호</b><small>JKTiger</small></div>
          </div>
        </div>
        <main class="content"></main>
      </div>`;
    const content = app.querySelector('.content');
    kids.forEach(n => { if (n.nodeName !== 'SCRIPT') content.appendChild(n); });
    body.prepend(app);

    // 메뉴 (휴대폰)
    app.querySelector('.menu-btn').addEventListener('click', () => body.classList.add('nav-open'));
    app.querySelector('.scrim').addEventListener('click', () => body.classList.remove('nav-open'));
    app.querySelector('[data-act=reload]').addEventListener('click', () => location.reload());

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
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-label="사용법">
        <h3>📖 경호 업무 비서 사용법</h3>
        <ul>
          ${TOOLS.filter(t => t.ready).map(t => `<li><b>${t.icon} ${esc(t.name)}</b> — ${esc(t.desc)}</li>`).join('')}
          <li>엑셀은 <b>끌어다 놓기</b>나 <b>클릭</b>으로 올려요. 파일은 내 컴퓨터 안에서만 처리되고 밖으로 나가지 않아요.</li>
          <li>위쪽 검색창은 <b>/</b> 키로 바로 열 수 있어요.</li>
          <li>대시보드의 할일·일정·메모·링크는 <b>이 컴퓨터의 크롬</b>에 저장돼요.</li>
          <li>새 도구가 필요하면 루나한테 말해 주세요! 🐯</li>
        </ul>
        <div class="actions"><button class="primary" type="button">알겠어요</button></div>
      </div>`;
      bg.addEventListener('click', e => { if (e.target === bg || e.target.tagName === 'BUTTON') bg.remove(); });
      document.body.appendChild(bg);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

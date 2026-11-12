/* 경호 업무 비서 - 내 업무 지도 (공통 로직)
 * 경호님이 맡은 일을 분류하고, 주기(매주·매월·매년 등)에 맞춰 "다음에 할 날짜"를 계산해요.
 * 데이터는 이 컴퓨터 크롬(localStorage 'biseo.work')에만 저장돼요.
 * ⚠️ 공개 저장소라서 이 파일에는 업무 "이름"과 기본 체크리스트만 들어 있어요.
 *    직원 이름·급여·주민번호 같은 개인정보는 절대 코드에 넣지 않아요.
 */
const Work = (() => {
  const KEY = 'work';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ymd(new Date());
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();     // m: 0~11
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  /* 주기
   * { type: 'none' }                       수시 (날짜를 직접 정하면 그날 알려 줘요)
   * { type: 'weekly', weekday: 0~6 }       매주 ○요일
   * { type: 'months', every: N, day: 1~31 } N개월마다 ○일 (31 = 말일)
   */
  const FREQS = [
    ['none', '수시'], ['weekly', '매주'], ['m1', '매월'], ['m2', '2개월마다'],
    ['m3', '3개월마다 (분기)'], ['m6', '6개월마다'], ['m12', '매년'],
  ];
  function freqKey(f) { return !f || f.type === 'none' ? 'none' : f.type === 'weekly' ? 'weekly' : 'm' + f.every; }
  function freqText(f) {
    if (!f || f.type === 'none') return '수시';
    if (f.type === 'weekly') return `매주 ${DAYS[f.weekday]}요일`;
    const d = f.day >= 31 ? '말일' : `${f.day}일`;
    return f.every === 1 ? `매월 ${d}` : f.every === 12 ? '매년' : `${f.every}개월마다 ${d}`;
  }

  // 한 번 앞으로 (다음 회차)
  function step(dateStr, f) {
    const d = parse(dateStr);
    if (f.type === 'weekly') { d.setDate(d.getDate() + 7); return ymd(d); }
    // 날짜를 직접 바꿔서 정해진 날(예: 말일)과 어긋나 있으면, 먼저 같은 달의 정해진 날로 맞춰요
    if (f.day && f.every === 1) {
      const same = Math.min(f.day, lastDay(d.getFullYear(), d.getMonth()));
      if (d.getDate() < same) return ymd(new Date(d.getFullYear(), d.getMonth(), same));
    }
    const y = d.getFullYear(), m = d.getMonth() + f.every;
    const ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12;
    return ymd(new Date(ny, nm, Math.min(f.day || d.getDate(), lastDay(ny, nm))));
  }
  // from(포함) 이후 첫 회차
  function firstFrom(f, fromStr) {
    const from = parse(fromStr);
    if (f.type === 'weekly') {
      const d = new Date(from); d.setDate(d.getDate() + ((f.weekday - d.getDay() + 7) % 7)); return ymd(d);
    }
    if (f.type === 'months') {
      const y = from.getFullYear(), m = from.getMonth();
      let c = new Date(y, m, Math.min(f.day, lastDay(y, m)));
      if (c < from) c = new Date(y, m + 1, Math.min(f.day, lastDay(y, m + 1)));
      return ymd(c);
    }
    return '';
  }
  // 끝냈을 때 다음 날짜
  function nextAfterDone(t, doneStr) {
    const f = t.freq;
    if (!f || f.type === 'none') return '';
    let n = t.next ? step(t.next, f) : firstFrom(f, doneStr);
    let guard = 0;
    while (n <= doneStr && guard++ < 500) n = step(n, f);
    return n;
  }
  // 기간 안의 모든 회차 (달력용)
  function occurrences(t, fromStr, toStr) {
    if (!t.next) return [];
    const out = [];
    if (!t.freq || t.freq.type === 'none') return t.next >= fromStr && t.next <= toStr ? [t.next] : [];
    let n = t.next, guard = 0;
    while (n <= toStr && guard++ < 400) { if (n >= fromStr) out.push(n); n = step(n, t.freq); }
    return out;
  }
  const dday = s => Math.round((parse(s) - parse(todayStr())) / 86400000);

  /* 기본 업무 목록 (경호님이 알려 준 일 + 루나가 짐작한 주기·체크리스트, 화면에서 바꿀 수 있어요) */
  const M = (every, day) => ({ type: 'months', every, day });
  const NONE = { type: 'none' };
  const SEED_CATS = [
    { id: 'hr', icon: '👥', name: '인사·급여' },
    { id: 'goods', icon: '📦', name: '입고·출고·인보이스' },
    { id: 'money', icon: '💰', name: '자금·페이백·고객' },
    { id: 'safety', icon: '🛡️', name: '안전·법정 교육·점검' },
    { id: 'office', icon: '🏢', name: '사무실 관리' },
  ];
  const T = (cat, icon, name, freq, steps, extra = {}) => ({ cat, icon, name, freq, steps, ...extra });
  const SEED_TASKS = [
    // 인사·급여
    T('hr', '🗂️', '직원 인적사항 관리', NONE, ['입사자 서류 받기 (근로계약서 등)', '퇴사자 서류·4대보험 상실 정리', '바뀐 정보 업데이트'],
      { memo: '개인정보(주민번호·주소·계좌)는 여기 적지 말고 회사 서류함/엑셀에 보관해요.' }),
    T('hr', '⏰', '근태 체크', M(1, 31), ['출퇴근 기록 확인', '지각·조퇴·결근 정리', '급여에 반영할 것 메모']),
    T('hr', '🌴', '휴가 체크', M(1, 31), ['이번 달 쓴 휴가 정리', '남은 연차 확인', '휴가 신청서 보관']),
    T('hr', '💵', '급여 자료 → 세무사 전달', M(1, 1), ['근태·휴가 반영', '수당·공제 바뀐 것 확인', '세무사에게 자료 보내기', '급여명세서 확인·배포', '급여 이체 확인'],
      { memo: '기본 날짜는 매월 1일로 해 뒀어요. 실제 일정에 맞게 바꿔 주세요.' }),
    T('hr', '↩️', '무급 사용 페이백', M(1, 31), ['이번 달 무급 사용 내역 정리', '페이백 금액 계산', '지급 확인']),
    T('hr', '👶', '육아휴직 관리', NONE, ['대상자·기간 정리', '육아휴직 급여 신청 서류', '대체인력·복직 일정 확인']),
    T('hr', '📑', '청년일자리도약장려금(청일도) 서류', M(1, 10), ['대상 직원 재직 확인', '급여대장·임금 지급 증빙 준비', '신청서 제출', '지급 결과 확인'],
      { memo: '신청 주기는 루나가 짐작한 거예요. 실제 신청 주기에 맞게 바꿔 주세요.' }),

    // 입고·출고·인보이스
    T('goods', '🧾', '송금·인보이스 체크', { type: 'weekly', weekday: 1 }, ['송금영수증 엑셀 올리기', '장부에서 안 끝난 일 확인', '도착일 없는 인보이스 확인'],
      { link: 'remit-check.html' }),
    T('goods', '📥', '물건 들어오는 인보이스 만들기', NONE, ['PROFORMA/인보이스 받기', '엑셀에 옮기기', '수량·금액 확인']),
    T('goods', '🎪', '행사 인보이스 만들기', NONE, ['행사 리스트 확정', '인보이스 만들기', '사장님 확인']),
    T('goods', '🏬', '탑스 위탁 관리', M(1, 31), ['위탁 보낼 상품 리스트·수량 확인', '위탁 입고 서류 만들기·보내기', '판매 내역 확인', '정산 금액 확인', '안 팔린 상품 회수·재고 맞추기']),
    T('goods', '📂', 'TOPAZ 서류 정리', M(1, 31), ['이번 달 서류 모으기', '폴더에 정리', '빠진 서류 확인']),
    T('goods', '✈️', '해외배송 우체국 접수', NONE, ['포장·무게 확인', '세관 서류(인보이스) 준비', '우체국 접수', '송장번호 기록·전달']),
    T('goods', '🔁', '반품하기', NONE, ['반품 상품·사유 확인', '업체에 반품 요청', '포장·발송', '환불/크레딧 확인']),
    T('goods', '⚠️', '제품 하자·로스 메일 보고', NONE, ['사진·영상 찍어서 폴더에 저장', '업체에 메일 보내기', '사장님 보고', '송금·인보이스 장부에 올리기']),
    T('goods', '🔍', '대백 재고조사', NONE, ['조사 날짜 정하기', '재고 리스트 뽑기', '실사·차이 확인', '이카운트 반영']),

    // 자금·페이백·고객
    T('money', '🏦', '자금 담당 (이사님)', NONE, ['요청 받은 자금 내역 정리', '처리·확인']),
    T('money', '💳', '페이백 관리', M(1, 31), ['이번 달 페이백 대상 정리', '금액 확인', '지급·기록']),
    T('money', '⭐', 'VIP 손님 담당', NONE, ['요청 사항 확인', '상품 준비·연락', '기록 남기기']),

    // 안전·법정 교육·점검
    T('safety', '🦺', '안전관리자 교육', M(12, 1), ['교육 일정 확인', '교육 이수', '수료증 보관'],
      { memo: '다음 교육 날짜를 정해 주세요.' }),
    T('safety', '🧯', '소방 점검', M(12, 1), ['점검 일정 확인', '점검 받기', '결과 보고서 보관', '지적 사항 고치기'],
      { memo: '다음 점검 날짜를 정해 주세요.' }),
    T('safety', '🛗', '승강기(엘리베이터) 점검', M(1, 15), ['점검업체 점검 확인', '점검 기록 받기·보관', '고장·이상 있으면 수리 요청']),
    T('safety', '🔒', '개인정보보호 교육 이수', M(12, 1), ['교육 대상자 확인', '교육 이수', '이수 기록 보관'],
      { memo: '다음 교육 날짜를 정해 주세요.' }),
    T('safety', '📹', 'CCTV 분쟁 자료 확보', NONE, ['날짜·시간·위치 확인', '영상 바로 백업 (보관기간 지나면 지워져요!)', '파일 보관 위치 기록', '요청한 사람·이유 기록']),

    // 사무실 관리
    T('office', '🔦', '사무실 한 바퀴 점검', { type: 'weekly', weekday: 5 }, ['전구·조명', '화장실·배수', '깨지거나 망가진 곳', '곰팡이·변색', '바깥 잡초·청소'],
      { link: 'office.html', memo: '문제가 보이면 "사무실 관리함"에 바로 적어 두세요.' }),
    T('office', '🧻', '소모품 채우기', M(1, 1), ['전구·건전지', '휴지·세제·청소용품', '사무용품']),
    T('office', '🌿', '잡초·바깥 정리', M(1, 15), ['잡초 뽑기/업체 요청', '배수구·낙엽 확인']),
  ];

  function seed() {
    const today = todayStr();
    return {
      v: 1,
      cats: SEED_CATS.map(c => ({ ...c })),
      tasks: SEED_TASKS.map(s => {
        const yearly = s.freq.type === 'months' && s.freq.every === 12;
        return {
          id: uid(), cat: s.cat, icon: s.icon, name: s.name, freq: { ...s.freq },
          // 매년 하는 일은 날짜를 직접 정해야 해서 비워 둬요
          next: s.freq.type === 'none' || yearly ? '' : firstFrom(s.freq, today),
          steps: s.steps.map(t => ({ t, done: false })),
          memo: s.memo || '', link: s.link || '', history: [],
        };
      }),
    };
  }
  function load() {
    const d = Store.get(KEY, null);
    if (d && Array.isArray(d.tasks) && Array.isArray(d.cats)) return d;
    const s = seed(); Store.set(KEY, s); return s;
  }
  const save = d => Store.set(KEY, d);

  // 대시보드용 요약: 지난 일 / 오늘 / 7일 안
  function summary(d = load()) {
    const t = todayStr();
    const due = d.tasks.filter(x => x.next).map(x => ({ ...x, dd: dday(x.next) }));
    return {
      over: due.filter(x => x.next < t),
      today: due.filter(x => x.next === t),
      week: due.filter(x => x.dd > 0 && x.dd <= 7),
      noDate: d.tasks.filter(x => !x.next && x.freq && x.freq.type !== 'none'),
    };
  }

  return { load, save, seed, summary, occurrences, nextAfterDone, firstFrom, step, freqText, freqKey, FREQS, DAYS, dday, todayStr, uid, ymd, parse };
})();

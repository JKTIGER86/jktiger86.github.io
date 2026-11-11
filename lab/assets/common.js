/* 경호 업무 비서 - 공통 엑셀 처리 도구
 * 엑셀은 전부 내 컴퓨터 브라우저 안에서만 처리돼요. (깃허브나 다른 서버로 안 보내요)
 * ExcelJS(엑셀 읽기/쓰기 라이브러리)를 먼저 불러와야 해요.
 */
const Biseo = (() => {
  const YELLOW = 'FFFFFF99';
  const RED = 'FFC00000';

  // 셀 값 꺼내기 (수식이면 계산된 값, 서식 글자면 글자만)
  function val(cell) {
    const v = cell ? cell.value : null;
    if (v && typeof v === 'object') {
      if (v instanceof Date) return v;
      if ('result' in v) return v.result;
      if (v.richText) return v.richText.map(t => t.text).join('');
      if ('text' in v) return v.text;
      if ('formula' in v || 'sharedFormula' in v) return null;
    }
    return v;
  }
  const str = cell => String(val(cell) ?? '').trim();
  // 병합된 칸은 맨 왼쪽 위 칸에서만 글자를 읽어요 (브랜드 제목처럼 A~D 합쳐진 칸 때문에)
  const own = cell => (cell && cell.isMerged && cell.master && cell.master.address !== cell.address) ? '' : str(cell);
  function num(cell) {
    const v = val(cell);
    if (typeof v === 'number') return v;
    const n = Number(String(v ?? '').replace(/[,\s원]/g, ''));
    return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
  }
  const won = n => (n == null ? '' : Math.round(n).toLocaleString('ko-KR'));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function readFile(file) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    return wb;
  }

  // 행사 리스트 읽기
  // - "MODEL" 이 적힌 줄을 머리글로 보고, 그 아래 품번 줄들을 읽어요.
  // - 머리글 위쪽 A열에 적힌 글자(UGG, MOON BOOT 등)를 브랜드로 봐요.
  function parseList(ws) {
    const items = [];
    let brand = '';
    let cols = null;
    const lastRow = ws.rowCount;
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const texts = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => { texts[c] = own(cell); });

      // 머리글 줄 찾기
      const modelCol = texts.findIndex(t => t && t.toUpperCase() === 'MODEL');
      if (modelCol > 0) {
        const find = test => texts.findIndex(t => t && test(t.toUpperCase().replace(/\s+/g, ' ')));
        const brandCols = [];
        texts.forEach((t, c) => { if (t && t.toUpperCase() === 'BRAND') brandCols.push(c); });
        cols = {
          model: modelCol,
          price: find(t => t === 'UNIT PRICE' || t.includes('단가') || t.includes('행사가')),
          ext: find(t => t.startsWith('EXTENDED') || t.includes('금액')),
          total: find(t => t === 'TOTAL' || t === '합계' || t === '수량'),
          note: brandCols.length > 1 ? brandCols[1] : -1,
          markerMax: modelCol - 1,
        };
        continue;
      }

      const model = cols ? own(row.getCell(cols.model)) : '';
      if (!model) {
        const a = own(row.getCell(1));
        if (a && a.toUpperCase() !== 'BRAND' && !/^[\d,.\s]+$/.test(a)) brand = a;
        continue;
      }

      let marker = '';
      for (let c = 1; c <= cols.markerMax; c++) {
        if (own(row.getCell(c)) === '대표') { marker = '대표'; break; }
      }
      items.push({
        row: r, brand, model, marker,
        note: cols.note > 0 ? own(row.getCell(cols.note)) : '',
        price: cols.price > 0 ? num(row.getCell(cols.price)) : null,
        total: cols.total > 0 ? num(row.getCell(cols.total)) : null,
        ext: cols.ext > 0 ? num(row.getCell(cols.ext)) : null,
        cols,
      });
    }
    return items;
  }

  // 품번 하나당 첫 줄만 남기기
  function byModel(items) {
    const m = new Map();
    for (const it of items) if (!m.has(it.model)) m.set(it.model, it);
    return m;
  }

  // 표시하기 (노란 바탕 + 빨간 굵은 글씨)
  function mark(cell, note) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    cell.font = { ...(cell.font || {}), color: { argb: RED }, bold: true };
    if (note) cell.note = note;
  }
  function shade(cell) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  }

  // 같은 이름 시트가 있으면 지우고 새로 만들기
  // 두 번째 시트가 비어 있으면 그 자리를 그대로 써요 (Sheet2 같은 빈 시트)
  function freshSheet(wb, name, preferSecond) {
    const old = wb.getWorksheet(name);
    if (old) wb.removeWorksheet(old.id);
    if (preferSecond) {
      const second = wb.worksheets[1];
      if (second && isEmptySheet(second)) {
        const id = second.id, orderNo = second.orderNo;
        wb.removeWorksheet(id);
        const ws = wb.addWorksheet(name);
        ws.orderNo = orderNo;
        return ws;
      }
    }
    return wb.addWorksheet(name);
  }
  function isEmptySheet(ws) {
    let empty = true;
    ws.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => { if (str(cell) !== '') empty = false; });
    });
    return empty;
  }

  // 결과 시트 머리글/열 너비 꾸미기
  function styleTable(ws, headers, widths, numCols = []) {
    ws.addRow(headers);
    const h = ws.getRow(1);
    h.font = { bold: true };
    h.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      c.alignment = { horizontal: 'center' };
    });
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    numCols.forEach(i => { ws.getColumn(i).numFmt = '#,##0'; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  function borderAll(ws) {
    const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    ws.eachRow(row => row.eachCell(c => { c.border = { top: thin, left: thin, bottom: thin, right: thin }; }));
  }

  // 엑셀이 못 여는 부분 정리
  // - "중복값 강조" 같은 조건부서식은 라이브러리가 옮기지 못해서 빈 서식이 남고, 그러면 파일이 깨져요.
  //   그런 서식만 빼고 저장해요. (데이터는 그대로예요)
  const CF_OK = new Set(['expression', 'cellIs', 'top10', 'aboveAverage', 'colorScale', 'iconSet', 'dataBar', 'containsText', 'timePeriod']);
  function cleanForSave(wb) {
    wb.eachSheet(ws => {
      const list = ws.conditionalFormattings;
      if (!Array.isArray(list)) return;
      const kept = [];
      for (const cf of list) {
        const rules = (cf.rules || []).filter(r => r && CF_OK.has(r.type));
        if (rules.length) kept.push({ ...cf, rules });
      }
      ws.conditionalFormattings = kept;
    });
  }

  // 엑셀 파일로 저장 (내려받기)
  async function save(wb, filename) {
    cleanForSave(wb);
    let buf;
    try {
      buf = await wb.xlsx.writeBuffer();
    } catch (e) {
      // 공유 수식 때문에 저장이 안 될 때: 일반 수식으로 풀어서 다시 저장
      wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => {
        const v = c.value;
        if (v && typeof v === 'object' && ('sharedFormula' in v || v.shareType)) {
          c.value = { formula: c.formula, result: v.result };
        }
      })));
      buf = await wb.xlsx.writeBuffer();
    }
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const baseName = name => name.replace(/\.xlsx$/i, '');

  // 파일 올리는 칸 (끌어다 놓기 + 클릭)
  function dropZone(el, onFile) {
    const input = el.querySelector('input[type=file]');
    const label = el.querySelector('small');
    const original = label ? label.textContent : '';
    el.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) pick(input.files[0]); });
    ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); el.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); el.classList.remove('over'); }));
    el.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) pick(f); });
    function pick(f) {
      if (!/\.xlsx$/i.test(f.name)) { alert('.xlsx 엑셀 파일만 올릴 수 있어요.'); return; }
      el.classList.add('done');
      if (label) label.textContent = '✓ ' + f.name;
      onFile(f);
    }
    return { reset() { el.classList.remove('done'); if (label) label.textContent = original; input.value = ''; } };
  }

  function message(el, text, kind = 'ok') {
    el.className = 'msg show ' + kind;
    el.textContent = text;
  }

  return { val, str, num, won, esc, readFile, parseList, byModel, mark, shade, freshSheet, styleTable, borderAll, save, baseName, dropZone, message };
})();

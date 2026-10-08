/* 복약 다이어리 — 화면과 저장.
 * 데이터는 이 기기 브라우저의 localStorage 한 칸에 JSON 으로 둔다(서버 없음).
 * 계산은 schedule.js(window.MedSchedule)가 하고, 여기서는 그리기와 입력만 다룬다. */
(function () {
  'use strict';

  const S = window.MedSchedule;
  const STORE_KEY = 'med-diary:v1';

  // ---------- 저장 ----------

  const emptyData = () => ({ version: 1, meds: [], logs: {}, memos: {}, settings: { email: '' } });

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
      if (raw) return S.normalizeData(JSON.parse(raw));
    } catch (e) {
      // 읽지 못한 원본은 지우지 않고 옆 칸에 남겨 둔다. 빈 데이터로 덮어써 기록을 잃지 않도록.
      console.error(e);
      try {
        if (raw) localStorage.setItem(`${STORE_KEY}:broken:${Date.now()}`, raw);
      } catch { /* 저장 공간이 없으면 어쩔 수 없다 */ }
    }
    return emptyData();
  }

  let data = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error(e);
      toast('저장하지 못했어요. 기기 저장 공간을 확인해 주세요.');
      return false;
    }
  }

  const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const today = () => S.keyOf(new Date());
  const findMed = (id) => data.meds.find((m) => m.id === id);
  const medIndex = (id) => data.meds.findIndex((m) => m.id === id);

  function setMemo(key, text) {
    if (text.trim()) data.memos[key] = { text, updatedAt: new Date().toISOString() };
    else delete data.memos[key];
    return save();
  }

  // ---------- 화면 상태 ----------

  const newDraft = () => ({
    id: null,
    name: '',
    dose: '',
    startDate: today(),
    phases: [{ length: '', unit: 'day', pills: '1' }],
    after: 'continue',
  });

  const ui = {
    view: data.meds.length ? 'today' : 'meds',
    draft: data.meds.length ? null : newDraft(), // 약 등록·수정 폼이 열려 있으면 그 입력값
    calMonth: today().slice(0, 7),
    selected: today(),
    memoQuery: '',
    exportFrom: null,
    exportTo: null,
  };

  // ---------- 작은 도구 ----------

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

  // 그날 바로 기록했으면 시각만, 나중에 몰아서 기록했으면 기록한 날짜를 보여 준다.
  function recordedText(rec, key) {
    if (!rec.at) return '';
    const at = new Date(rec.at);
    return S.keyOf(at) === key ? fmtTime(rec.at) : `${S.fmtShort(S.keyOf(at))}에 기록`;
  }

  // 화면의 동그라미 배지에는 숫자만 넣는다(①은 글 요약용)
  const medNo = (i, small = false) =>
    `<span class="med-no${small ? ' small' : ''}" aria-hidden="true">${i + 1}</span>`;

  // 2026.09.29 ~ 10.05 처럼 같은 해면 뒤쪽 연도를 줄인다
  const fmtRange = (a, b) => `${S.fmtDate(a)} ~ ${a.slice(0, 4) === b.slice(0, 4) ? S.fmtDate(b).slice(5) : S.fmtDate(b)}`;

  function phaseItem(med, r) {
    const dose = r.pills > 0 ? `하루 ${S.fmtPills(r.pills)}` : '휴약 (안 먹음)';
    return `<strong>${r.index + 1}단계 · ${dose}</strong><span>${fmtRange(r.startKey, r.endKey)} · ${S.fmtPhaseLength(med.phases[r.index])}</span>`;
  }

  const STATUS_LABEL = {
    done: '복용 완료',
    partial: '일부 복용',
    missed: '미복용',
    pending: '복용 전',
    scheduled: '복용 예정',
    none: '일정 없음',
  };

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- 모달 ----------

  function openModal(html) {
    const root = $('#modal-root');
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = html;
    root.appendChild(el);
    const lastFocus = document.activeElement;
    requestAnimationFrame(() => el.classList.add('open'));
    const close = () => {
      el.classList.remove('open');
      setTimeout(() => el.remove(), 180);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    return { el, close };
  }

  // 예/아니오를 한 번 더 묻는다. 바깥을 누르거나 Esc 는 '아니오'.
  function confirmDialog({ title, message = '', yes = '예', no = '아니오', danger = false }) {
    return new Promise((resolve) => {
      const { el, close } = openModal(`
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-title">
          <h2 id="m-title">${esc(title)}</h2>
          ${message ? `<p class="modal-text">${esc(message)}</p>` : ''}
          <div class="modal-actions">
            <button type="button" class="btn" data-answer="no">${esc(no)}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-answer="yes">${esc(yes)}</button>
          </div>
        </div>`);
      const finish = (answer) => {
        document.removeEventListener('keydown', onKey);
        close();
        resolve(answer);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') finish(false);
      };
      document.addEventListener('keydown', onKey);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-answer]');
        if (b) finish(b.dataset.answer === 'yes');
        else if (e.target === el) finish(false);
      });
      $('[data-answer="no"]', el).focus({ preventScroll: true });
    });
  }

  // 지난 날짜 메모 쓰기·고치기. 바깥을 눌러도 닫히지 않는다(쓰던 글을 잃지 않도록).
  function editMemo(key) {
    const current = data.memos[key] ? data.memos[key].text : '';
    const { el, close } = openModal(`
      <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title">${esc(S.fmtLong(key))} 메모</h2>
        <textarea id="memo-edit" rows="7" placeholder="그날의 느낌, 컨디션, 부작용 등">${esc(current)}</textarea>
        <div class="modal-actions">
          <button type="button" class="btn" data-answer="no">취소</button>
          <button type="button" class="btn btn-primary" data-answer="yes">저장</button>
        </div>
      </div>`);
    const area = $('#memo-edit', el);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (!b) return;
      if (b.dataset.answer === 'yes' && setMemo(key, area.value)) toast('메모를 저장했어요.');
      close();
      render();
    });
  }

  // ---------- 복용 기록 ----------

  async function takeMed(medId, key) {
    const med = findMed(medId);
    if (!med) return;
    const pills = S.pillsOn(med, key);
    const t = today();
    const ok = await confirmDialog({
      title: `${med.name} ${S.fmtPills(pills)} 드셨나요?`,
      message: key === t ? '' : `${S.fmtLong(key)} 기록으로 남겨요.`,
    });
    if (!ok) return;
    if (!data.logs[key]) data.logs[key] = {};
    data.logs[key][medId] = { pills, at: new Date().toISOString() };
    if (!save()) return;
    render();
    if (S.dayStatus(data, key, t) === 'done') {
      toast(key === t ? '오늘치 약 복용 완료!' : `${S.fmtLong(key)} 복용 완료`);
    }
  }

  async function undoMed(medId, key) {
    const med = findMed(medId);
    const rec = data.logs[key] && data.logs[key][medId];
    if (!rec) return;
    const ok = await confirmDialog({
      title: '복용 기록을 취소할까요?',
      message: `${med ? med.name : '삭제된 약'} ${S.fmtPills(rec.pills)} · ${S.fmtLong(key)}`,
      yes: '예, 취소할게요',
      danger: true,
    });
    if (!ok) return;
    delete data.logs[key][medId];
    if (!Object.keys(data.logs[key]).length) delete data.logs[key];
    if (save()) {
      render();
      toast('복용 기록을 취소했어요.');
    }
  }

  // ---------- 공통 조각 ----------

  function nextChangeText(med, key) {
    const next = S.nextChange(med, key);
    if (!next) return '';
    const when = `${S.fmtShort(next.key)}`;
    if (next.pills > 0) return `${when}부터 하루 ${S.fmtPills(next.pills)}`;
    return S.nextChange(med, next.key) ? `${when}부터 휴약` : `${when}부터 복용 종료`;
  }

  function phaseText(med, phase) {
    if (!phase) return '';
    if (phase.continued) return '루틴을 마치고 계속 복용 중';
    const round = phase.round ? `${phase.round + 1}회차 · ` : '';
    return `${round}${phase.index + 1}단계 · ${phase.phaseDays}일 중 ${phase.dayInPhase}일째`;
  }

  // 복용 기간 한 줄. end 가 null 이면 끝없이 계속 먹는 중.
  function periodText(start, end, t) {
    const range = `${S.fmtDate(start)} ~ ${end ? S.fmtDate(end) : '계속'}`;
    if (t < start) return { range, progress: `D-${S.diffDays(t, start)} 시작` };
    const nth = S.diffDays(start, t) + 1;
    if (!end) return { range, progress: `오늘 ${nth}일째` };
    const total = S.diffDays(start, end) + 1;
    return { range, progress: t > end ? `종료 · 총 ${total}일` : `총 ${total}일 중 ${nth}일째` };
  }

  // ---------- 오늘 ----------

  function viewToday() {
    const t = today();
    if (!data.meds.length) {
      return `
        <section class="empty">
          <p>아직 등록한 약이 없어요.</p>
          <button type="button" class="btn btn-primary" data-action="go" data-view="meds">약 등록하러 가기</button>
        </section>`;
    }
    const status = S.dayStatus(data, t, t);
    const log = data.logs[t] || {};
    const rows = data.meds.map((med, i) => ({ med, i, phase: S.phaseOn(med, t) }));
    const due = rows.filter((r) => r.phase && r.phase.pills > 0);
    const rest = rows.filter((r) => !(r.phase && r.phase.pills > 0));
    const taken = due.filter((r) => log[r.med.id]).length;

    const headline =
      status === 'done' ? '오늘치 약 복용 완료' : due.length ? `오늘 먹을 약 ${due.length}가지` : '오늘은 먹을 약이 없어요';

    const dueCards = due
      .map(({ med, i, phase }) => {
        const rec = log[med.id];
        const next = nextChangeText(med, t);
        return `
        <article class="card med-card${rec ? ' is-taken' : ''}">
          <div class="med-card__head">
            ${medNo(i)}
            <div class="med-card__name">
              <h3>${esc(med.name)}</h3>
              ${med.dose ? `<p class="muted">${esc(med.dose)}</p>` : ''}
            </div>
            <p class="dose-big" aria-label="오늘 ${phase.pills}알"><strong>${phase.pills}</strong>알</p>
          </div>
          <p class="phase-note">${esc(phaseText(med, phase))}${next ? ` · 다음: ${esc(next)}` : ''}</p>
          ${
            rec
              ? `<div class="taken-row">
                  <span class="taken-mark" aria-hidden="true">✓</span>
                  <span class="taken-text">${S.fmtPills(rec.pills)} 복용 완료${rec.at ? ` · ${esc(recordedText(rec, t))}` : ''}</span>
                  <button type="button" class="btn btn-small btn-quiet" data-action="undo" data-med="${med.id}" data-date="${t}">기록 취소</button>
                </div>`
              : `<button type="button" class="btn btn-primary btn-block btn-tall" data-action="take" data-med="${med.id}" data-date="${t}">복용 기록하기</button>`
          }
        </article>`;
      })
      .join('');

    const restRows = rest
      .map(({ med, i }) => {
        const next = nextChangeText(med, t);
        const why = t < med.startDate ? `${S.fmtShort(med.startDate)} 시작` : next || '복용 종료';
        return `<li>${medNo(i, true)}${esc(med.name)} <span class="muted">· 오늘은 안 먹어요 (${esc(why)})</span></li>`;
      })
      .join('');

    const memo = data.memos[t];
    return `
      <section class="today-head${status === 'done' ? ' is-done' : ''}">
        <p class="eyebrow">${S.fmtDate(t)} · ${S.fmtLong(t)}</p>
        <h2>${headline}</h2>
        ${
          due.length
            ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${due.length}" aria-valuenow="${taken}" aria-label="오늘 복용 ${taken}/${due.length}">
                <span style="width:${(taken / due.length) * 100}%"></span>
              </div>
              <p class="muted small">${taken} / ${due.length} 복용</p>`
            : ''
        }
      </section>
      ${dueCards}
      ${restRows ? `<ul class="rest-list">${restRows}</ul>` : ''}
      <section class="card memo-card">
        <div class="section-head">
          <h3><label for="today-memo">오늘의 메모</label></h3>
          <span id="memo-status" class="muted small">${memo && memo.updatedAt ? `저장됨 · ${esc(fmtTime(memo.updatedAt))}` : ''}</span>
        </div>
        <p class="hint">약을 먹은 뒤 느낌, 컨디션, 부작용 등을 적어 두세요. 쓰는 대로 저장돼요.</p>
        <textarea id="today-memo" data-date="${t}" rows="5" placeholder="예) 아침 8시 복용. 오전에 조금 졸렸고 두통은 없었음.">${esc(memo ? memo.text : '')}</textarea>
      </section>`;
  }

  // ---------- 달력 ----------

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    return S.keyOf(new Date(y, m - 1 + delta, 1)).slice(0, 7);
  }

  function periodBlock(t) {
    if (!data.meds.length) return '';
    const start = data.meds.map((m) => m.startDate).sort()[0];
    const ends = data.meds.map((m) => S.endKeyOf(m));
    const end = ends.includes(null) ? null : ends.sort()[ends.length - 1];

    // 복용을 마친 날 / 먹어야 했던 날 (오늘은 다 먹었을 때만 센다)
    let doneDays = 0;
    let dueDays = 0;
    const last = end && end < t ? end : t;
    for (let k = start; k <= last; k = S.addDays(k, 1)) {
      const st = S.dayStatus(data, k, t);
      if (st === 'none' || (k === t && st !== 'done')) continue;
      dueDays++;
      if (st === 'done') doneDays++;
    }

    const overall = periodText(start, end, t);
    const perMed = data.meds
      .map((med, i) => {
        const p = periodText(med.startDate, S.endKeyOf(med), t);
        return `<li>${medNo(i, true)}<span class="period-name">${esc(med.name)}</span><span class="muted">${p.range} · ${p.progress}</span></li>`;
      })
      .join('');
    return `
      <section class="period">
        <p class="period-total"><strong>총 복용 기간</strong> ${overall.range} · ${overall.progress}${dueDays ? ` · 완료 ${doneDays}/${dueDays}일` : ''}</p>
        ${data.meds.length > 1 ? `<ul class="period-list">${perMed}</ul>` : ''}
      </section>`;
  }

  function dayDetail(key, t) {
    const status = S.dayStatus(data, key, t);
    const log = data.logs[key] || {};
    const rows = data.meds
      .map((med, i) => {
        const pills = S.pillsOn(med, key);
        const rec = log[med.id];
        if (!pills && !rec) return '';
        let state;
        if (rec) {
          state = `<span class="state state--done">✓ ${S.fmtPills(rec.pills)} 복용${rec.at ? ` · ${esc(recordedText(rec, key))}` : ''}</span>
            <button type="button" class="btn btn-small btn-quiet" data-action="undo" data-med="${med.id}" data-date="${key}">취소</button>`;
        } else if (key <= t) {
          state = `<span class="state state--${key < t ? 'missed' : 'pending'}">${key < t ? '기록 없음' : '아직'}</span>
            <button type="button" class="btn btn-small btn-primary" data-action="take" data-med="${med.id}" data-date="${key}">복용 기록</button>`;
        } else {
          state = '<span class="state">예정</span>';
        }
        return `
          <li class="detail-row">
            <div class="detail-med">${medNo(i, true)}${esc(med.name)} <strong>${S.fmtPills(rec ? rec.pills : pills)}</strong></div>
            <div class="detail-state">${state}</div>
          </li>`;
      })
      .join('');

    const memo = data.memos[key];
    const canMemo = key <= t;
    return `
      <section class="card detail" aria-live="polite">
        <div class="section-head">
          <h3>${S.fmtLong(key)}</h3>
          ${status !== 'none' ? `<span class="badge badge--${status}">${STATUS_LABEL[status]}</span>` : ''}
        </div>
        ${rows ? `<ul class="detail-list">${rows}</ul>` : '<p class="muted">이 날은 복용 일정이 없어요.</p>'}
        <div class="detail-memo">
          <h4>메모</h4>
          ${memo ? `<p class="memo-text">${esc(memo.text)}</p>` : `<p class="muted">${canMemo ? '메모가 없어요.' : '아직 오지 않은 날이에요.'}</p>`}
          ${canMemo ? `<button type="button" class="btn btn-small" data-action="edit-memo" data-date="${key}">${memo ? '메모 고치기' : '메모 쓰기'}</button>` : ''}
        </div>
      </section>`;
  }

  function viewCalendar() {
    const t = today();
    const [y, m] = ui.calMonth.split('-').map(Number);
    const first = `${ui.calMonth}-01`;
    const lead = S.weekdayOf(first);
    const count = new Date(y, m, 0).getDate();

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="day day--pad" aria-hidden="true"></span>';
    for (let d = 1; d <= count; d++) {
      const key = `${ui.calMonth}-${String(d).padStart(2, '0')}`;
      const status = S.dayStatus(data, key, t);
      const memo = !!data.memos[key];
      const cls = [
        'day',
        `day--${status}`,
        key === t ? 'is-today' : '',
        key === ui.selected ? 'is-selected' : '',
        (lead + d - 1) % 7 === 0 ? 'is-sun' : '',
        (lead + d - 1) % 7 === 6 ? 'is-sat' : '',
      ].filter(Boolean).join(' ');
      const label = `${S.fmtLong(key)} ${STATUS_LABEL[status]}${memo ? ', 메모 있음' : ''}`;
      cells += `<button type="button" class="${cls}" data-action="select-day" data-date="${key}" aria-label="${label}"${key === ui.selected ? ' aria-pressed="true"' : ''}><span>${d}</span>${memo ? '<i class="memo-dot" aria-hidden="true"></i>' : ''}</button>`;
    }

    const weekdays = S.WEEKDAYS.map((w, i) => `<span class="${i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : ''}">${w}</span>`).join('');
    return `
      ${periodBlock(t)}
      <section class="card calendar">
        <div class="cal-head">
          <button type="button" class="icon-btn" data-action="month" data-delta="-1" aria-label="이전 달">‹</button>
          <h2>${y}년 ${m}월</h2>
          <button type="button" class="icon-btn" data-action="month" data-delta="1" aria-label="다음 달">›</button>
          ${ui.calMonth !== t.slice(0, 7) ? '<button type="button" class="btn btn-small btn-quiet cal-today" data-action="month-today">오늘</button>' : ''}
        </div>
        <div class="weekdays" aria-hidden="true">${weekdays}</div>
        <div class="grid">${cells}</div>
        <ul class="legend" aria-label="색 안내">
          <li><i class="sw sw--done"></i>복용 완료</li>
          <li><i class="sw sw--partial"></i>일부 복용</li>
          <li><i class="sw sw--missed"></i>미복용</li>
          <li><i class="sw sw--memo"></i>메모</li>
        </ul>
      </section>
      ${dayDetail(ui.selected, t)}`;
  }

  // ---------- 메모 모아보기 ----------

  function memoList() {
    const t = today();
    const q = ui.memoQuery.trim();
    const keys = Object.keys(data.memos)
      .sort()
      .reverse()
      .filter((k) => !q || data.memos[k].text.includes(q));
    if (!keys.length) {
      return `<p class="empty muted">${q ? '찾는 글이 들어간 메모가 없어요.' : '아직 쓴 메모가 없어요. 오늘 화면에서 그날의 느낌을 적어 보세요.'}</p>`;
    }
    let html = '';
    let month = '';
    keys.forEach((k) => {
      const ym = k.slice(0, 7);
      if (ym !== month) {
        month = ym;
        html += `<h3 class="month-head">${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5))}월</h3>`;
      }
      const status = S.dayStatus(data, k, t);
      const log = data.logs[k] || {};
      const pills = data.meds
        .map((med, i) => {
          const due = S.pillsOn(med, k);
          const rec = log[med.id];
          if (!due && !rec) return '';
          return `<span class="${rec ? 'ok' : ''}">${S.medLabel(i)} ${S.fmtPills(rec ? rec.pills : due)} ${rec ? '✓' : '·'}</span>`;
        })
        .filter(Boolean)
        .join('');
      html += `
        <article class="card memo-item">
          <header>
            <h4>${S.fmtLong(k)}</h4>
            ${status !== 'none' ? `<span class="badge badge--${status}">${STATUS_LABEL[status]}</span>` : ''}
          </header>
          ${pills ? `<p class="memo-pills">${pills}</p>` : ''}
          <p class="memo-text">${esc(data.memos[k].text)}</p>
          <footer>
            <button type="button" class="btn btn-small btn-quiet" data-action="goto-day" data-date="${k}">달력에서 보기</button>
            <button type="button" class="btn btn-small" data-action="edit-memo" data-date="${k}">고치기</button>
          </footer>
        </article>`;
    });
    return html;
  }

  function viewMemos() {
    const total = Object.keys(data.memos).length;
    return `
      <div class="search">
        <input type="search" id="memo-search" value="${esc(ui.memoQuery)}" placeholder="메모 검색 (예: 두통)" aria-label="메모 검색">
      </div>
      <p class="muted small">메모 ${total}개</p>
      <div id="memo-list">${memoList()}</div>`;
  }

  // ---------- 약 설정 ----------

  function routinePreview() {
    const { med, errors } = S.medFromDraft(ui.draft, 'preview');
    if (!med) {
      const onlyEmpty = ui.draft.phases.every((p) => !String(p.length).trim());
      return `<p class="muted small">${onlyEmpty ? '기간과 알 수를 채우면 날짜별 일정이 여기에 보여요.' : esc(errors[0])}</p>`;
    }
    const items = S.phaseRanges(med)
      .map((r) => `<li>${phaseItem(med, r)}</li>`)
      .join('');
    return `
      <p class="preview-title">이렇게 복용해요</p>
      <ol class="preview-list">${items}</ol>
      <p class="muted small">${esc(S.afterText(med))}</p>`;
  }

  function medForm() {
    const d = ui.draft;
    const editing = !!d.id;
    const first = !data.meds.length;
    const phases = d.phases
      .map(
        (p, i) => `
        <div class="phase" data-index="${i}">
          <div class="phase-top">
            <span class="phase-no">${i + 1}단계${i ? ' (그다음)' : ''}</span>
            ${d.phases.length > 1 ? `<button type="button" class="icon-btn small" data-action="remove-phase" data-index="${i}" aria-label="${i + 1}단계 지우기">×</button>` : ''}
          </div>
          <div class="phase-row">
            <input class="num" type="text" inputmode="numeric" data-phase-field="length" value="${esc(p.length)}" placeholder="14" aria-label="${i + 1}단계 기간">
            <select data-phase-field="unit" aria-label="${i + 1}단계 기간 단위">
              <option value="day"${p.unit === 'day' ? ' selected' : ''}>일</option>
              <option value="week"${p.unit === 'week' ? ' selected' : ''}>주</option>
            </select>
            <span>동안 하루</span>
            <input class="num" type="text" inputmode="decimal" data-phase-field="pills" value="${esc(p.pills)}" placeholder="1" aria-label="${i + 1}단계 하루 알 수">
            <span>알</span>
          </div>
        </div>`,
      )
      .join('');

    return `
      ${
        first
          ? `<section class="intro">
              <h2>먼저 복용할 약을 등록해 주세요</h2>
              <p>약 이름과 용량, 기간별로 하루 몇 알씩 먹는지 적어 두면 매일 먹을 개수를 알아서 알려 드려요.</p>
            </section>`
          : ''
      }
      <form id="med-form" class="card form" novalidate>
        <h3>${editing ? '약 정보 고치기' : `${S.medLabel(data.meds.length)} 새 약 등록`}</h3>
        <label class="field">
          <span>약 이름</span>
          <input name="name" value="${esc(d.name)}" placeholder="예) 아침약" autocomplete="off" enterkeyhint="next">
        </label>
        <label class="field">
          <span>용량 <em>(선택)</em></span>
          <input name="dose" value="${esc(d.dose)}" placeholder="예) 5mg" autocomplete="off" enterkeyhint="next">
        </label>
        <label class="field">
          <span>복용 시작일</span>
          <input name="startDate" type="date" value="${esc(d.startDate)}">
        </label>
        <fieldset class="phases">
          <legend>복용 루틴</legend>
          <p class="hint">기간마다 하루 몇 알씩 먹는지 순서대로 적어 주세요. 쉬는 기간은 0알로 적으면 돼요.</p>
          ${phases}
          <button type="button" class="btn btn-ghost btn-block" data-action="add-phase">+ 그다음 단계 추가</button>
        </fieldset>
        <label class="field">
          <span>루틴이 다 끝나면</span>
          <select name="after">
            <option value="continue"${d.after === 'continue' ? ' selected' : ''}>마지막 단계 개수로 계속 먹기</option>
            <option value="stop"${d.after === 'stop' ? ' selected' : ''}>복용 종료</option>
            <option value="repeat"${d.after === 'repeat' ? ' selected' : ''}>1단계부터 다시 반복</option>
          </select>
        </label>
        <div class="routine-preview" id="routine-preview">${routinePreview()}</div>
        <div class="form-errors" id="form-errors" role="alert"></div>
        <div class="form-actions">
          ${first ? '' : '<button type="button" class="btn" data-action="cancel-form">취소</button>'}
          <button type="submit" class="btn btn-primary">${editing ? '고친 내용 저장' : '약 저장'}</button>
        </div>
      </form>`;
  }

  function viewMeds() {
    if (ui.draft) return medForm();
    const t = today();
    const cards = data.meds
      .map((med, i) => {
        const phase = S.phaseOn(med, t);
        const ranges = S.phaseRanges(med)
          .map((r) => {
            const current = phase && !phase.continued && phase.index === r.index && !phase.round;
            return `<li class="${current ? 'is-current' : ''}">${phaseItem(med, r)}${current ? '<em>지금</em>' : ''}</li>`;
          })
          .join('');
        const p = periodText(med.startDate, S.endKeyOf(med), t);
        return `
          <article class="card med-item">
            <header>
              ${medNo(i)}
              <div>
                <h3>${esc(med.name)}</h3>
                ${med.dose ? `<p class="muted">${esc(med.dose)}</p>` : ''}
              </div>
            </header>
            <ol class="routine">${ranges}</ol>
            <p class="muted small">${esc(S.afterText(med))}</p>
            <p class="today-line">오늘: ${phase && phase.pills > 0 ? `하루 ${S.fmtPills(phase.pills)}` : '안 먹는 날'} · ${p.range} · ${p.progress}</p>
            <footer>
              <button type="button" class="btn btn-small btn-quiet danger" data-action="delete-med" data-med="${med.id}">삭제</button>
              <button type="button" class="btn btn-small" data-action="edit-med" data-med="${med.id}">고치기</button>
            </footer>
          </article>`;
      })
      .join('');
    return `
      ${cards}
      <button type="button" class="btn btn-ghost btn-block" data-action="new-med">+ 약 추가하기</button>
      ${data.meds.length ? '<button type="button" class="btn btn-primary btn-block btn-tall" data-action="go" data-view="today">설정 완료 · 오늘 복용 보기</button>' : ''}`;
  }

  function draftFromMed(med) {
    return {
      id: med.id,
      name: med.name,
      dose: med.dose,
      startDate: med.startDate,
      phases: med.phases.map((p) => ({ length: String(p.length), unit: p.unit, pills: String(p.pills) })),
      after: med.after,
    };
  }

  function submitMedForm() {
    const { med, errors } = S.medFromDraft(ui.draft, ui.draft.id || newId());
    if (!med) {
      $('#form-errors').innerHTML = errors.map((e) => `<p>${esc(e)}</p>`).join('');
      $('#form-errors').scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const at = medIndex(med.id);
    if (at >= 0) data.meds[at] = med;
    else data.meds.push(med);
    if (!save()) return;
    ui.draft = null;
    render();
    window.scrollTo(0, 0);
    toast(at >= 0 ? '고친 내용을 저장했어요.' : `${med.name} 등록 완료`);
  }

  async function deleteMed(medId) {
    const med = findMed(medId);
    if (!med) return;
    const ok = await confirmDialog({
      title: `${med.name}을(를) 지울까요?`,
      message: '이 약의 복용 기록도 함께 지워져요. 날짜별 메모는 남아요.',
      yes: '예, 지울게요',
      danger: true,
    });
    if (!ok) return;
    data.meds = data.meds.filter((m) => m.id !== medId);
    Object.keys(data.logs).forEach((k) => {
      delete data.logs[k][medId];
      if (!Object.keys(data.logs[k]).length) delete data.logs[k];
    });
    if (save()) {
      if (!data.meds.length) ui.draft = newDraft();
      render();
      toast('약을 지웠어요.');
    }
  }

  // ---------- 보내기 · 백업 ----------

  function firstRecordKey() {
    const keys = [...data.meds.map((m) => m.startDate), ...Object.keys(data.logs), ...Object.keys(data.memos)].sort();
    const t = today();
    return keys.length && keys[0] < t ? keys[0] : t;
  }

  function exportRange() {
    const from = ui.exportFrom || firstRecordKey();
    const to = ui.exportTo || today();
    return from <= to ? { from, to } : { from: to, to: from };
  }

  const summaryText = () => {
    const { from, to } = exportRange();
    return S.buildSummary(data, from, to, today());
  };

  function viewExport() {
    const { from, to } = exportRange();
    const canShare = typeof navigator.share === 'function';
    return `
      <section class="card">
        <h3>기록 요약 보내기</h3>
        <p class="hint">약 루틴과 날짜별 복용·메모를 글로 정리해서 메일, 카카오톡, 메모 앱 등으로 보낼 수 있어요.</p>
        <div class="range">
          <label class="field"><span>시작</span><input type="date" id="ex-from" value="${from}"></label>
          <span class="range-sep">~</span>
          <label class="field"><span>끝</span><input type="date" id="ex-to" value="${to}"></label>
        </div>
        <div class="chips">
          <button type="button" class="chip" data-action="range" data-range="7">최근 7일</button>
          <button type="button" class="chip" data-action="range" data-range="30">최근 30일</button>
          <button type="button" class="chip" data-action="range" data-range="all">처음부터</button>
        </div>
        <label class="field">
          <span>받는 사람 메일 <em>(선택)</em></span>
          <input type="email" id="ex-email" value="${esc(data.settings.email)}" placeholder="예) me@example.com" autocomplete="email">
        </label>
        <pre class="summary" id="ex-preview" tabindex="0" aria-label="보낼 내용 미리보기">${esc(summaryText())}</pre>
        <div class="btn-grid">
          ${canShare ? '<button type="button" class="btn btn-primary" data-action="share">공유하기</button>' : ''}
          <button type="button" class="btn${canShare ? '' : ' btn-primary'}" data-action="mail">메일로 보내기</button>
          <button type="button" class="btn" data-action="copy">복사하기</button>
          <button type="button" class="btn" data-action="download-txt">텍스트 파일 저장</button>
        </div>
      </section>
      <section class="card">
        <h3>백업</h3>
        <p class="hint">기록은 서버가 아니라 이 기기의 브라우저에만 저장돼요. 폰을 바꾸거나 Safari 방문 기록·데이터를 지우면 사라질 수 있으니 가끔 백업 파일을 저장해 두세요.</p>
        <div class="btn-grid">
          <button type="button" class="btn" data-action="backup">백업 파일 저장</button>
          <button type="button" class="btn" data-action="restore">백업 불러오기</button>
        </div>
        <input type="file" id="restore-file" accept=".json,application/json" hidden>
        <button type="button" class="btn btn-quiet danger btn-block" data-action="reset">모든 데이터 지우기</button>
      </section>`;
  }

  function downloadFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API 가 막힌 환경(http 등)에서는 옛 방식으로
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast('복사했어요. 원하는 곳에 붙여 넣으세요.');
  }

  function subjectLine() {
    const { from, to } = exportRange();
    return `복약 기록 요약 (${S.fmtDate(from)} ~ ${S.fmtDate(to)})`;
  }

  async function restoreFrom(file) {
    let next;
    try {
      next = S.normalizeData(JSON.parse(await file.text()));
    } catch (e) {
      toast(`불러오지 못했어요: ${e.message}`);
      return;
    }
    const ok = await confirmDialog({
      title: '백업 파일로 바꿀까요?',
      message: `지금 기록은 덮어써져요. (약 ${next.meds.length}개 · 복용 기록 ${Object.keys(next.logs).length}일 · 메모 ${Object.keys(next.memos).length}개)`,
      yes: '예, 바꿀게요',
      danger: true,
    });
    if (!ok) return;
    data = next;
    if (!save()) return;
    ui.draft = data.meds.length ? null : newDraft();
    ui.exportFrom = null;
    ui.exportTo = null;
    render();
    toast('백업을 불러왔어요.');
  }

  async function resetAll() {
    const first = await confirmDialog({
      title: '모든 데이터를 지울까요?',
      message: '약 설정, 복용 기록, 메모가 모두 지워져요.',
      yes: '예',
      danger: true,
    });
    if (!first) return;
    const second = await confirmDialog({
      title: '정말 지울까요?',
      message: '되돌릴 수 없어요. 필요하면 먼저 백업 파일을 저장하세요.',
      yes: '모두 지우기',
      danger: true,
    });
    if (!second) return;
    data = emptyData();
    save();
    ui.view = 'meds';
    ui.draft = newDraft();
    render();
    toast('모두 지웠어요.');
  }

  // ---------- 그리기 ----------

  const VIEWS = { today: viewToday, calendar: viewCalendar, memos: viewMemos, meds: viewMeds, export: viewExport };
  const TITLES = { today: '오늘', calendar: '달력', memos: '메모 모아보기', meds: '약 설정', export: '보내기 · 백업' };
  let renderedDay = today();

  function render() {
    const area = $('#today-memo');
    if (area && memoDirty) saveTodayMemo(area);
    renderedDay = today();
    $('#title').textContent = TITLES[ui.view];
    document.title = `${TITLES[ui.view]} · 복약 다이어리`;
    $('#view').innerHTML = VIEWS[ui.view]();
    document.querySelectorAll('.tab').forEach((tab) => {
      if (tab.dataset.view === ui.view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  }

  function go(view) {
    ui.view = view;
    if (view === 'meds' && !data.meds.length && !ui.draft) ui.draft = newDraft();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 입력 ----------

  const ACTIONS = {
    go: (b) => go(b.dataset.view),
    take: (b) => takeMed(b.dataset.med, b.dataset.date),
    undo: (b) => undoMed(b.dataset.med, b.dataset.date),
    'select-day': (b) => {
      ui.selected = b.dataset.date;
      render();
      $('.detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    month: (b) => {
      ui.calMonth = shiftMonth(ui.calMonth, Number(b.dataset.delta));
      render();
    },
    'month-today': () => {
      ui.calMonth = today().slice(0, 7);
      ui.selected = today();
      render();
    },
    'edit-memo': (b) => editMemo(b.dataset.date),
    'goto-day': (b) => {
      ui.selected = b.dataset.date;
      ui.calMonth = b.dataset.date.slice(0, 7);
      go('calendar');
    },
    'new-med': () => {
      ui.draft = newDraft();
      render();
      window.scrollTo(0, 0);
    },
    'edit-med': (b) => {
      ui.draft = draftFromMed(findMed(b.dataset.med));
      render();
      window.scrollTo(0, 0);
    },
    'delete-med': (b) => deleteMed(b.dataset.med),
    'cancel-form': () => {
      ui.draft = null;
      render();
    },
    'add-phase': () => {
      const last = ui.draft.phases[ui.draft.phases.length - 1];
      ui.draft.phases.push({ length: '', unit: last ? last.unit : 'day', pills: '' });
      render();
      const inputs = document.querySelectorAll('.phase [data-phase-field="length"]');
      inputs[inputs.length - 1].focus();
    },
    'remove-phase': (b) => {
      ui.draft.phases.splice(Number(b.dataset.index), 1);
      render();
    },
    range: (b) => {
      const t = today();
      ui.exportTo = t;
      ui.exportFrom = b.dataset.range === 'all' ? null : S.addDays(t, -(Number(b.dataset.range) - 1));
      render();
    },
    share: async () => {
      try {
        await navigator.share({ title: subjectLine(), text: summaryText() });
      } catch (e) {
        if (e.name !== 'AbortError') toast('공유하지 못했어요. 복사하기를 써 주세요.');
      }
    },
    mail: () => {
      const to = data.settings.email.trim();
      const address = /^[^\s@?&]+@[^\s@?&]+$/.test(to) ? to : '';
      location.href = `mailto:${address}?subject=${encodeURIComponent(subjectLine())}&body=${encodeURIComponent(summaryText())}`;
    },
    copy: () => copyText(summaryText()),
    'download-txt': () => downloadFile(`med-diary-summary-${today()}.txt`, summaryText(), 'text/plain;charset=utf-8'),
    backup: () => {
      downloadFile(`med-diary-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('백업 파일을 만들었어요. 파일 앱이나 메일 등에 보관하세요.');
    },
    restore: () => $('#restore-file').click(),
    reset: () => resetAll(),
  };

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) {
      go(tab.dataset.view);
      return;
    }
    const b = e.target.closest('[data-action]');
    if (b && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action](b);
  });

  let memoTimer = null;
  let memoDirty = false;
  function saveTodayMemo(area) {
    clearTimeout(memoTimer);
    if (!memoDirty) return;
    memoDirty = false;
    if (setMemo(area.dataset.date, area.value)) {
      const status = $('#memo-status');
      if (status) status.textContent = area.value.trim() ? `저장됨 · ${fmtTime(new Date().toISOString())}` : '';
    }
  }

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'today-memo') {
      memoDirty = true;
      $('#memo-status').textContent = '저장 중…';
      clearTimeout(memoTimer);
      memoTimer = setTimeout(() => saveTodayMemo(el), 500);
    } else if (el.id === 'memo-search') {
      ui.memoQuery = el.value;
      $('#memo-list').innerHTML = memoList();
    } else if (el.closest('#med-form')) {
      const phase = el.closest('.phase');
      if (phase && el.dataset.phaseField) ui.draft.phases[Number(phase.dataset.index)][el.dataset.phaseField] = el.value;
      else if (el.name) ui.draft[el.name] = el.value;
      $('#routine-preview').innerHTML = routinePreview();
      $('#form-errors').innerHTML = '';
    } else if (el.id === 'ex-email') {
      data.settings.email = el.value;
      save();
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'today-memo') saveTodayMemo(el);
    else if (el.id === 'ex-from' || el.id === 'ex-to') {
      if (!S.isValidKey(el.value)) return;
      if (el.id === 'ex-from') ui.exportFrom = el.value;
      else ui.exportTo = el.value;
      $('#ex-preview').textContent = summaryText();
    } else if (el.id === 'restore-file' && el.files[0]) {
      restoreFrom(el.files[0]);
      el.value = '';
    } else if (el.closest('#med-form') && el.tagName === 'SELECT') {
      // iOS 는 select 에서 input 이벤트를 안 보내는 경우가 있어 change 로도 받는다.
      const phase = el.closest('.phase');
      if (phase && el.dataset.phaseField) ui.draft.phases[Number(phase.dataset.index)][el.dataset.phaseField] = el.value;
      else if (el.name) ui.draft[el.name] = el.value;
      $('#routine-preview').innerHTML = routinePreview();
    }
  });

  // 메모를 쓰다가 앱을 닫거나 다른 탭으로 가도 마지막 글자까지 저장한다.
  document.addEventListener('focusout', (e) => {
    if (e.target.id === 'today-memo') saveTodayMemo(e.target);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'med-form') {
      e.preventDefault();
      submitMedForm();
    }
  });

  // 앱을 켜 둔 채 자정을 넘기면 다시 열었을 때 새 날짜로 그린다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const area = $('#today-memo');
      if (area) saveTodayMemo(area);
    } else if (today() !== renderedDay && !$('.modal-backdrop')) {
      if (ui.selected === renderedDay) ui.selected = today();
      if (ui.calMonth === renderedDay.slice(0, 7)) ui.calMonth = today().slice(0, 7);
      render();
    }
  });

  render();

  // 브라우저가 저장 공간이 부족할 때 이 사이트 데이터를 먼저 지우지 않도록 요청한다.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  }
})();

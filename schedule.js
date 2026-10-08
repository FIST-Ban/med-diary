/* 복약 다이어리 — 날짜·루틴·요약 계산.
 * 화면(DOM)과 무관한 순수 함수만 모아 두어 Node 로도 테스트할 수 있게 한다.
 * 날짜는 모두 'YYYY-MM-DD' 문자열(기기의 현지 날짜)로 다룬다.
 * 이 형식은 문자열 비교(<, >)가 곧 날짜 비교가 된다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MedSchedule = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 86400000;
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
  const AFTER_MODES = ['continue', 'stop', 'repeat'];

  // ---------- 날짜 ----------

  const pad = (n) => String(n).padStart(2, '0');

  function keyOf(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // 날짜 차이는 UTC 자정 기준으로 센다. 현지 시각으로 세면
  // 서머타임이 있는 지역에서 하루가 23·25시간이 되어 어긋난다.
  function utcOf(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function fromUtc(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  const addDays = (key, n) => fromUtc(utcOf(key) + n * DAY_MS);
  const diffDays = (from, to) => Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
  const weekdayOf = (key) => new Date(utcOf(key)).getUTCDay();
  const isValidKey = (key) =>
    typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && fromUtc(utcOf(key)) === key;

  // ---------- 표기 ----------

  const fmtDate = (key) => key.replace(/-/g, '.'); // 2026.10.08
  const fmtShort = (key) => `${key.slice(5).replace('-', '.')} (${WEEKDAYS[weekdayOf(key)]})`; // 10.08 (수)

  function fmtLong(key) {
    const [, m, d] = key.split('-').map(Number);
    return `${m}월 ${d}일 (${WEEKDAYS[weekdayOf(key)]})`; // 10월 8일 (수)
  }

  const fmtPills = (n) => `${n}알`;
  const medLabel = (index) => CIRCLED[index] || `(${index + 1})`;
  const fmtPhaseLength = (p) => (p.unit === 'week' ? `${p.length}주` : `${p.length}일`);

  // ---------- 루틴 ----------
  // 약 하나: { id, name, dose, startDate, phases: [{ length, unit: 'day'|'week', pills }], after }
  // after — 루틴의 마지막 단계가 끝난 뒤:
  //   'continue' 마지막 단계 개수로 계속 · 'stop' 복용 종료 · 'repeat' 처음 단계부터 반복

  const phaseDays = (p) => p.length * (p.unit === 'week' ? 7 : 1);
  const cycleDays = (med) => med.phases.reduce((sum, p) => sum + phaseDays(p), 0);

  // 단계마다 실제 달력 날짜 범위 (첫 회차 기준)
  function phaseRanges(med) {
    let offset = 0;
    return med.phases.map((p, index) => {
      const days = phaseDays(p);
      const range = {
        index,
        pills: p.pills,
        days,
        startKey: addDays(med.startDate, offset),
        endKey: addDays(med.startDate, offset + days - 1),
      };
      offset += days;
      return range;
    });
  }

  // 마지막으로 먹는 날. 루틴이 끝난 뒤 계속·반복하면 끝이 없으므로 null.
  const endKeyOf = (med) => (med.after === 'stop' ? addDays(med.startDate, cycleDays(med) - 1) : null);

  // key 날짜가 루틴의 몇 번째 단계인지와 그날 먹을 알 수.
  // 시작 전이거나, '복용 종료'로 설정한 루틴이 끝났으면 null.
  function phaseOn(med, key) {
    const total = cycleDays(med);
    let day = diffDays(med.startDate, key);
    if (day < 0 || total <= 0) return null;
    let round = 0;
    if (day >= total) {
      if (med.after === 'stop') return null;
      if (med.after !== 'repeat') {
        const last = med.phases.length - 1;
        return { index: last, pills: med.phases[last].pills, round: 0, continued: true, dayInPhase: null, phaseDays: null };
      }
      round = Math.floor(day / total);
      day %= total;
    }
    let offset = 0;
    for (let i = 0; i < med.phases.length; i++) {
      const days = phaseDays(med.phases[i]);
      if (day < offset + days) {
        return { index: i, pills: med.phases[i].pills, round, continued: false, dayInPhase: day - offset + 1, phaseDays: days };
      }
      offset += days;
    }
    return null;
  }

  const pillsOn = (med, key) => {
    const phase = phaseOn(med, key);
    return phase ? phase.pills : 0;
  };

  // key 다음으로 하루 알 수가 바뀌는 날. 바뀌지 않으면(계속 복용 중) null.
  // pills 가 0 이면 그날부터 복용 종료 또는 휴약이다.
  function nextChange(med, key) {
    const current = pillsOn(med, key);
    const limit = Math.max(0, diffDays(key, med.startDate)) + cycleDays(med) + 1;
    for (let d = 1; d <= limit; d++) {
      const day = addDays(key, d);
      const pills = pillsOn(med, day);
      if (pills !== current) return { key: day, pills };
    }
    return null;
  }

  // ---------- 하루 상태 ----------
  // done 모두 복용 · partial 일부만 · missed 지난 날 미복용
  // pending 오늘 아직 · scheduled 앞으로 먹을 날 · none 일정 없음

  function dayStatus(data, key, today) {
    const due = data.meds.filter((m) => pillsOn(m, key) > 0);
    if (!due.length) return 'none';
    const log = data.logs[key] || {};
    const taken = due.filter((m) => log[m.id]).length;
    if (taken === due.length) return 'done';
    if (taken > 0) return 'partial';
    if (key < today) return 'missed';
    return key === today ? 'pending' : 'scheduled';
  }

  // from~to 중 오늘까지, 이 약을 먹어야 했던 날 수와 기록한 날 수
  function adherence(data, med, from, to, today) {
    const last = to < today ? to : today;
    let due = 0;
    let taken = 0;
    for (let k = from; k <= last; k = addDays(k, 1)) {
      if (pillsOn(med, k) > 0) {
        due++;
        if (data.logs[k] && data.logs[k][med.id]) taken++;
      }
    }
    return { due, taken };
  }

  // ---------- 입력 검증 ----------

  // 약 등록 폼의 입력값(문자열)을 약 하나로 바꾼다. 틀린 곳이 있으면 errors 에 담는다.
  function medFromDraft(draft, id) {
    const errors = [];
    const name = String(draft.name || '').trim();
    if (!name) errors.push('약 이름을 적어 주세요.');
    if (!isValidKey(draft.startDate)) errors.push('복용 시작일을 골라 주세요.');

    const phases = (draft.phases || []).map((p, i) => {
      const lengthText = String(p.length ?? '').trim();
      const pillsText = String(p.pills ?? '').trim();
      const length = Number(lengthText);
      const pills = Number(pillsText);
      if (!lengthText || !Number.isInteger(length) || length < 1) {
        errors.push(`${i + 1}단계 기간을 1 이상의 숫자로 적어 주세요.`);
      }
      if (!pillsText || !Number.isFinite(pills) || pills < 0) {
        errors.push(`${i + 1}단계에 하루 몇 알인지 적어 주세요.`);
      }
      return { length, unit: p.unit === 'week' ? 'week' : 'day', pills };
    });
    if (!phases.length) errors.push('복용 단계를 하나 이상 넣어 주세요.');
    else if (errors.length === 0 && !phases.some((p) => p.pills > 0)) {
      errors.push('하루 1알 이상 먹는 단계가 하나는 있어야 해요.');
    }

    if (errors.length) return { errors, med: null };
    return {
      errors,
      med: {
        id,
        name,
        dose: String(draft.dose || '').trim(),
        startDate: draft.startDate,
        phases,
        after: AFTER_MODES.includes(draft.after) ? draft.after : 'continue',
      },
    };
  }

  // 저장소나 백업 파일에서 읽은 값을 확인하고 빠진 칸을 채운다. 쓸 수 없으면 예외.
  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.meds)) {
      throw new Error('복약 다이어리 데이터가 아니에요.');
    }
    const meds = raw.meds.map((m, i) => {
      const { med, errors } = medFromDraft(m || {}, m && m.id);
      if (!med || typeof med.id !== 'string' || !med.id) {
        throw new Error(`${i + 1}번째 약 정보가 올바르지 않아요. ${errors.join(' ')}`.trim());
      }
      return med;
    });
    const logs = {};
    Object.entries(raw.logs && typeof raw.logs === 'object' ? raw.logs : {}).forEach(([key, day]) => {
      if (!isValidKey(key) || !day || typeof day !== 'object') return;
      const kept = {};
      Object.entries(day).forEach(([medId, rec]) => {
        if (rec && typeof rec === 'object' && Number.isFinite(Number(rec.pills))) {
          kept[medId] = { pills: Number(rec.pills), at: typeof rec.at === 'string' ? rec.at : null };
        }
      });
      if (Object.keys(kept).length) logs[key] = kept;
    });
    const memos = {};
    Object.entries(raw.memos && typeof raw.memos === 'object' ? raw.memos : {}).forEach(([key, memo]) => {
      if (isValidKey(key) && memo && typeof memo.text === 'string' && memo.text.trim()) {
        memos[key] = { text: memo.text, updatedAt: typeof memo.updatedAt === 'string' ? memo.updatedAt : null };
      }
    });
    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    return {
      version: 1,
      meds,
      logs,
      memos,
      settings: { email: typeof settings.email === 'string' ? settings.email : '' },
    };
  }

  // ---------- 요약 글 ----------

  function phaseLine(med, range) {
    const p = med.phases[range.index];
    const dose = range.pills > 0 ? `하루 ${fmtPills(range.pills)}` : '휴약 (안 먹음)';
    return `${range.index + 1}단계: ${fmtDate(range.startKey)} ~ ${fmtDate(range.endKey)} (${fmtPhaseLength(p)}) · ${dose}`;
  }

  function afterText(med) {
    if (med.after === 'stop') return '루틴이 끝나면 복용 종료';
    if (med.after === 'repeat') return '루틴이 끝나면 1단계부터 반복';
    const last = med.phases[med.phases.length - 1];
    return last.pills > 0 ? `루틴이 끝난 뒤에도 하루 ${fmtPills(last.pills)}씩 계속` : '루틴이 끝나면 복용 종료';
  }

  // 의사·가족에게 보내기 좋은 글로 정리한다.
  function buildSummary(data, from, to, today) {
    const lines = [];
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    const dayLabel = (k) => (sameYear ? fmtShort(k) : `${fmtDate(k)} (${WEEKDAYS[weekdayOf(k)]})`);

    lines.push('[복약 기록 요약]');
    lines.push(`기간: ${fmtDate(from)} ~ ${fmtDate(to)} (${diffDays(from, to) + 1}일)`);
    lines.push(`작성일: ${fmtDate(today)}`);
    lines.push('');
    lines.push('■ 약과 복용 루틴');
    if (!data.meds.length) lines.push('등록된 약이 없어요.');
    data.meds.forEach((med, i) => {
      lines.push(`${medLabel(i)} ${med.name}${med.dose ? ` ${med.dose}` : ''}`);
      lines.push(`  · 시작일: ${fmtDate(med.startDate)}`);
      phaseRanges(med).forEach((r) => lines.push(`  · ${phaseLine(med, r)}`));
      lines.push(`  · ${afterText(med)}`);
      const a = adherence(data, med, from, to, today);
      if (a.due) lines.push(`  · 이 기간 복용: ${a.due}일 중 ${a.taken}일 (${Math.round((a.taken / a.due) * 100)}%)`);
    });

    lines.push('');
    lines.push('■ 날짜별 기록 (✓ 복용 · ✗ 안 먹음 · … 아직)');
    let any = false;
    for (let k = from; k <= to; k = addDays(k, 1)) {
      const log = data.logs[k] || {};
      const items = [];
      data.meds.forEach((med, i) => {
        const pills = pillsOn(med, k);
        const rec = log[med.id];
        if (!pills && !rec) return;
        const mark = rec ? '✓' : k < today ? '✗' : '…';
        items.push(`${medLabel(i)}${med.name} ${fmtPills(rec ? rec.pills : pills)} ${mark}`);
      });
      const memo = data.memos[k] ? data.memos[k].text.trim() : '';
      if (!items.length && !memo) continue;
      any = true;
      lines.push(`${dayLabel(k)}  ${items.length ? items.join(' · ') : '복용 일정 없음'}`);
      if (memo) memo.split('\n').forEach((l, j) => lines.push(`${j ? '        ' : '  메모: '}${l}`));
    }
    if (!any) lines.push('이 기간에는 기록이 없어요.');
    return lines.join('\n');
  }

  return {
    WEEKDAYS,
    keyOf,
    addDays,
    diffDays,
    weekdayOf,
    isValidKey,
    fmtDate,
    fmtShort,
    fmtLong,
    fmtPills,
    fmtPhaseLength,
    medLabel,
    phaseDays,
    cycleDays,
    phaseRanges,
    endKeyOf,
    phaseOn,
    pillsOn,
    nextChange,
    dayStatus,
    adherence,
    medFromDraft,
    normalizeData,
    phaseLine,
    afterText,
    buildSummary,
  };
});

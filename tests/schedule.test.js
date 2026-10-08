// 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');

const med = (over = {}) => ({
  id: 'a',
  name: '아침약',
  dose: '5mg',
  startDate: '2026-10-01',
  phases: [
    { length: 14, unit: 'day', pills: 1 },
    { length: 2, unit: 'week', pills: 2 },
  ],
  after: 'continue',
  ...over,
});

test('날짜 계산은 월말·윤년을 넘어간다', () => {
  assert.equal(S.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(S.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(S.diffDays('2026-12-25', '2027-01-04'), 10);
  assert.equal(S.weekdayOf('2026-10-08'), 4); // 목요일
  assert.equal(S.fmtLong('2026-10-08'), '10월 8일 (목)');
  assert.ok(S.isValidKey('2026-02-28'));
  assert.ok(!S.isValidKey('2026-02-30'));
  assert.ok(!S.isValidKey('2026-2-3'));
});

test('단계별로 하루 알 수가 바뀐다 (일·주 단위)', () => {
  const m = med();
  assert.equal(S.pillsOn(m, '2026-09-30'), 0); // 시작 전
  assert.equal(S.pillsOn(m, '2026-10-01'), 1);
  assert.equal(S.pillsOn(m, '2026-10-14'), 1); // 14일째
  assert.equal(S.pillsOn(m, '2026-10-15'), 2); // 2단계 첫날
  assert.equal(S.pillsOn(m, '2026-10-28'), 2); // 2주 마지막 날
  const p = S.phaseOn(m, '2026-10-17');
  assert.equal(p.index, 1);
  assert.equal(p.dayInPhase, 3);
  assert.equal(p.phaseDays, 14);
});

test('루틴이 끝난 뒤: 계속 · 종료 · 반복', () => {
  assert.equal(S.pillsOn(med({ after: 'continue' }), '2027-03-01'), 2);
  assert.ok(S.phaseOn(med({ after: 'continue' }), '2027-03-01').continued);
  assert.equal(S.endKeyOf(med({ after: 'continue' })), null);

  assert.equal(S.pillsOn(med({ after: 'stop' }), '2026-10-28'), 2);
  assert.equal(S.pillsOn(med({ after: 'stop' }), '2026-10-29'), 0);
  assert.equal(S.endKeyOf(med({ after: 'stop' })), '2026-10-28');

  const r = med({ after: 'repeat' }); // 28일 주기
  assert.equal(S.pillsOn(r, '2026-10-29'), 1); // 2회차 1단계
  assert.equal(S.phaseOn(r, '2026-10-29').round, 1);
  assert.equal(S.pillsOn(r, '2026-11-12'), 2); // 2회차 2단계
});

test('휴약(0알) 단계는 먹지 않는 날이다', () => {
  const m = med({ phases: [{ length: 3, unit: 'week', pills: 1 }, { length: 1, unit: 'week', pills: 0 }], after: 'repeat' });
  assert.equal(S.pillsOn(m, '2026-10-21'), 1);
  assert.equal(S.pillsOn(m, '2026-10-22'), 0);
  assert.equal(S.pillsOn(m, '2026-10-29'), 1);
});

test('다음에 알 수가 바뀌는 날을 알려 준다', () => {
  assert.deepEqual(S.nextChange(med(), '2026-10-10'), { key: '2026-10-15', pills: 2 });
  assert.equal(S.nextChange(med(), '2026-10-20'), null); // 계속 2알
  assert.deepEqual(S.nextChange(med({ after: 'stop' }), '2026-10-20'), { key: '2026-10-29', pills: 0 });
  assert.deepEqual(S.nextChange(med(), '2026-09-20'), { key: '2026-10-01', pills: 1 }); // 시작 전
  // 같은 개수가 이어지는 단계는 건너뛴다
  const same = med({ phases: [{ length: 3, unit: 'day', pills: 1 }, { length: 3, unit: 'day', pills: 1 }, { length: 3, unit: 'day', pills: 2 }] });
  assert.deepEqual(S.nextChange(same, '2026-10-01'), { key: '2026-10-07', pills: 2 });
});

test('하루 상태: 완료·일부·미복용·오늘·예정·없음', () => {
  const a = med({ id: 'a' });
  const b = med({ id: 'b', startDate: '2026-10-05' });
  const data = {
    meds: [a, b],
    logs: {
      '2026-10-05': { a: { pills: 1 }, b: { pills: 1 } },
      '2026-10-06': { a: { pills: 1 } },
    },
    memos: {},
  };
  const today = '2026-10-08';
  assert.equal(S.dayStatus(data, '2026-09-30', today), 'none');
  assert.equal(S.dayStatus(data, '2026-10-05', today), 'done');
  assert.equal(S.dayStatus(data, '2026-10-06', today), 'partial');
  assert.equal(S.dayStatus(data, '2026-10-07', today), 'missed');
  assert.equal(S.dayStatus(data, '2026-10-08', today), 'pending');
  assert.equal(S.dayStatus(data, '2026-10-09', today), 'scheduled');
  // 약 b 는 10/5 시작이므로 10/3 은 a 만 먹으면 완료
  data.logs['2026-10-03'] = { a: { pills: 1 } };
  assert.equal(S.dayStatus(data, '2026-10-03', today), 'done');
  assert.deepEqual(S.adherence(data, a, '2026-10-01', '2026-10-31', today), { due: 8, taken: 3 });
});

test('약 등록 폼 검증', () => {
  const ok = S.medFromDraft(
    { name: ' 아침약 ', dose: '5mg', startDate: '2026-10-01', phases: [{ length: '14', unit: 'day', pills: '0.5' }], after: 'stop' },
    'x',
  );
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.med.name, '아침약');
  assert.deepEqual(ok.med.phases, [{ length: 14, unit: 'day', pills: 0.5 }]);

  const bad = S.medFromDraft({ name: '', startDate: '', phases: [{ length: '', unit: 'day', pills: '' }] }, 'x');
  assert.equal(bad.med, null);
  assert.equal(bad.errors.length, 4);

  const allZero = S.medFromDraft({ name: 'a', startDate: '2026-10-01', phases: [{ length: '7', unit: 'day', pills: '0' }] }, 'x');
  assert.match(allZero.errors[0], /1알 이상/);

  const fraction = S.medFromDraft({ name: 'a', startDate: '2026-10-01', phases: [{ length: '1.5', unit: 'week', pills: '1' }] }, 'x');
  assert.match(fraction.errors[0], /1단계 기간/);
});

test('백업 데이터 확인', () => {
  const data = S.normalizeData({
    meds: [med()],
    logs: { '2026-10-01': { a: { pills: 1, at: '2026-10-01T00:00:00Z' } }, 'bad-key': { a: { pills: 1 } } },
    memos: { '2026-10-01': { text: '졸림' }, '2026-10-02': { text: '   ' } },
  });
  assert.deepEqual(Object.keys(data.logs), ['2026-10-01']);
  assert.deepEqual(Object.keys(data.memos), ['2026-10-01']);
  assert.equal(data.settings.email, '');
  assert.throws(() => S.normalizeData({ hello: 1 }));
  assert.throws(() => S.normalizeData({ meds: [{ id: 'a', name: '', startDate: '2026-10-01', phases: [] }] }));
});

test('요약 글에 루틴, 복용 표시, 메모가 들어간다', () => {
  const data = {
    meds: [med({ id: 'a' }), med({ id: 'b', name: '저녁약', dose: '', phases: [{ length: 30, unit: 'day', pills: 2 }], after: 'stop' })],
    logs: { '2026-10-01': { a: { pills: 1 }, b: { pills: 2 } } },
    memos: { '2026-10-01': { text: '첫날.\n오후에 약간 졸림' } },
  };
  const text = S.buildSummary(data, '2026-10-01', '2026-10-03', '2026-10-03');
  assert.match(text, /기간: 2026\.10\.01 ~ 2026\.10\.03 \(3일\)/);
  assert.match(text, /① 아침약 5mg/);
  assert.match(text, /1단계: 2026\.10\.01 ~ 2026\.10\.14 \(14일\) · 하루 1알/);
  assert.match(text, /2단계: 2026\.10\.15 ~ 2026\.10\.28 \(2주\) · 하루 2알/);
  assert.match(text, /루틴이 끝난 뒤에도 하루 2알씩 계속/);
  assert.match(text, /② 저녁약\n/);
  assert.match(text, /루틴이 끝나면 복용 종료/);
  assert.match(text, /이 기간 복용: 3일 중 1일 \(33%\)/);
  assert.match(text, /10\.01 \(목\) {2}①아침약 1알 ✓ · ②저녁약 2알 ✓/);
  assert.match(text, /10\.02 \(금\) {2}①아침약 1알 ✗ · ②저녁약 2알 ✗/);
  assert.match(text, /10\.03 \(토\) {2}①아침약 1알 … · ②저녁약 2알 …/); // 오늘은 아직
  assert.match(text, / {2}메모: 첫날\.\n {8}오후에 약간 졸림/);
});

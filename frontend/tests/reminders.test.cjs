const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Load the pure reminders-config helpers the same way the permissions test
// loads its module: transpile the real TypeScript and run it in isolation.
function loadRemindersConfig() {
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/reminders-config.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports });
  return exports;
}

const { canConfigureReminders, validateReminderOffsets, summarizeReminderRecipients } =
  loadRemindersConfig();

const PRESETS = [
  { minutes: 10080, label: '1 week before' },
  { minutes: 1440, label: '24 hours before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 60, label: '1 hour before' },
];

test('only PM, LC, and Admin can configure reminders', () => {
  for (const role of ['PM', 'LC', 'ADMIN']) {
    assert.equal(canConfigureReminders(role), true, role);
  }
  for (const role of ['CONSULTANT', 'PARTNER', 'EXECUTIVE']) {
    assert.equal(canConfigureReminders(role), false, role);
  }
});

test('validateReminderOffsets keeps only allowed presets and de-duplicates', () => {
  const { offsets, trimmed } = validateReminderOffsets([1440, 999, 60, 1440], PRESETS);
  assert.deepEqual([...offsets], [1440, 60]);
  assert.equal(trimmed, false);
});

test('validateReminderOffsets caps at maxOffsets and reports trimming', () => {
  const { offsets, trimmed } = validateReminderOffsets(
    PRESETS.map((p) => p.minutes),
    PRESETS,
    2,
  );
  assert.deepEqual([...offsets], [10080, 1440]);
  assert.equal(trimmed, true);
});

test('summarizeReminderRecipients counts unique people, flags missing Slack and unassigned work', () => {
  const groups = [
    {
      deliverableId: 'd1',
      title: 'Week 1 Memo',
      unassigned: false,
      recipients: [
        { userId: 'u1', email: 'a@x.test', name: 'Ann Alpha', slackConnected: true },
        { userId: 'u2', email: 'b@x.test', name: 'Bob Beta', slackConnected: false },
      ],
    },
    {
      deliverableId: 'd2',
      title: 'Week 1 Deck',
      unassigned: false,
      recipients: [{ userId: 'u1', email: 'a@x.test', name: 'Ann Alpha', slackConnected: true }],
    },
    { deliverableId: 'd3', title: 'Week 2 Survey', unassigned: true, recipients: [] },
  ];
  const summary = summarizeReminderRecipients(groups);
  // u1 is on two deliverables but counted once.
  assert.equal(summary.totalRecipients, 2);
  assert.deepEqual([...summary.missingSlack.map((r) => r.name)], ['Bob Beta']);
  assert.deepEqual([...summary.unassignedDeliverables], ['Week 2 Survey']);
});

test('summarizeReminderRecipients handles an all-unassigned project', () => {
  const summary = summarizeReminderRecipients([
    { deliverableId: 'd1', title: 'Solo', unassigned: true, recipients: [] },
  ]);
  assert.equal(summary.totalRecipients, 0);
  assert.equal(summary.missingSlack.length, 0);
  assert.deepEqual(summary.unassignedDeliverables, ['Solo']);
});

const { resolveDeliverableReminderConfig, validateCustomOffsets } = loadRemindersConfig();
test('recipient-only override does not appear as inherited', () => {
  const resolved = resolveDeliverableReminderConfig({ enabled: null, offsetMinutes: [], explicitRecipientUserIds: ['u2'] },
    { enabled: true, offsetMinutes: [60], timezone: 'America/Chicago' });
  assert.equal(resolved.inherited, false);
});
test('reset override inherits project settings', () => {
  const resolved = resolveDeliverableReminderConfig({ enabled: null, offsetMinutes: [], explicitRecipientUserIds: [] },
    { enabled: true, offsetMinutes: [60], timezone: 'America/Chicago' });
  assert.equal(resolved.inherited, true);
  assert.deepEqual([...resolved.offsetMinutes], [60]);
});
test('custom offsets reject invalid and excessive values', () => {
  for (const offsets of [[], [0], [-1], [1.5], [20161], [1,2,3,4,5,6]]) {
    assert.equal(validateCustomOffsets(offsets).valid, false);
  }
  assert.equal(validateCustomOffsets([30,60,1440]).valid, true);
});

import { describe, expect, it } from 'vitest';
import { emptyState, execute, isoAt, materialize, validateState, formatTime, day, preparationTime } from '../src/domain';
import type { State } from '../src/types';
const state = (timeZone?: string): State => ({ ...emptyState(), timeZone, now: '2026-10-07T01:00:00Z', selectedProfileId: 'self', profiles: [{ id: 'self', displayName: 'Me', relationship: 'Self', canView: true, canManage: true }] });
describe('account timezones', () => {
  it('retains the legacy Singapore timestamp contract', () => expect(isoAt('2026-10-07', '09:00')).toBe('2026-10-07T09:00:00+08:00'));
  it('constructs Kuala Lumpur and UTC times', () => {
    expect(Date.parse(isoAt('2026-10-07', '09:00', 'Asia/Kuala_Lumpur'))).toBe(Date.parse('2026-10-07T01:00:00Z'));
    expect(Date.parse(isoAt('2026-10-07', '09:00', 'UTC'))).toBe(Date.parse('2026-10-07T09:00:00Z'));
  });
  it('rejects unknown zones and invalid dates', () => {
    expect(() => isoAt('2026-10-07', '09:00', 'Unknown/Zone')).toThrow();
    expect(() => isoAt('2026-02-30', '09:00', 'UTC')).toThrow();
  });
  it('rejects nonexistent and repeated New York times', () => {
    expect(() => isoAt('2026-03-08', '02:30', 'America/New_York')).toThrow(/does not exist/);
    expect(() => isoAt('2026-11-01', '01:30', 'America/New_York')).toThrow(/occurs twice/);
  });
  it('uses the account local day and wall time for daily occurrences', () => {
    let s = state('America/New_York');
    s = execute(s, { type: 'createReminder', input: { profileId: 'self', category: 'Other', title: 'Daily walk', scheduledAt: '2026-10-07T03:00:00Z', recurrence: 'Daily', instructions: '' } });
    expect(s.reminders[0].occurrenceDate).toBe('2026-10-06');
    expect(s.reminders.find(r => r.occurrenceDate === '2026-10-07')?.scheduledAt).toBe('2026-10-08T03:00:00.000Z');
    expect(formatTime(s.reminders[0].scheduledAt, s.timeZone)).toContain('11:00');
  });
  it('advances calendar days and preserves wall time across DST', () => {
    let s = state('America/New_York');
    s.now = '2026-03-07T05:10:00Z';
    s = execute(s, { type: 'createReminder', input: { profileId: 'self', category: 'Other', title: 'Daily walk', scheduledAt: '2026-03-07T14:00:00Z', recurrence: 'Daily', instructions: '' } });
    s.now = '2026-03-08T05:10:00Z';
    materialize(s);
    expect(s.reminders.find(r => r.occurrenceDate === '2026-03-08')?.scheduledAt).toBe('2026-03-08T13:00:00.000Z');
    expect(s.reminders.find(r => r.occurrenceDate === '2026-03-09')).toBeDefined();
  });
  it('validates explicit zones while accepting legacy snapshots', () => {
    expect(validateState(state())).toBe(true);
    expect(validateState(state('UTC'))).toBe(true);
    expect(validateState(state('Unknown/Zone'))).toBe(false);
  });
  it('uses UTC local dates and calendar tomorrow at a DST rollback boundary', () => {
    expect(day('2026-10-07T01:00:00Z', 'UTC')).toBe('2026-10-07');
    expect(day('2026-10-07T01:00:00Z', 'America/New_York')).toBe('2026-10-06');
    let s = state('America/New_York');
    s.now = '2026-11-01T03:30:00Z';
    s = execute(s, { type: 'createReminder', input: { profileId: 'self', category: 'Other', title: 'Morning walk', scheduledAt: '2026-11-01T13:00:00Z', recurrence: 'Daily', instructions: '' } });
    expect(s.reminders[0].occurrenceDate).toBe('2026-11-01');
    s.now = '2026-11-02T04:30:00Z';
    materialize(s);
    expect(s.reminders.find(r => r.occurrenceDate === '2026-11-02')?.scheduledAt).toBe('2026-11-02T13:00:00.000Z');
  });
  it('edits future occurrences using account wall time rather than UTC timestamp text', () => {
    let s = state('America/New_York');
    s = execute(s, { type: 'createReminder', input: { profileId: 'self', category: 'Other', title: 'Daily walk', scheduledAt: '2026-10-07T03:00:00Z', recurrence: 'Daily', instructions: '' } });
    const original = s.reminders[0];
    s = execute(s, { type: 'editReminder', id: original.id, scope: 'future', input: { profileId: 'self', category: 'Other', title: 'Daily walk', scheduledAt: '2026-10-07T02:00:00Z', recurrence: 'Daily', instructions: '' } });
    expect(s.reminders.find(r => r.occurrenceDate === '2026-10-07')?.scheduledAt).toBe('2026-10-08T02:00:00.000Z');
  });
  it('prepares on the preceding local calendar day', () => {
    const s = state('America/New_York');
    s.now = '2026-10-07T01:00:00Z';
    expect(preparationTime(s, '2026-10-08T14:00:00Z')).toBe('2026-10-07T23:00:00.000Z');
  });

  it.each(['2026-03-07', '2026-10-31'])('keeps unrelated writes available and warns about DST on %s', date => {
    let s = state('America/New_York');
    const time = date === '2026-03-07' ? '02:30' : '01:30';
    s.now = isoAt(date, '00:10', s.timeZone);
    s = execute(s, { type: 'createReminder', input: { profileId: 'self', category: 'Other', title: 'Daily stretch', scheduledAt: isoAt(date, time, s.timeZone), recurrence: 'Daily', instructions: '' } });
    const reminder = s.reminders[0];
    const invalidDate = date === '2026-03-07' ? '2026-03-08' : '2026-11-01';
    expect(s.schedulingWarnings).toHaveLength(1);
    expect(s.schedulingWarnings?.[0]).toContain(invalidDate);
    expect(s.schedulingWarnings?.[0]).toContain(reminder.seriesId);
    expect(s.reminders.some(r => r.occurrenceDate === invalidDate)).toBe(false);
    s = execute(s, { type: 'createReminder', input: { profileId: 'self', category: 'Other', title: 'Morning routine', scheduledAt: isoAt(date, '09:00', s.timeZone), recurrence: 'Daily', instructions: '' } });
    expect(s.reminders.some(r => r.title === 'Morning routine' && r.occurrenceDate === invalidDate)).toBe(true);
    s = execute(s, { type: 'setPreference', key: 'genericReminders', value: true });
    expect(s.preferences.genericReminders).toBe(true);
    expect(s.schedulingWarnings).toHaveLength(1);
    s = execute(s, { type: 'completeReminder', id: reminder.id, outcome: 'complete' });
    expect(s.reminders[0].outcome).toBe('complete');
    expect(s.schedulingWarnings).toHaveLength(1);
    expect(s.reminders.some(r => r.seriesId === reminder.seriesId && r.occurrenceDate === invalidDate)).toBe(false);
    expect(validateState(s)).toBe(true);
    s = execute(s, { type: 'deleteReminder', id: reminder.id });
    expect(s.schedulingWarnings).toEqual([]);
  });

});

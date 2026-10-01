import { describe, expect, it } from 'vitest';
import { eventOccursOn, reminderDaysUntil, type DayEvent } from '@chipperly/shared/schemas/event';
import { daysUntilLabel, eventsOnDate, remindersOnDate, upcomingEvents, withDismissed } from './events';

function event(overrides: Partial<DayEvent> = {}): DayEvent {
  return {
    id: 'e1',
    profile_id: 'p1',
    version: 0,
    client_updated_at: 1000,
    updated_by: 'u1',
    deleted_at: null,
    title: 'Doctor',
    emoji: null,
    photo_id: null,
    note: null,
    what_to_wear: null,
    story_id: null,
    date: '2026-10-07', // a Wednesday
    start_time: null,
    recurrence: null,
    recurrence_weekdays: null,
    remind_days_before: 0,
    remind_hour: 8,
    reminder_dismissed: [],
    ...overrides,
  };
}

describe('eventOccursOn', () => {
  it('dated: only on its own day', () => {
    const e = event();
    expect(eventOccursOn(e, '2026-10-07')).toBe(true);
    expect(eventOccursOn(e, '2026-10-06')).toBe(false);
    expect(eventOccursOn(e, '2026-10-14')).toBe(false);
  });

  it('never on a deleted event', () => {
    expect(eventOccursOn(event({ deleted_at: 5 }), '2026-10-07')).toBe(false);
  });

  it('daily: every day from the anchor, not before', () => {
    const e = event({ recurrence: 'daily' });
    expect(eventOccursOn(e, '2026-10-07')).toBe(true);
    expect(eventOccursOn(e, '2026-11-20')).toBe(true);
    expect(eventOccursOn(e, '2026-10-06')).toBe(false);
  });

  it('weekdays and weekends', () => {
    const wk = event({ recurrence: 'weekdays', date: '2026-10-01' });
    expect(eventOccursOn(wk, '2026-10-09')).toBe(true); // Friday
    expect(eventOccursOn(wk, '2026-10-10')).toBe(false); // Saturday
    const we = event({ recurrence: 'weekends', date: '2026-10-01' });
    expect(eventOccursOn(we, '2026-10-10')).toBe(true);
    expect(eventOccursOn(we, '2026-10-12')).toBe(false); // Monday
  });

  it('weekly: on the chosen weekdays, or the anchor weekday when none are set', () => {
    const tueThu = event({ recurrence: 'weekly', recurrence_weekdays: [2, 4], date: '2026-10-01' });
    expect(eventOccursOn(tueThu, '2026-10-13')).toBe(true); // Tuesday
    expect(eventOccursOn(tueThu, '2026-10-14')).toBe(false); // Wednesday
    const noDays = event({ recurrence: 'weekly', recurrence_weekdays: null }); // anchored on a Wednesday
    expect(eventOccursOn(noDays, '2026-10-14')).toBe(true);
    expect(eventOccursOn(noDays, '2026-10-15')).toBe(false);
  });

  it('yearly: same month and day in later years, not earlier ones', () => {
    const e = event({ recurrence: 'yearly', date: '2026-03-15' });
    expect(eventOccursOn(e, '2027-03-15')).toBe(true);
    expect(eventOccursOn(e, '2027-03-16')).toBe(false);
    expect(eventOccursOn(e, '2025-03-15')).toBe(false);
  });
});

describe('reminderDaysUntil', () => {
  const doctor = event({ date: '2026-10-07', remind_days_before: 3 });

  it('is due on each of the 3 days before, with the days left', () => {
    expect(reminderDaysUntil(doctor, '2026-10-04')).toBe(3);
    expect(reminderDaysUntil(doctor, '2026-10-05')).toBe(2);
    expect(reminderDaysUntil(doctor, '2026-10-06')).toBe(1);
  });

  it('is not due earlier, on the day, or after', () => {
    expect(reminderDaysUntil(doctor, '2026-10-03')).toBeNull();
    expect(reminderDaysUntil(doctor, '2026-10-07')).toBeNull();
    expect(reminderDaysUntil(doctor, '2026-10-08')).toBeNull();
  });

  it('is off at 0 days and for deleted events', () => {
    expect(reminderDaysUntil(event({ remind_days_before: 0 }), '2026-10-06')).toBeNull();
    expect(reminderDaysUntil({ ...doctor, deleted_at: 9 }, '2026-10-06')).toBeNull();
  });

  it('is gone for a day the caregiver dismissed, back the next day', () => {
    const e = { ...doctor, reminder_dismissed: ['2026-10-05'] };
    expect(reminderDaysUntil(e, '2026-10-05')).toBeNull();
    expect(reminderDaysUntil(e, '2026-10-06')).toBe(1);
  });

  it('finds the next occurrence of a recurring event', () => {
    const weekly = event({ recurrence: 'weekly', recurrence_weekdays: [3], date: '2026-10-07', remind_days_before: 2 });
    expect(reminderDaysUntil(weekly, '2026-10-12')).toBe(2); // Monday, Wednesday is 2 days out
    expect(reminderDaysUntil(weekly, '2026-10-10')).toBeNull(); // Saturday, Wednesday is 4 days out
  });

  it('reaches a yearly appointment across a year end', () => {
    const yearly = event({ recurrence: 'yearly', date: '2026-01-02', remind_days_before: 3 });
    expect(reminderDaysUntil(yearly, '2026-12-30')).toBe(3);
    expect(reminderDaysUntil(yearly, '2026-12-29')).toBeNull();
  });
});

describe('eventsOnDate / remindersOnDate', () => {
  const a = event({ id: 'a', title: 'Short day', recurrence: 'weekly', recurrence_weekdays: [3], date: '2026-10-07', start_time: '13:00' });
  const b = event({ id: 'b', title: 'Doctor', date: '2026-10-14', start_time: '09:00' });
  const c = event({ id: 'c', title: 'Crazy hair', date: '2026-10-14' });

  it('lists the day sorted: timed first by time, then untimed', () => {
    expect(eventsOnDate([c, a, b], '2026-10-14').map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('orders reminders nearest first', () => {
    const far = event({ id: 'far', title: 'Trip', date: '2026-10-16', remind_days_before: 5 });
    const near = event({ id: 'near', title: 'Dentist', date: '2026-10-13', remind_days_before: 5 });
    expect(remindersOnDate([far, near], '2026-10-12').map((r) => [r.event.id, r.days_until])).toEqual([
      ['near', 1],
      ['far', 4],
    ]);
  });
});

describe('daysUntilLabel / withDismissed', () => {
  it('words the distance', () => {
    expect(daysUntilLabel(1)).toBe('tomorrow');
    expect(daysUntilLabel(3)).toBe('in 3 days');
  });

  it('adds today once and drops dates older than 14 days', () => {
    expect(withDismissed(['2026-09-01', '2026-10-05'], '2026-10-05')).toEqual(['2026-10-05']);
    expect(withDismissed(['2026-10-01'], '2026-10-05')).toEqual(['2026-10-01', '2026-10-05']);
  });
});

describe('upcomingEvents', () => {
  it('lists each event once, at its next day, soonest first', () => {
    const weekly = event({ id: 'w', title: 'Horse lesson', date: '2026-09-02', recurrence: 'weekly', recurrence_weekdays: [6] });
    const dated = event({ id: 'd', title: 'Doctor', date: '2026-10-09' });
    const later = event({ id: 'l', title: 'Birthday', date: '2026-10-25' });
    const out = upcomingEvents([later, weekly, dated], '2026-10-05'); // a Monday
    expect(out.map((u) => [u.event.title, u.date, u.days_until])).toEqual([
      ['Doctor', '2026-10-09', 4],
      ['Horse lesson', '2026-10-10', 5],
      ['Birthday', '2026-10-25', 20],
    ]);
  });

  it('skips today, the past, what is beyond 30 days, and routine repeats', () => {
    const today = event({ id: 'a', date: '2026-10-05' });
    const past = event({ id: 'b', date: '2026-10-01' });
    const far = event({ id: 'c', date: '2026-12-01' });
    const daily = event({ id: 'd', date: '2026-09-01', recurrence: 'daily' });
    const weekdays = event({ id: 'e', date: '2026-09-01', recurrence: 'weekdays' });
    expect(upcomingEvents([today, past, far, daily, weekdays], '2026-10-05')).toEqual([]);
  });

  it('includes a yearly event and ignores a deleted one', () => {
    const yearly = event({ id: 'y', title: 'Birthday', date: '2020-10-12', recurrence: 'yearly' });
    const deleted = event({ id: 'x', date: '2026-10-08', deleted_at: 5 });
    expect(upcomingEvents([yearly, deleted], '2026-10-05').map((u) => u.event.title)).toEqual(['Birthday']);
  });
});

import { describe, expect, it } from 'vitest';
import { ActivitySchema, ActivityStepSchema } from '../schemas/activity.js';
import { ROUTINE_TEMPLATES, TEMPLATE_CATEGORIES } from './templates.js';

describe('ROUTINE_TEMPLATES', () => {
  it('has unique keys and names and a known category', () => {
    expect(new Set(ROUTINE_TEMPLATES.map((t) => t.key)).size).toBe(ROUTINE_TEMPLATES.length);
    expect(new Set(ROUTINE_TEMPLATES.map((t) => t.name)).size).toBe(ROUTINE_TEMPLATES.length);
    for (const t of ROUTINE_TEMPLATES) expect(TEMPLATE_CATEGORIES).toContain(t.category);
  });

  it('has 4 to 7 steps whose names and emoji fit the activity and step schemas', () => {
    const activityName = ActivitySchema.shape.name;
    const stepName = ActivityStepSchema.shape.name;
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.steps.length, t.key).toBeGreaterThanOrEqual(4);
      expect(t.steps.length, t.key).toBeLessThanOrEqual(7);
      expect(activityName.safeParse(t.name).success, t.key).toBe(true);
      expect(t.description.endsWith('.'), t.key).toBe(true);
      for (const s of t.steps) {
        expect(stepName.safeParse(s.name).success, `${t.key}: ${s.name}`).toBe(true);
        expect(s.emoji.length, `${t.key}: ${s.name}`).toBeGreaterThan(0);
        expect(s.duration_minutes ?? 1).toBeLessThanOrEqual(120);
      }
    }
  });
});

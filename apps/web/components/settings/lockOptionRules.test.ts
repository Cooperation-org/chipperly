import { describe, expect, it } from 'vitest';
import { needsBothConfirm, otherOf, setExclusive } from './lockOptionRules';

const chartOnly = { show_chipper_chart: true, attitude_prompt: false };
const feelingsOnly = { show_chipper_chart: false, attitude_prompt: true };
const both = { show_chipper_chart: true, attitude_prompt: true };
const neither = { show_chipper_chart: false, attitude_prompt: false };

describe('setExclusive', () => {
  it('turning feelings on turns the chart off', () => {
    expect(setExclusive(chartOnly, 'attitude_prompt', true)).toEqual(feelingsOnly);
  });
  it('turning the chart on turns feelings off', () => {
    expect(setExclusive(feelingsOnly, 'show_chipper_chart', true)).toEqual(chartOnly);
  });
  it('turning one off leaves the other alone', () => {
    expect(setExclusive(both, 'attitude_prompt', false)).toEqual(chartOnly);
    expect(setExclusive(chartOnly, 'show_chipper_chart', false)).toEqual(neither);
  });
  it('both:true keeps the other on', () => {
    expect(setExclusive(chartOnly, 'attitude_prompt', true, true)).toEqual(both);
  });
  it('keeps unrelated options', () => {
    const next = setExclusive({ ...chartOnly, expand_steps: true }, 'attitude_prompt', true);
    expect(next.expand_steps).toBe(true);
  });
});

describe('needsBothConfirm', () => {
  it('asks only when the other one is already on', () => {
    expect(needsBothConfirm(chartOnly, 'attitude_prompt')).toBe(true);
    expect(needsBothConfirm(feelingsOnly, 'attitude_prompt')).toBe(false);
    expect(needsBothConfirm(neither, 'attitude_prompt')).toBe(false);
  });
  it('does not ask for an existing both-on profile', () => {
    expect(needsBothConfirm(both, 'attitude_prompt')).toBe(false);
  });
});

describe('otherOf', () => {
  it('pairs the two keys', () => {
    expect(otherOf('attitude_prompt')).toBe('show_chipper_chart');
    expect(otherOf('show_chipper_chart')).toBe('attitude_prompt');
  });
});

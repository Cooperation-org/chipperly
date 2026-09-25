// Turns a damped spring into a CSS `linear()` easing, so an element can
// settle like a physical object with no JS running during the animation.
// Brand rule: no bounce. Keep the damping ratio high enough that the
// overshoot stays a few percent (the default is about 2%).
export function springEasing({ stiffness = 210, damping = 24, mass = 1 } = {}) {
  const dt = 1 / 120;
  let x = 0;
  let v = 0;
  const samples: number[] = [0];
  for (let t = 0; t < 3; t += dt) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    samples.push(x);
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  samples.push(1);
  // Keep every 4th point: plenty for a smooth curve, short enough for CSS.
  const points = samples.filter((_, i) => i % 4 === 0 || i === samples.length - 1);
  return { easing: `linear(${points.map((p) => +p.toFixed(4)).join(', ')})`, duration: Math.round(samples.length * dt * 1000) };
}

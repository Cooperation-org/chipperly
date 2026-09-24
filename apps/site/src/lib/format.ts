export const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';

// ~230 words a minute, never under one.
export const readingMinutes = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).length / 230));

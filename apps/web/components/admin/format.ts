/** Cents to "$1,500.00" in the row's currency. */
export function money(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export function day(ms: number | null): string {
  return ms === null ? '' : new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function when(ms: number): string {
  return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const NOT_TEAM = 'This page is for Chipperly’s own team.';

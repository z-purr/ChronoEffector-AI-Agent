export function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Up to 4 decimals, trailing zeros stripped */
export function formatAmount(val: number): string {
  if (val === 0) return "0";
  if (val > 0 && val < 0.001) return "< 0.001";
  return parseFloat(val.toFixed(4)).toString();
}

export function formatWeiValue(wei: string): string {
  return formatAmount(parseFloat(wei) / 1e18);
}

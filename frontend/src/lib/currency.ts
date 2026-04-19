function formatAmount(value: number) {
  const fixed = value.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed;
}

export function formatEur(value: number) {
  return `${formatAmount(value)} EUR`;
}

export function formatDiscountValue(
  value: number,
  type: "amount" | "percent"
) {
  if (type === "percent") {
    return `-${formatAmount(value)}%`;
  }

  return `-${formatEur(value)}`;
}

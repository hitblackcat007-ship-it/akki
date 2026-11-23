// Akki offline: small helpers for showing numbers, dates and names.

export function money(amount, region = "india") {
  const value = Number(amount) || 0;
  if (region === "qatar") {
    return `QAR ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-11-15" -> "15/11/2026". Anything else is shown as it is. */
export function formatDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(text || "");
}

export function monthKey(text) {
  return String(text || "").slice(0, 7);
}

export function monthLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function initials(name) {
  return String(name || "").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "•";
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function todayText() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "red" for minus, "green" for plus, "grey" for zero. */
export function tone(amount) {
  const value = Number(amount) || 0;
  return value < 0 ? "neg" : value > 0 ? "pos" : "zero";
}

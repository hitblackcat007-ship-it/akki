// Akki offline: icons drawn as simple SVG lines. The gold colour comes from the gradient in index.html.
const PATHS = {
  Income: "M3 7h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7z M3 7l11-3v3 M17 14h1",
  Expense: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  Friend: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 4.5a3.2 3.2 0 0 1 0 6 M18.5 14.5c1.8.8 3 2.7 3 5.5",
  Bank: "M3 9l9-5 9 5 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18",
  Loan: "M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M3 16l3-1.5c1-.5 2-.5 3 0l3 1.5h2.5c.9 0 1.5.7 1.5 1.5S15.4 19 14.5 19H11 M12 19l5.5-2c1-.4 2 .1 2.4 1L21 20l-8 2L3 20",
  Custom: "M12 3l2.6 5.6 6 .7-4.4 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.4 9.3l6-.7z",
  add: "M12 5v14 M5 12h14",
  plan: "M4 4h12a2 2 0 0 1 2 2v3 M4 4v16h14v-4 M8 4v16 M16 12l5-5 1.5 1.5-5 5-2 .5z",
  settings: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 5v4 M6 15v4",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-4.3-4.3",
  pencil: "M4 20l1-4 11-11 3 3L8 19z M14 7l3 3",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
  share: "M12 15V4 M8 8l4-4 4 4 M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plusCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 8v8 M8 12h8",
  close: "M6 6l12 12 M18 6L6 18",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  lock: "M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3",
  download: "M12 4v11 M8 11l4 4 4-4 M4 20h16",
  upload: "M12 15V4 M8 8l4-4 4 4 M4 20h16",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  chevron: "M9 6l6 6-6 6",
};

export const ICON_NAMES = Object.keys(PATHS);

/** Returns the SVG text for an icon. Unknown names give the "Custom" star, so a screen never breaks. */
export function icon(name, size = 22, extraClass = "") {
  const d = PATHS[name] || PATHS.Custom;
  return `<svg class="ic ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function sectionIcon(name) {
  return PATHS[name] ? icon(name) : icon("Custom");
}

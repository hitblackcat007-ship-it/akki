// Akki offline: data model and all changes to it. No screen code here, so it can be tested in Node.
// Every function returns NEW data and never changes what it was given.
import { calculateLedger, resolvePaymentSourceCategory } from "./ledger.js";

export const DEFAULT_SECTIONS = ["Income", "Expense", "Friend", "Bank", "Loan"];
export const REGIONS = ["india", "qatar"];

export function emptySnapshot() {
  return {
    sections: [...DEFAULT_SECTIONS],
    items: {},
    transactionRecords: [],
    transactionAudit: [],
    savedPlanning: {},
    loanAmounts: {},
    friendPhones: {},
    profilePhoto: "",
    entityPhotos: {},
    bankPhoto: "",
  };
}

export function createInitialState() {
  return { version: 1, activeRegion: "india", regions: { india: emptySnapshot(), qatar: emptySnapshot() }, profileName: "" };
}

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

/** Checks data from an Akki backup and fills the missing parts. Throws an Error with a readable message. */
export function normalizeSnapshot(data) {
  if (!isObject(data)) throw new Error("This is not a valid Akki backup file.");
  if (!Array.isArray(data.sections) || !data.sections.every((name) => typeof name === "string") || !isObject(data.items) || !Array.isArray(data.transactionRecords)) {
    throw new Error("The backup file is incomplete or invalid.");
  }
  const items = {};
  for (const [section, list] of Object.entries(data.items)) {
    if (Array.isArray(list)) items[section] = list.filter((name) => typeof name === "string");
  }
  return {
    sections: data.sections.filter((name) => name !== "Cash"),
    items,
    transactionRecords: data.transactionRecords.filter(isObject),
    transactionAudit: Array.isArray(data.transactionAudit) ? data.transactionAudit : [],
    savedPlanning: isObject(data.savedPlanning) ? data.savedPlanning : {},
    loanAmounts: isObject(data.loanAmounts) ? data.loanAmounts : {},
    friendPhones: isObject(data.friendPhones) ? data.friendPhones : {},
    profilePhoto: typeof data.profilePhoto === "string" ? data.profilePhoto : "",
    entityPhotos: isObject(data.entityPhotos) ? data.entityPhotos : {},
    bankPhoto: typeof data.bankPhoto === "string" ? data.bankPhoto : "",
  };
}

/** Reads the text of a backup file made by the online Akki app (Settings > Backup) or by this app. */
export function parseBackupText(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("This file is not a valid backup."); }
  if (!isObject(parsed) || parsed.app !== "Akki" || parsed.formatVersion !== 1 || !isObject(parsed.data)) {
    throw new Error("This is not a valid Akki backup file.");
  }
  return { region: REGIONS.includes(parsed.region) ? parsed.region : "india", snapshot: normalizeSnapshot(parsed.data) };
}

export function makeBackup(state, region = state.activeRegion) {
  return { app: "Akki", formatVersion: 1, createdAt: new Date().toISOString(), region, data: state.regions[region] };
}

export function getSnapshot(state, region = state.activeRegion) {
  return state.regions[region] || emptySnapshot();
}

export function setSnapshot(state, snapshot, region = state.activeRegion) {
  return { ...state, regions: { ...state.regions, [region]: snapshot } };
}

export function switchRegion(state, region) {
  if (!REGIONS.includes(region)) return state;
  return { ...state, activeRegion: region };
}

// ---------- lists (sections and items) ----------

const cleanName = (value) => String(value || "").trim().replace(/\s+/g, " ");
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

export function addSection(snapshot, name) {
  const clean = cleanName(name);
  if (!clean) throw new Error("Type a name.");
  if (["cash", "custom"].includes(clean.toLowerCase())) throw new Error(`"${clean}" is already available in transactions.`);
  if (snapshot.sections.some((section) => sameName(section, clean))) throw new Error(`"${clean}" already exists.`);
  return { ...snapshot, sections: [...snapshot.sections, clean] };
}

export function deleteSection(snapshot, name) {
  const items = { ...snapshot.items };
  delete items[name];
  return {
    ...snapshot,
    sections: snapshot.sections.filter((section) => section !== name),
    items,
    transactionRecords: snapshot.transactionRecords.filter((entry) => entry.category !== name),
  };
}

export function addItem(snapshot, section, name) {
  const clean = cleanName(name);
  if (!clean) throw new Error("Type a name.");
  const list = snapshot.items[section] || [];
  if (list.some((item) => sameName(item, clean))) throw new Error(`"${clean}" already exists in ${section}.`);
  return { ...snapshot, items: { ...snapshot.items, [section]: [...list, clean] } };
}

export function renameItem(snapshot, section, oldName, newName) {
  const clean = cleanName(newName);
  if (!clean) throw new Error("Type a name.");
  const list = snapshot.items[section] || [];
  if (clean !== oldName && list.some((item) => sameName(item, clean))) throw new Error(`"${clean}" already exists in ${section}.`);
  const sourceSection = (entry) => (typeof entry.sourceCategory === "string" && entry.sourceCategory ? entry.sourceCategory : resolvePaymentSourceCategory(String(entry.source || ""), snapshot.items));
  return {
    ...snapshot,
    items: { ...snapshot.items, [section]: list.map((item) => (item === oldName ? clean : item)) },
    transactionRecords: snapshot.transactionRecords.map((entry) => {
      let next = entry;
      if (entry.category === section && entry.item === oldName) next = { ...next, item: clean };
      if (entry.source === oldName && sourceSection(entry) === section) next = { ...next, source: clean };
      return next;
    }),
    loanAmounts: section === "Loan" && oldName in snapshot.loanAmounts
      ? Object.fromEntries(Object.entries(snapshot.loanAmounts).map(([key, value]) => [key === oldName ? clean : key, value]))
      : snapshot.loanAmounts,
  };
}

/** Deletes one item. Only that item's own transactions are removed.
 *  Transactions that were paid FROM it stay, with their source moved to Cash. */
export function deleteItem(snapshot, section, name) {
  const sourceSection = (entry) => (typeof entry.sourceCategory === "string" && entry.sourceCategory ? entry.sourceCategory : resolvePaymentSourceCategory(String(entry.source || ""), snapshot.items));
  const transactionRecords = snapshot.transactionRecords
    .filter((entry) => !(entry.category === section && entry.item === name))
    .map((entry) => (entry.source === name && sourceSection(entry) === section ? { ...entry, source: "Cash", sourceCategory: "Cash" } : entry));
  const loanAmounts = { ...snapshot.loanAmounts };
  if (section === "Loan") delete loanAmounts[name];
  return {
    ...snapshot,
    items: { ...snapshot.items, [section]: (snapshot.items[section] || []).filter((item) => item !== name) },
    transactionRecords,
    loanAmounts,
  };
}

export function setLoanAmount(snapshot, name, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new Error("Type a valid loan amount.");
  return { ...snapshot, loanAmounts: { ...snapshot.loanAmounts, [name]: value } };
}

// ---------- transactions ----------

let idCounter = 0;
const newId = () => `tx_${Date.now().toString(36)}_${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const todayText = () => new Date().toISOString().slice(0, 10);

function audit(snapshot, action, entry) {
  const record = { id: newId(), action, at: new Date().toISOString(), transactionId: entry.id, category: entry.category, item: entry.item, amount: entry.amount, date: entry.date, note: entry.note || "" };
  return [record, ...snapshot.transactionAudit].slice(0, 500);
}

/** Builds a clean transaction from form values. Throws an Error with a readable message. */
export function buildTransaction(snapshot, input, existing) {
  const category = cleanName(input.category);
  const item = cleanName(input.item);
  const source = cleanName(input.source);
  if (!category) throw new Error("Choose a category.");
  if (!item) throw new Error(category === "Custom" ? "Type a name." : "Choose an item.");
  if (!source) throw new Error("Choose a payment source.");
  const date = String(input.date || existing?.date || todayText());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date.");
  const record = {
    ...(existing || {}),
    id: existing?.id || newId(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    direction: "received",
    category, item, source,
    sourceCategory: input.sourceCategory || resolvePaymentSourceCategory(source, snapshot.items),
    date,
    dueDate: String(input.dueDate || ""),
    note: String(input.note || "").trim(),
  };
  if (input.receiptId) record.receiptId = input.receiptId;
  if (category === "Loan") {
    const principal = Number(input.principalAmount);
    const interest = Number(input.interestAmount || 0);
    if (!Number.isFinite(principal) || principal <= 0) throw new Error("Type the principal amount.");
    if (!Number.isFinite(interest) || interest < 0) throw new Error("Type a valid interest amount.");
    Object.assign(record, { amount: principal, principalAmount: principal, interestAmount: interest, totalAmount: principal + interest });
  } else {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Type an amount above zero.");
    Object.assign(record, { amount, principalAmount: 0, interestAmount: 0, totalAmount: amount });
  }
  return record;
}

export function addTransaction(snapshot, input) {
  const record = buildTransaction(snapshot, input);
  return { snapshot: { ...snapshot, transactionRecords: [...snapshot.transactionRecords, record], transactionAudit: audit(snapshot, "Added", record) }, record };
}

export function updateTransaction(snapshot, id, input) {
  const existing = snapshot.transactionRecords.find((entry) => entry.id === id);
  if (!existing) throw new Error("This transaction no longer exists.");
  const record = buildTransaction(snapshot, input, existing);
  return {
    snapshot: { ...snapshot, transactionRecords: snapshot.transactionRecords.map((entry) => (entry.id === id ? record : entry)), transactionAudit: audit(snapshot, "Edited", record) },
    record,
  };
}

export function deleteTransaction(snapshot, id) {
  const existing = snapshot.transactionRecords.find((entry) => entry.id === id);
  if (!existing) return snapshot;
  return { ...snapshot, transactionRecords: snapshot.transactionRecords.filter((entry) => entry.id !== id), transactionAudit: audit(snapshot, "Deleted", existing) };
}

// ---------- numbers shown on screen ----------

export function ledgerFor(snapshot, category, item) {
  return calculateLedger(category, item, snapshot.transactionRecords, snapshot.items, Number(snapshot.loanAmounts[item]) || 0);
}

/** What a list shows for an item: Expense is always a minus amount. */
export function shownBalance(snapshot, section, item) {
  const balance = ledgerFor(snapshot, section, item).balance || 0;
  return section === "Expense" ? -Math.abs(balance) : balance;
}

export function sectionTotals(snapshot, section) {
  const balances = (snapshot.items[section] || []).map((item) => shownBalance(snapshot, section, item));
  return {
    total: balances.reduce((sum, value) => sum + value, 0),
    positive: balances.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
    negative: balances.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0),
    count: balances.length,
  };
}

export function paymentSourceOptions(snapshot) {
  return [...new Set(["Cash", ...(snapshot.items.Bank || []), ...(snapshot.items.Friend || []), ...(snapshot.items.Income || [])])];
}

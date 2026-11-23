// Akki offline: everything the screens DO, as plain functions.
// reduce(app, action) -> { app, effects }.  app = { state, ui }.
// The screen code only turns taps and typing into actions, so all of this can be tested in Node.
import {
  createInitialState, getSnapshot, setSnapshot, switchRegion, parseBackupText, makeBackup,
  addItem, renameItem, deleteItem, addSection, deleteSection, setLoanAmount,
  addTransaction, updateTransaction, deleteTransaction, ledgerFor, shownBalance, paymentSourceOptions,
} from "./state.js";
import { monthKey } from "./format.js";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const PLAN_ROWS = 15;
const UNDO_MS = 10000;

export function createApp(state = createInitialState()) {
  const firstSection = getSnapshot(state).sections[0] || "";
  return {
    state,
    ui: {
      page: "section",          // section | overview | planning
      section: firstSection,
      dialog: null,
      filters: { month: "", item: "" },
      undo: null,               // { label, state, id }
      toast: "",
      locked: false,
      planning: { month: MONTHS[new Date().getMonth()], editing: false },
    },
  };
}

const noEffects = [];
const done = (app, effects = noEffects) => ({ app, effects });
const withUi = (app, patch) => ({ ...app, ui: { ...app.ui, ...patch } });
const snap = (app) => getSnapshot(app.state);
const setSnap = (app, snapshot) => ({ ...app, state: setSnapshot(app.state, snapshot) });
const message = (error) => (error instanceof Error ? error.message : "Something went wrong.");

/** Keeps the open tab valid after tabs change (for example a deleted tab). */
export function fixSection(app) {
  const sections = snap(app).sections;
  if (app.ui.page === "section" && !sections.includes(app.ui.section)) return withUi(app, { section: sections[0] || "" });
  return app;
}

/** `before` is the app as it was before the delete; `after` is the app with the delete done. */
function withUndo(before, after, label) {
  const id = (before.ui.undo?.id || 0) + 1;
  return withUi(after, { undo: { label, state: before.state, id } });
}

export function blankDraft(section) {
  const preset = ["Income", "Expense", "Friend", "Bank", "Loan"].includes(section) ? section : "";
  return { category: preset, item: "", source: "", sourceMode: "list", amount: "", principalAmount: "", interestAmount: "", date: "", dueDate: "", note: "", receiptDataUrl: "", hasReceipt: false };
}

function draftFromRecord(record, snapshot) {
  const sourceMode = paymentSourceOptions(snapshot).includes(record.source) ? "list" : "custom";
  return {
    category: record.category, item: record.item, source: record.source, sourceMode,
    amount: record.category === "Loan" ? "" : String(record.amount ?? ""),
    principalAmount: record.category === "Loan" ? String(record.principalAmount ?? record.amount ?? "") : "",
    interestAmount: record.category === "Loan" ? String(record.interestAmount ?? "") : "",
    date: record.date || "", dueDate: record.dueDate || "", note: record.note || "",
    receiptDataUrl: "", hasReceipt: Boolean(record.receiptId),
  };
}

export function categoryOptions(snapshot) {
  return [...snapshot.sections.filter((name) => name !== "Cash" && name !== "Custom"), "Cash", "Custom"];
}

export function itemOptions(snapshot, category) {
  if (category === "Cash") return ["Cash"];
  if (category === "Custom") return [];
  return snapshot.items[category] || [];
}

function formInput(draft) {
  return {
    category: draft.category,
    item: draft.category === "Cash" ? "Cash" : draft.item,
    source: draft.source,
    amount: draft.amount,
    principalAmount: draft.principalAmount,
    interestAmount: draft.interestAmount,
    date: draft.date || undefined,
    dueDate: draft.dueDate,
    note: draft.note,
  };
}

// ---------- planning ----------

export function emptyPlanRows() {
  return Array.from({ length: PLAN_ROWS }, () => ({ category: "", amount: "" }));
}

export function planFor(snapshot, month) {
  const saved = snapshot.savedPlanning[month];
  return saved
    ? { planningAmount: String(saved.planningAmount ?? ""), rows: Array.from({ length: PLAN_ROWS }, (_, i) => ({ category: saved.rows?.[i]?.category || "", amount: String(saved.rows?.[i]?.amount ?? "") })) }
    : { planningAmount: "", rows: emptyPlanRows() };
}

export function planCategoryForItem(snapshot, name) {
  return snapshot.sections.find((section) => (snapshot.items[section] || []).includes(name)) || "";
}

/** The numbers shown for one planning row. */
export function planRowResult(snapshot, row) {
  const category = planCategoryForItem(snapshot, row.category);
  const current = row.category ? ledgerFor(snapshot, category, row.category).balance || 0 : 0;
  const planned = Number(row.amount) || 0;
  const remaining = category === "Bank" || category === "Loan" ? current + planned
    : category === "Friend" ? Math.sign(current) * Math.max(0, Math.abs(current) - planned)
    : current - planned;
  return { category, current, planned, remaining };
}

export function planTotals(plan) {
  const allocated = plan.rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return { allocated, remaining: (Number(plan.planningAmount) || 0) - allocated };
}

// ---------- the reducer ----------

export function reduce(app, action) {
  switch (action.type) {
    case "selectTab":
      return done(withUi(app, { page: "section", section: action.section, dialog: null }));
    case "openOverview":
      return done(withUi(app, { page: "overview", dialog: null }));
    case "openPlanning":
      return done(withUi(app, { page: "planning", dialog: null, planning: { ...app.ui.planning, editing: false } }));
    case "setRegion": {
      const next = fixSection({ ...app, state: switchRegion(app.state, action.region) });
      return done(withUi(next, { dialog: null, undo: null, filters: { month: "", item: "" } }));
    }
    case "closeDialog":
      return done(withUi(app, { dialog: null }));
    case "toast":
      return done(withUi(app, { toast: action.text }));
    case "setFilter":
      return done(withUi(app, { filters: { ...app.ui.filters, [action.name]: action.value } }));
    case "setProfileName":
      return done({ ...app, state: { ...app.state, profileName: String(action.name || "").trim() } });
    case "setProfilePhoto":
      return done(setSnap(app, { ...snap(app), profilePhoto: action.dataUrl || "" }));
    case "setEntityPhoto": {
      const key = `${action.section}:${action.item}`;
      const photos = { ...snap(app).entityPhotos };
      if (action.dataUrl) photos[key] = action.dataUrl; else delete photos[key];
      return done(setSnap(app, { ...snap(app), entityPhotos: photos }));
    }

    // ----- tabs and items -----
    case "openAddSection":
      return done(withUi(app, { dialog: { type: "addSection", error: "" } }));
    case "addSection":
      try {
        const next = fixSection(setSnap(app, addSection(snap(app), action.name)));
        const added = snap(next).sections.at(-1);
        return done(withUi(next, { dialog: null, page: "section", section: added }));
      } catch (error) { return done(withUi(app, { dialog: { type: "addSection", error: message(error) } })); }
    case "confirmDeleteSection":
      return done(withUi(app, { dialog: { type: "confirm", text: `Delete the "${action.section}" tab with all its items and transactions?`, yes: { type: "deleteSection", section: action.section } } }));
    case "deleteSection": {
      const next = fixSection(withUndo(app, setSnap(app, deleteSection(snap(app), action.section)), `${action.section} deleted`));
      return done(withUi(next, { dialog: null }));
    }
    case "openAddItem":
      return done(withUi(app, { dialog: { type: "addItem", section: action.section, error: "" } }));
    case "addItem":
      try { return done(withUi(setSnap(app, addItem(snap(app), action.section, action.name)), { dialog: null })); }
      catch (error) { return done(withUi(app, { dialog: { type: "addItem", section: action.section, error: message(error) } })); }
    case "openItem":
      return done(withUi(app, { dialog: { type: "item", section: action.section, item: action.item, error: "", renaming: false } }));
    case "startRename":
      return done(withUi(app, { dialog: { ...app.ui.dialog, renaming: true, error: "" } }));
    case "renameItem": {
      const { section, item } = app.ui.dialog;
      try {
        const next = setSnap(app, renameItem(snap(app), section, item, action.name));
        const photos = { ...snap(next).entityPhotos };
        const newName = String(action.name || "").trim().replace(/\s+/g, " ");
        if (photos[`${section}:${item}`] && newName !== item) { photos[`${section}:${newName}`] = photos[`${section}:${item}`]; delete photos[`${section}:${item}`]; }
        return done(withUi(setSnap(next, { ...snap(next), entityPhotos: photos }), { dialog: { type: "item", section, item: newName, error: "", renaming: false } }));
      } catch (error) { return done(withUi(app, { dialog: { ...app.ui.dialog, error: message(error) } })); }
    }
    case "confirmDeleteItem":
      return done(withUi(app, { dialog: { type: "confirm", text: `Delete "${action.item}"? Its own transactions will be deleted too. Transactions that were paid from it stay, with the source changed to Cash.`, yes: { type: "deleteItem", section: action.section, item: action.item } } }));
    case "deleteItem": {
      const photos = { ...snap(app).entityPhotos };
      delete photos[`${action.section}:${action.item}`];
      const next = withUndo(app, setSnap(app, { ...deleteItem(snap(app), action.section, action.item), entityPhotos: photos }), `${action.item} deleted`);
      return done(withUi(next, { dialog: null }));
    }
    case "setLoanAmount":
      try { return done(withUi(setSnap(app, setLoanAmount(snap(app), action.item, action.amount)), { dialog: { ...app.ui.dialog, error: "" } })); }
      catch (error) { return done(withUi(app, { dialog: { ...app.ui.dialog, error: message(error) } })); }

    // ----- transactions -----
    case "openTxAdd":
      return done(withUi(app, { dialog: { type: "tx", mode: "add", draft: { ...blankDraft(action.section || app.ui.section), ...(action.preset || {}) }, error: "" } }));
    case "openTxEdit": {
      const record = snap(app).transactionRecords.find((entry) => entry.id === action.id);
      if (!record) return done(withUi(app, { toast: "This transaction no longer exists." }));
      return done(withUi(app, { dialog: { type: "tx", mode: "edit", id: action.id, draft: draftFromRecord(record, snap(app)), error: "" } }));
    }
    case "txDraft": {
      // the screen sends everything typed so far; changing the category or source mode resets what depends on it
      let draft = { ...app.ui.dialog.draft, ...action.values };
      if (action.values.category !== undefined && action.values.category !== app.ui.dialog.draft.category) draft = { ...draft, item: action.values.category === "Cash" ? "Cash" : "" };
      return done(withUi(app, { dialog: { ...app.ui.dialog, draft, error: "" } }));
    }
    case "txSubmit": {
      const dialog = app.ui.dialog;
      const draft = { ...dialog.draft, ...action.values };
      const effects = [];
      try {
        let input = formInput(draft);
        let receiptId = "";
        if (draft.receiptDataUrl) {
          receiptId = `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          input = { ...input, receiptId };
        } else if (dialog.mode === "edit") {
          const old = snap(app).transactionRecords.find((entry) => entry.id === dialog.id);
          if (old?.receiptId) input = { ...input, receiptId: old.receiptId };
        }
        const result = dialog.mode === "edit"
          ? updateTransaction(snap(app), dialog.id, input)
          : addTransaction(snap(app), input);
        if (receiptId) effects.push({ type: "saveReceipt", id: receiptId, dataUrl: draft.receiptDataUrl });
        return done(withUi(setSnap(app, result.snapshot), { dialog: null }), effects);
      } catch (error) {
        return done(withUi(app, { dialog: { ...dialog, draft, error: message(error) } }));
      }
    }
    case "confirmDeleteTx":
      return done(withUi(app, { dialog: { type: "confirm", text: "Delete this transaction?", yes: { type: "deleteTx", id: action.id } } }));
    case "deleteTx": {
      const next = withUndo(app, setSnap(app, deleteTransaction(snap(app), action.id)), "Transaction deleted");
      return done(withUi(next, { dialog: null }));
    }
    case "undo": {
      if (!app.ui.undo) return done(app);
      return done(withUi({ ...app, state: app.ui.undo.state }, { undo: null, dialog: null }));
    }
    case "clearUndo":
      return done(app.ui.undo && app.ui.undo.id === action.id ? withUi(app, { undo: null }) : app);

    // ----- planning -----
    case "planMonth":
      return done(withUi(app, { planning: { month: action.month, editing: false } }));
    case "planEdit":
      return done(withUi(app, { planning: { ...app.ui.planning, editing: true } }));
    case "planSave": {
      const month = app.ui.planning.month;
      const rows = action.rows.map((row) => ({ category: String(row.category || ""), amount: String(row.amount ?? "") }));
      const saved = { ...snap(app).savedPlanning, [month]: { planningAmount: String(action.planningAmount ?? ""), rows } };
      return done(withUi(setSnap(app, { ...snap(app), savedPlanning: saved }), { planning: { month, editing: false } }));
    }
    case "confirmPlanClear":
      return done(withUi(app, { dialog: { type: "confirm", text: `Clear all the ${app.ui.planning.month} planning data?`, yes: { type: "planClear" } } }));
    case "planClear": {
      const saved = { ...snap(app).savedPlanning };
      delete saved[app.ui.planning.month];
      return done(withUi(setSnap(app, { ...snap(app), savedPlanning: saved }), { dialog: null, planning: { month: app.ui.planning.month, editing: false } }));
    }

    // ----- settings and backup -----
    case "openSettings":
      return done(withUi(app, { dialog: { type: "settings", message: "" } }));
    case "exportBackup":
      return done(app, [{ type: "download", name: `akki-backup-${new Date().toISOString().slice(0, 10)}.json`, text: JSON.stringify(makeBackup(app.state), null, 2) }]);
    case "importBackup": {
      try {
        const { region, snapshot } = parseBackupText(action.text);
        return done(withUi(app, { dialog: { type: "confirm", text: `Restore this backup into ${region === "qatar" ? "Qatar" : "India"}? The current ${region === "qatar" ? "Qatar" : "India"} data will be replaced.`, yes: { type: "applyImport", region, snapshot } } }));
      } catch (error) { return done(withUi(app, { dialog: { type: "settings", message: message(error) } })); }
    }
    case "applyImport": {
      const next = fixSection({ ...app, state: { ...setSnapshot(app.state, action.snapshot, action.region), activeRegion: action.region } });
      return done(withUi(next, { dialog: { type: "settings", message: "Backup restored." }, undo: null }));
    }
    default:
      return done(app);
  }
}

// ---------- what the pages need to show ----------

export function filteredTransactions(snapshot, filters) {
  return [...snapshot.transactionRecords]
    .sort((a, b) => {
      const byDate = new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime();
      return byDate || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    })
    .filter((entry) => (!filters.month || monthKey(entry.date || entry.createdAt) === filters.month) && (!filters.item || entry.item === filters.item));
}

export function filterOptions(snapshot) {
  const months = [...new Set(snapshot.transactionRecords.map((entry) => monthKey(entry.date || entry.createdAt)).filter((key) => /^\d{4}-\d{2}$/.test(key)))].sort().reverse();
  const itemNames = [...new Set(snapshot.transactionRecords.map((entry) => entry.item).filter(Boolean))].sort();
  return { months, items: itemNames };
}

/** Rows for the Overview page: every tab with the amount shown for each item. */
export function overviewGroups(snapshot) {
  return snapshot.sections
    .filter((section) => (snapshot.items[section] || []).length > 0)
    .map((section) => {
      const rows = (snapshot.items[section] || [])
        .map((item) => ({ item, value: shownBalance(snapshot, section, item) }))
        // finished loans (nothing left to pay) are hidden, like in the online app
        .filter((row) => !(section === "Loan" && row.value === 0));
      return { section, rows, total: rows.reduce((sum, row) => sum + row.value, 0) };
    })
    .filter((group) => group.rows.length > 0);
}

export function overviewTotals(snapshot) {
  const rows = overviewGroups(snapshot).flatMap((group) => group.rows);
  return {
    net: rows.reduce((sum, row) => sum + row.value, 0),
    inTotal: rows.filter((row) => row.value > 0).reduce((sum, row) => sum + row.value, 0),
    outTotal: rows.filter((row) => row.value < 0).reduce((sum, row) => sum + Math.abs(row.value), 0),
    count: snapshot.transactionRecords.length,
  };
}

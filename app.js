const STORAGE_KEY = "saldo-expenses-v1";
const APP_VERSION = "1.0.6b";
const palette = ["#177b55", "#ed9c54", "#8b7ee7", "#5c9ee8", "#d95f59", "#51a68b", "#c77bcb", "#a1a85d"];
const icons = ["⌂", "▣", "◇", "✦", "♧", "●", "◆", "◉", "🚗", "🚌", "🚲", "🏥", "💡", "🎁", "🛒", "🐾"];
const defaultCategories = [
  { id: "food", name: "Alimentación", color: "#177b55", icon: "▣" },
  { id: "home", name: "Hogar", color: "#ed9c54", icon: "⌂" },
  { id: "transport", name: "Transporte", color: "#8b7ee7", icon: "🚗" },
  { id: "leisure", name: "Ocio", color: "#5c9ee8", icon: "✦" },
  { id: "health", name: "Salud", color: "#d95f59", icon: "🏥" },
  { id: "services", name: "Servicios", color: "#5c9ee8", icon: "💡" },
  { id: "gifts", name: "Regalos", color: "#c77bcb", icon: "🎁" }
];
const defaultState = {
  backupVersion: 2,
  income: 0,
  currentCycleIncome: null,
  cutoffDay: 1,
  onboardingComplete: false,
  pendingIncome: null,
  incomeHistory: [],
  recurringConfirmations: {},
  recurringHistory: [],
  expenseHistory: [],
  incomeNotice: "",
  darkMode: false,
  testCycleOverride: null,
  dateMode: "system",
  debugDate: null,
  lastCycleStart: null,
  savingsBalance: 0,
  savingsHistory: [],
  savingsMovements: [],
  collectiveEvents: [],
  collectiveDraft: { name: "", people: [], expenses: [] },
  categories: structuredClone(defaultCategories),
  expenses: []
};

let state = loadState();
let selectedColor = palette[0];
let selectedIcon = icons[0];
let categoryToEdit = null;
let expenseToDelete = null;
let recurringToEdit = null;
let recurringToDelete = null;
let expenseToEdit = null;
let availableUpdate = null;
let updateBackupExported = false;
let welcomeImportFile = null;
const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value || 0);
const dateFormat = value => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)).replace(".", "");
function effectiveDate() {
  if (state.dateMode === "debug" && state.debugDate) return new Date(`${state.debugDate}T12:00:00`);
  return new Date();
}
function getCycleEnd() {
  const end = new Date(getCycleStart());
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  return end;
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
const todayISO = () => {
  const date = effectiveDate();
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, "0"), day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    const expenses = (saved.expenses || [])
      .map(item => item.recurring && !item.frequency ? { ...item, frequency: "daily", weekday: null } : item)
      .map(item => item.recurring && item.frequency === "monthly" && !item.monthlyDay && typeof item.recurringDate === "string"
        ? { ...item, monthlyDay: Number(item.recurringDate.slice(8, 10)) }
        : item);
    const categories = [...(saved.categories || [])];
    defaultCategories.forEach(category => { if (!categories.some(item => item.id === category.id)) categories.push({ ...category }); });
    return { ...defaultState, ...saved, backupVersion: 2, onboardingComplete: saved.onboardingComplete ?? Number(saved.income) > 0, categories, expenses, incomeHistory: saved.incomeHistory || [], recurringConfirmations: saved.recurringConfirmations || {}, recurringHistory: saved.recurringHistory || [], expenseHistory: saved.expenseHistory || [], incomeNotice: saved.incomeNotice || "", darkMode: Boolean(saved.darkMode), currentCycleIncome: saved.currentCycleIncome == null ? null : Number(saved.currentCycleIncome), testCycleOverride: saved.testCycleOverride || null, dateMode: saved.dateMode === "debug" ? "debug" : "system", debugDate: saved.debugDate || null, lastCycleStart: saved.lastCycleStart || null, savingsBalance: Number(saved.savingsBalance || 0), savingsHistory: saved.savingsHistory || [], savingsMovements: saved.savingsMovements || [], collectiveEvents: saved.collectiveEvents || [], collectiveDraft: saved.collectiveDraft && Array.isArray(saved.collectiveDraft.people) && Array.isArray(saved.collectiveDraft.expenses) ? saved.collectiveDraft : structuredClone(defaultState.collectiveDraft) };
  } catch {
    return structuredClone(defaultState);
  }
}
function expenseModificationLabel(item) {
  return item.modified ? `<span class="modified-tag">MODIFICADO · ${dateFormat(item.modified.date)}</span>` : "";
}
function populateExpenseEditCategory(selectedId) {
  document.getElementById("expense-edit-category").innerHTML = state.categories.map(category => `<option value="${category.id}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");
}
function openExpenseEditor(id) {
  expenseToEdit = state.expenses.find(item => item.id === id);
  if (!expenseToEdit) return;
  document.getElementById("expense-edit-description").value = expenseToEdit.description;
  document.getElementById("expense-edit-amount").value = expenseToEdit.amount;
  populateExpenseEditCategory(expenseToEdit.categoryId);
  document.getElementById("expense-edit-reason").value = "";
  document.getElementById("expense-edit-custom-reason-label").hidden = true;
  document.getElementById("expense-edit-custom-reason").required = false;
  openModal("expense-edit-modal");
}
function getExpenseEditReason() {
  const selected = document.getElementById("expense-edit-reason").value;
  return selected === "Otro" ? document.getElementById("expense-edit-custom-reason").value.trim() : selected;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function currentIncome() { return state.currentCycleIncome == null ? Number(state.income || 0) : Number(state.currentCycleIncome); }
function getCycleStart() {
  const now = effectiveDate();
  let year = now.getFullYear(), month = now.getMonth();
  if (now.getDate() < Number(state.cutoffDay || 1)) month -= 1;
  return new Date(year, month, Number(state.cutoffDay || 1));
}
function cycleDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function closeCompletedCycles() {
  if (!state.onboardingComplete) return;
  const currentStart = getCycleStart();
  if (!state.lastCycleStart) {
    state.lastCycleStart = cycleDateKey(currentStart);
    saveState();
    return;
  }
  let previousStart = new Date(`${state.lastCycleStart}T12:00:00`);
  let changed = false;
  while (previousStart < currentStart) {
    const nextStart = new Date(previousStart);
    nextStart.setMonth(nextStart.getMonth() + 1);
    const cycleExpenses = state.expenses.filter(item => !item.recurring && new Date(`${item.date}T12:00:00`) >= previousStart && new Date(`${item.date}T12:00:00`) < nextStart);
    const spent = cycleExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const remaining = Math.max(currentIncome() - spent, 0);
    state.savingsBalance += remaining;
    state.savingsHistory.push({ id: crypto.randomUUID(), start: cycleDateKey(previousStart), end: cycleDateKey(new Date(nextStart.getTime() - 86400000)), income: currentIncome(), spent, remaining, transferred: remaining, date: todayISO() });
    previousStart = nextStart;
    changed = true;
  }
  state.lastCycleStart = cycleDateKey(currentStart);
  if (changed) {
    state.currentCycleIncome = null;
    saveState();
  }
}
function isCurrentCycle(expense) {
  const date = new Date(`${expense.date}T12:00:00`);
  return date >= getCycleStart() && date <= getCycleEnd();
}
function currentExpenses() { return state.expenses.filter(isCurrentCycle); }
function confirmedExpenses() { return currentExpenses().filter(item => !item.recurring); }
function todayDate() { return effectiveDate(); }
function todayKey() { return todayISO(); }
function recurringTemplatesForToday() {
  const day = todayDate().getDay();
  const current = todayDate();
  const date = current.getDate();
  return state.expenses.filter(item => item.recurring && (item.frequency === "daily" || (item.frequency === "weekly" && Number(item.weekday) === day) || (item.frequency === "monthly" && Math.min(Number(item.monthlyDay), daysInMonth(current.getFullYear(), current.getMonth())) === date)));
}
function confirmationKey(template) { return `${template.id}_${todayKey()}`; }
function pendingRecurring() {
  const confirmations = state.recurringConfirmations || {};
  return recurringTemplatesForToday().filter(template => !confirmations[confirmationKey(template)]);
}
function getCategory(id) { return state.categories.find(category => category.id === id) || { name: "Sin categoría", color: "#aab2ad", icon: "•" }; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function showToast(message, error = false) {
  const region = document.getElementById("toast-region");
  region.innerHTML = `<div class="toast ${error ? "error" : ""}">${escapeHtml(message)}</div>`;
  setTimeout(() => { region.innerHTML = ""; }, 3000);
}
function formatUpdateNotes(notes) {
  return String(notes || "Esta actualización incluye mejoras y correcciones.")
    .replace(/^Hay una nueva actualización\.?\s*/i, "")
    .replace(/\\n/g, "\n")
    .replace(/`n/g, "\n")
    .replace(/\r?\n-\s*/g, "\n• ");
}
function render() {
  document.body.classList.toggle("dark-mode", state.darkMode);
  document.getElementById("setup-required-card").hidden = Boolean(state.onboardingComplete && state.income > 0);
  closeCompletedCycles();
  applyPendingIncome();
  renderDashboard();
  renderExpenses();
  renderCategories();
  renderStatistics();
  renderReports();
  renderIncomeHistoryPage();
  renderSavings();
  renderSettings();
  updateCycle();
  renderSidebarRecurring();
  renderAllRecurring();
  renderCollective();
  renderRecurringConfirmation();
  document.getElementById("installed-version").textContent = APP_VERSION;
  document.getElementById("dark-mode-toggle").checked = state.darkMode;
  if (!state.onboardingComplete) {
    document.getElementById("welcome-modal").hidden = false;
    setTimeout(() => document.getElementById("welcome-income-input").focus(), 0);
  }
}
async function checkForUpdate(showNoUpdate = false, ignoreDismissed = false) {
  try {
    const updater = window.__TAURI__?.updater;
    if (!updater?.check) {
      if (showNoUpdate) showToast("Las actualizaciones automáticas solo están disponibles en la versión instalada.", true);
      return;
    }
    const remote = await updater.check();
    if (remote?.available && (ignoreDismissed || remote.version !== localStorage.getItem("saldo-dismissed-update"))) {
      availableUpdate = remote;
      updateBackupExported = false;
      document.getElementById("update-message").textContent = `Está disponible la versión ${remote.version}.`;
      document.getElementById("update-changes-text").textContent = formatUpdateNotes(remote.body);
      document.getElementById("continue-update-button").disabled = true;
      openModal("update-modal");
    } else if (showNoUpdate) showToast("Ya tienes la última versión.");
  } catch (error) {
    if (showNoUpdate) {
      showToast("No se pudo consultar la actualización publicada. Revisa tu conexión o inténtalo nuevamente.", true);
    }
  }
}
function renderDashboard() {
  const expenses = confirmedExpenses(), spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const remaining = currentIncome() - spent, budget = currentIncome();
  document.getElementById("remaining-amount").textContent = money(remaining);
  document.getElementById("remaining-caption").textContent = budget ? (remaining >= 0 ? "Disponible para el resto del ciclo" : "Has superado tu presupuesto") : "Configura tu ingreso mensual para comenzar";
  const notice = document.getElementById("income-notice");
  if (state.incomeNotice) {
    notice.textContent = state.incomeNotice;
    notice.hidden = false;
  } else notice.hidden = true;
  document.getElementById("spent-caption").textContent = `${money(spent)} gastados`;
  document.getElementById("budget-caption").textContent = `${money(budget)} de presupuesto`;
  document.getElementById("budget-progress").style.width = `${budget ? Math.min(Math.max(spent / budget * 100, 0), 100) : 0}%`;
  document.getElementById("income-stat").textContent = money(budget);
  document.getElementById("spent-stat").textContent = money(spent);
  document.getElementById("average-stat").textContent = money(expenses.length ? spent / expenses.length : 0);
  document.getElementById("count-stat").textContent = expenses.length;

  const grouped = groupByCategory(expenses), groups = Object.entries(grouped).filter(([, value]) => value > 0);
  const total = groups.reduce((sum, [, value]) => sum + value, 0);
  document.getElementById("chart-total").textContent = money(total);
  document.getElementById("chart-empty").style.display = groups.length ? "none" : "block";
  document.getElementById("category-legend").innerHTML = groups.map(([id, value]) => {
    const category = getCategory(id);
    return `<div class="legend-row"><i class="legend-dot" style="background:${category.color}"></i><span>${escapeHtml(category.name)}</span><span>${money(value)}</span></div>`;
  }).join("");
  let cursor = 0;
  const stops = groups.map(([id, value]) => { const start = cursor; cursor += value / total * 360; return `${getCategory(id).color} ${start}deg ${cursor}deg`; });
  document.getElementById("donut-chart").style.background = groups.length ? `conic-gradient(${stops.join(",")})` : "#e9f1ed";
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  document.getElementById("recent-empty").style.display = recent.length ? "none" : "block";
  document.getElementById("recent-expenses").innerHTML = recent.map(expenseRow).join("");
}
function renderRecurringConfirmation() {
  const pending = pendingRecurring();
  const banner = document.getElementById("pending-banner");
  const bar = document.getElementById("recurring-bar");
  banner.hidden = pending.length === 0;
  bar.hidden = pending.length === 0;
  document.getElementById("recurring-date-label").textContent = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(todayDate());
  document.getElementById("recurring-items").innerHTML = pending.map(template => {
    const category = getCategory(template.categoryId);
    const frequency = template.frequency === "daily" ? "Diario" : template.frequency === "weekly" ? "Semanal" : "Mensual";
    return `<div class="recurring-item"><div class="recurring-item-icon" style="background:${category.color}20;color:${category.color}">${category.icon}</div><div class="recurring-item-info"><strong>${escapeHtml(template.description)}</strong><span>${escapeHtml(category.name)} · ${frequency}</span></div><b>${money(template.amount)}</b><button class="confirm-button yes" data-confirm-recurring="${template.id}" title="Sí, lo gasté">✓</button><button class="confirm-button no" data-reject-recurring="${template.id}" title="No lo gasté">×</button></div>`;
  }).join("");
}
function renderAllRecurring() {
  const templates = state.expenses.filter(item => item.recurring);
  document.getElementById("recurring-all-empty").style.display = templates.length ? "none" : "block";
  document.getElementById("recurring-all-list").innerHTML = templates.map(template => {
    const category = getCategory(template.categoryId);
    const frequency = template.frequency === "daily" ? "Diario" : template.frequency === "monthly" ? `Mensual · día ${template.monthlyDay}` : `Semanal · ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][Number(template.weekday)]}`;
    return `<div class="recurring-all-row"><div class="recurring-item-icon" style="background:${category.color}20;color:${category.color}">${category.icon}</div><div class="expense-info"><strong>${escapeHtml(template.description)}</strong><span>${escapeHtml(category.name)} · ${frequency}</span></div><b>${money(template.amount)}</b><button class="edit-button" data-edit-recurring="${template.id}" title="Modificar recurrente">✎</button><button class="delete-button" data-delete-recurring="${template.id}" title="Eliminar recurrente">×</button></div>`;
  }).join("");
}
function renderSidebarRecurring() {
  const templates = state.expenses.filter(item => item.recurring);
  document.getElementById("sidebar-recurring-count").textContent = templates.length;
  document.getElementById("sidebar-recurring-empty").hidden = templates.length > 0;
  const visible = templates.slice(0, 3);
  document.getElementById("sidebar-recurring-more").hidden = templates.length <= 3;
  document.getElementById("sidebar-recurring-list").innerHTML = visible.map(template => {
    const category = getCategory(template.categoryId);
    const frequency = template.frequency === "daily" ? "Diario" : template.frequency === "monthly" ? `Mensual · día ${template.monthlyDay}` : `Cada ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][Number(template.weekday)] || "semana"}`;
    return `<div class="sidebar-recurring-item"><button class="sidebar-recurring-main" data-edit-recurring="${template.id}"><span class="sidebar-recurring-dot" style="background:${category.color}"></span><span class="sidebar-recurring-info"><strong>${escapeHtml(template.description)}</strong><small>${frequency} · ${money(template.amount)}</small></span><span class="sidebar-edit-icon">✎</span></button><button class="sidebar-recurring-delete" data-delete-recurring="${template.id}" title="Eliminar recurrente" aria-label="Eliminar recurrente">×</button></div>`;
  }).join("");
}
function renderSavings() {
  const history = [...(state.savingsHistory || [])].reverse();
  document.getElementById("savings-total").textContent = money(state.savingsBalance);
  document.getElementById("savings-total-stat").textContent = money(state.savingsBalance);
  const movements = [...(state.savingsMovements || [])].reverse();
  document.getElementById("savings-cycle-count").textContent = history.length;
  document.getElementById("savings-empty").style.display = history.length || movements.length ? "none" : "block";
  document.getElementById("savings-history").innerHTML = history.map(item => `<div class="income-history-row savings-history-row"><div><strong>${dateFormat(item.start)} – ${dateFormat(item.end)}</strong><span>Ingreso ${money(item.income)} · Gastado ${money(item.spent)}</span></div><b>+${money(item.transferred)}</b></div>`).join("") + movements.map(item => `<div class="income-history-row savings-history-row"><div><strong>${item.type === "deposit" ? "Ingreso de ahorro" : "Extracción de ahorro"}</strong><span>${dateFormat(item.date)} · ${escapeHtml(item.reason)}</span></div><b class="${item.type === "deposit" ? "savings-positive" : "savings-negative"}">${item.type === "deposit" ? "+" : "−"}${money(item.amount)}</b></div>`).join("");
}
function collectiveDraft() {
  if (!state.collectiveDraft || !Array.isArray(state.collectiveDraft.people) || !Array.isArray(state.collectiveDraft.expenses)) state.collectiveDraft = structuredClone(defaultState.collectiveDraft);
  return state.collectiveDraft;
}
function calculateCollectiveSettlements(event = collectiveDraft()) {
  const people = event.people || [];
  const total = (event.expenses || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const share = people.length ? total / people.length : 0;
  const balances = people.map(person => ({ ...person, paid: (event.expenses || []).filter(item => item.payerId === person.id).reduce((sum, item) => sum + Number(item.amount || 0), 0) }));
  balances.forEach(person => { person.balance = person.paid - share; });
  const creditors = balances.filter(person => person.balance > 0.005).map(person => ({ ...person, amount: person.balance }));
  const debtors = balances.filter(person => person.balance < -0.005).map(person => ({ ...person, amount: -person.balance }));
  const transfers = [];
  debtors.forEach(debtor => {
    let remaining = debtor.amount;
    creditors.forEach(creditor => {
      if (remaining <= 0.005 || creditor.amount <= 0.005) return;
      const amount = Math.min(remaining, creditor.amount);
      transfers.push({ from: debtor.name, to: creditor.name, amount });
      remaining -= amount;
      creditor.amount -= amount;
    });
  });
  return { total, share, balances, transfers };
}
function groupCollectiveTransfers(transfers) {
  return transfers.reduce((groups, transfer) => {
    (groups[transfer.from] ||= []).push(transfer);
    return groups;
  }, {});
}
function renderCollective() {
  const event = collectiveDraft();
  const peopleInput = document.getElementById("collective-people");
  if (!peopleInput) return;
  document.getElementById("collective-name").value = event.name || "";
  peopleInput.value = event.people.map(person => person.name).join("\n");
  const payer = document.getElementById("collective-payer");
  payer.innerHTML = event.people.map(person => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("");
  document.getElementById("collective-no-people").hidden = event.people.length > 0;
  document.getElementById("collective-expenses").innerHTML = event.expenses.map(item => {
    const person = event.people.find(candidate => candidate.id === item.payerId);
    return `<div class="collective-expense-row"><div><strong>${escapeHtml(item.reason)}</strong><span>${escapeHtml(person?.name || "Sin persona")}</span></div><b>${money(item.amount)}</b><button class="delete-button" data-delete-collective-expense="${item.id}" aria-label="Eliminar compra">×</button></div>`;
  }).join("");
  const result = calculateCollectiveSettlements(event);
  document.getElementById("collective-total").textContent = money(result.total);
  document.getElementById("collective-share").textContent = money(result.share);
  const groupedTransfers = groupCollectiveTransfers(result.transfers);
  document.getElementById("collective-settlements").innerHTML = result.transfers.length
    ? Object.entries(groupedTransfers).map(([from, transfers]) => `<div class="collective-payer-group"><h3>${escapeHtml(from)} debe transferir</h3>${transfers.map(item => `<div class="collective-transfer"><span>A <strong>${escapeHtml(item.to)}</strong></span><b>${money(item.amount)}</b></div>`).join("")}<div class="collective-payer-total">Total de ${escapeHtml(from)}: <strong>${money(transfers.reduce((sum, item) => sum + item.amount, 0))}</strong></div></div>`).join("")
    : `<div class="empty-state compact">${event.people.length > 1 && event.expenses.length ? "Todos quedan equilibrados." : "Agrega personas y compras para calcular las transferencias."}</div>`;
  document.getElementById("collective-balances").innerHTML = result.balances.map(person => `<div class="collective-balance"><span>${escapeHtml(person.name)}</span><span>Pagó ${money(person.paid)}</span><b class="${person.balance >= 0 ? "savings-positive" : "savings-negative"}">${person.balance >= 0 ? "+" : "−"}${money(Math.abs(person.balance))}</b></div>`).join("");
}
function saveCollectiveDraft() { state.collectiveDraft = collectiveDraft(); saveState(); renderCollective(); }
function printCollectiveReceipt() {
  const event = collectiveDraft(), result = calculateCollectiveSettlements(event);
  if (!event.people.length || !event.expenses.length) return showToast("Agrega personas y compras antes de generar el comprobante.", true);
  const groupedTransfers = groupCollectiveTransfers(result.transfers);
  const transferSections = Object.entries(groupedTransfers).map(([from, transfers]) => `<section><h3>${escapeHtml(from)} debe transferir</h3><table><tr><th>A quién</th><th>Importe</th></tr>${transfers.map(item => `<tr><td>${escapeHtml(item.to)}</td><td>${money(item.amount)}</td></tr>`).join("")}</table><p><strong>Total de ${escapeHtml(from)}: ${money(transfers.reduce((sum, item) => sum + item.amount, 0))}</strong></p></section>`).join("");
  const html = `<html><head><meta charset="UTF-8"><title>Comprobante - ${escapeHtml(event.name || "Compra colectiva")}</title><style>body{font-family:Arial;padding:32px;color:#222}table{border-collapse:collapse;width:100%;margin:10px 0 8px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#e7f1ec}h1{color:#177b55}h2{margin-top:28px}h3{margin-bottom:6px}</style></head><body><h1>${escapeHtml(event.name || "Compra colectiva")}</h1><p>Total: <strong>${money(result.total)}</strong> · Parte por persona: <strong>${money(result.share)}</strong></p><h2>Transferencias por persona</h2>${transferSections || "<p>No hay transferencias pendientes.</p>"}<h2>Compras registradas</h2><table><tr><th>Persona</th><th>Razón</th><th>Importe</th></tr>${event.expenses.map(item => `<tr><td>${escapeHtml(event.people.find(person => person.id === item.payerId)?.name || "")}</td><td>${escapeHtml(item.reason)}</td><td>${money(item.amount)}</td></tr>`).join("")}</table></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${(event.name || "compra-colectiva").replace(/[^\wáéíóúñü -]/gi, "").trim().replace(/\s+/g, "-") || "compra-colectiva"}-comprobante.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("Comprobante descargado correctamente.");
}
function resetCollective() {
  state.collectiveEvents = state.collectiveEvents || [];
  if (collectiveDraft().people.length || collectiveDraft().expenses.length) state.collectiveEvents.push({ ...collectiveDraft(), completedAt: new Date().toISOString() });
  state.collectiveDraft = structuredClone(defaultState.collectiveDraft);
  saveState();
  renderCollective();
  showToast("Pestaña de compra colectiva reiniciada.");
}
function confirmRecurring(templateId, spent) {
  const template = state.expenses.find(item => item.id === templateId);
  if (!template) return;
  if (!state.recurringConfirmations) state.recurringConfirmations = {};
  state.recurringConfirmations[confirmationKey(template)] = spent ? "yes" : "no";
  if (spent) state.expenses.push({ id: crypto.randomUUID(), description: template.description, amount: Number(template.amount), categoryId: template.categoryId, date: todayKey(), recurring: false, recurringSourceId: template.id });
  saveState();
  render();
  showToast(spent ? "Gasto confirmado y descontado." : "Gasto marcado como no realizado.");
}
function updateRecurringEditHelp() {
  const scope = document.getElementById("recurring-edit-scope").value;
  document.getElementById("recurring-edit-help").textContent = scope === "cycle"
    ? "Se actualizarán también las confirmaciones de este gasto dentro del ciclo actual y quedará registrado en el historial."
    : "Solo se aplicará a las próximas confirmaciones. Los importes ya registrados no cambiarán.";
}
function openRecurringEditor(id) {
  recurringToEdit = state.expenses.find(item => item.id === id);
  if (!recurringToEdit) return;
  document.getElementById("recurring-edit-title").textContent = `Modificar ${recurringToEdit.description}`;
  document.getElementById("recurring-edit-amount").value = recurringToEdit.amount;
  document.getElementById("recurring-edit-weekday").value = String(Number(recurringToEdit.weekday ?? 1));
  document.getElementById("recurring-edit-weekday-label").hidden = recurringToEdit.frequency !== "weekly";
  document.getElementById("recurring-edit-monthly-day").value = recurringToEdit.monthlyDay || "";
  document.getElementById("recurring-edit-monthly-date-label").hidden = recurringToEdit.frequency !== "monthly";
  document.getElementById("recurring-edit-scope").value = "cycle";
  updateRecurringEditHelp();
  openModal("recurring-edit-modal");
}
function groupByCategory(expenses) { return expenses.reduce((groups, item) => { groups[item.categoryId] = (groups[item.categoryId] || 0) + Number(item.amount); return groups; }, {}); }
function expenseRow(item) {
  const category = getCategory(item.categoryId);
  return `<div class="expense-row"><div class="expense-avatar" style="background:${category.color}20;color:${category.color}">${category.icon}</div><div class="expense-info"><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(category.name)} · ${dateFormat(item.date)}</span></div><span class="expense-value">${money(item.amount)}</span></div>`;
}
function renderExpenses() {
  const query = (document.getElementById("expense-search")?.value || "").toLowerCase();
  const filter = document.getElementById("expense-filter")?.value || "all";
  const expenses = confirmedExpenses().filter(item => item.description.toLowerCase().includes(query) && (filter === "all" || item.categoryId === filter)).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById("expense-table").innerHTML = expenses.map(item => {
    const category = getCategory(item.categoryId);
    return `<tr><td><strong>${escapeHtml(item.description)}</strong>${expenseModificationLabel(item)}</td><td><span class="table-category"><i class="legend-dot" style="background:${category.color}"></i>${escapeHtml(category.name)}</span></td><td>${dateFormat(item.date)}</td><td>${item.recurring ? '<span class="recurring-tag">Recurrente</span>' : '<span class="muted">Único</span>'}</td><td class="align-right"><strong>${money(item.amount)}</strong></td><td class="align-right"><button class="edit-button" data-edit-expense="${item.id}" aria-label="Corregir gasto" title="Corregir gasto">✎</button><button class="delete-button" data-delete-expense="${item.id}" aria-label="Eliminar gasto">×</button></td></tr>`;
  }).join("");
  document.getElementById("expense-empty").style.display = expenses.length ? "none" : "block";
  const filterSelect = document.getElementById("expense-filter");
  const currentFilter = filterSelect.value;
  filterSelect.innerHTML = `<option value="all">Todas las categorías</option>${state.categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}`;
  filterSelect.value = state.categories.some(category => category.id === currentFilter) ? currentFilter : "all";
}
function renderCategories() {
  const counts = state.expenses.reduce((result, item) => { result[item.categoryId] = (result[item.categoryId] || 0) + 1; return result; }, {});
  const confirmedCounts = state.expenses.reduce((result, item) => { if (!item.recurring) result[item.categoryId] = (result[item.categoryId] || 0) + 1; return result; }, {});
  const recurringCounts = state.expenses.reduce((result, item) => { if (item.recurring) result[item.categoryId] = (result[item.categoryId] || 0) + 1; return result; }, {});
  document.getElementById("category-grid").innerHTML = state.categories.map((category, index) => {
    const confirmed = confirmedCounts[category.id] || 0;
    const recurring = recurringCounts[category.id] || 0;
    const summary = `${confirmed} ${confirmed === 1 ? "gasto confirmado" : "gastos confirmados"}${recurring ? ` · ${recurring} recurrente${recurring === 1 ? "" : "s"}` : ""}`;
    return `<article class="category-card"><div class="category-card-actions"><button class="category-menu" data-edit-category="${category.id}" title="Editar categoría">✎</button><button class="category-menu" data-delete-category="${category.id}" title="Eliminar categoría">×</button></div><div class="category-icon" style="color:${category.color};background:${category.color}20">${category.icon || icons[index % icons.length]}</div><strong>${escapeHtml(category.name)}</strong><span>${summary}</span></article>`;
  }).join("");
}
function renderStatistics() {
  const expenses = document.getElementById("stats-period")?.value === "all" ? state.expenses.filter(item => !item.recurring) : confirmedExpenses();
  const grouped = groupByCategory(expenses), groups = Object.entries(grouped).sort((a, b) => b[1] - a[1]), max = groups[0]?.[1] || 1, total = groups.reduce((sum, [, amount]) => sum + amount, 0);
  document.getElementById("stats-total-caption").textContent = `Total ${document.getElementById("stats-period")?.value === "all" ? "histórico" : "del ciclo"} · ${money(total)}`;
  document.getElementById("stats-empty").style.display = groups.length ? "none" : "block";
  document.getElementById("bar-list").innerHTML = groups.map(([id, amount]) => { const category = getCategory(id); return `<div><div class="bar-label"><span>${escapeHtml(category.name)}</span><span>${money(amount)} · ${total ? Math.round(amount / total * 100) : 0}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${amount / max * 100}%;background:${category.color}"></div></div></div>`; }).join("");
  const largest = groups[0] ? getCategory(groups[0][0]).name : "Sin datos";
  document.getElementById("insights-list").innerHTML = `<div class="insight"><strong>${largest}</strong><span>Tu categoría con mayor gasto</span></div><div class="insight"><strong>${money(expenses.length ? total / expenses.length : 0)}</strong><span>Promedio por movimiento</span></div><div class="insight"><strong>${expenses.filter(item => item.recurring).length}</strong><span>Gastos recurrentes registrados</span></div>`;
}
function renderReports() {
  const expenses = confirmedExpenses(), spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  document.getElementById("report-summary").innerHTML = `<div class="summary-grid"><div class="summary-box"><span>Ingreso mensual</span><strong>${money(currentIncome())}</strong></div><div class="summary-box"><span>Gastos del ciclo</span><strong>${money(spent)}</strong></div><div class="summary-box"><span>Presupuesto restante</span><strong>${money(currentIncome() - spent)}</strong></div></div>`;
  const history = [...state.incomeHistory].reverse();
  document.getElementById("income-history").innerHTML = history.length ? history.map(item => `<div class="income-history-row"><div><strong>${escapeHtml(item.reason)}</strong><span>${dateFormat(item.date)} · ${item.type === "next" ? "Próximo ciclo" : item.type === "addition" ? "Adición al monto actual" : item.type === "next-applied" ? "Aplicado al iniciar ciclo" : "Monto actual"}</span></div><b>${item.type === "addition" ? "+" : ""}${money(item.amount)}</b></div>`).join("") : `<div class="empty-state compact">Todavía no hay modificaciones de ingreso.</div>`;
  const recurringHistory = [...(state.recurringHistory || [])].reverse();
  document.getElementById("recurring-history").innerHTML = recurringHistory.length ? recurringHistory.map(item => {
    const weekdayChange = item.weekday !== undefined && item.previousWeekday !== item.weekday ? ` · Día cambiado a ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][Number(item.weekday)]}` : "";
    return `<div class="income-history-row modification-row"><div><strong>${escapeHtml(item.description)}</strong><span>${dateFormat(item.date)} · ${item.scope === "cycle" ? "Todo el ciclo actual" : "A partir de la corrección"}${weekdayChange}</span></div><b>${money(item.previousAmount)} → ${money(item.amount)}</b></div>`;
  }).join("") : `<div class="empty-state compact">Todavía no hay cambios de gastos recurrentes.</div>`;
  const expenseHistory = [...(state.expenseHistory || [])].reverse();
  document.getElementById("expense-history").innerHTML = expenseHistory.length ? expenseHistory.map(item => `<div class="income-history-row modification-row"><div><strong>MODIFICADO · ${escapeHtml(item.description)}</strong><span>${dateFormat(item.date)} · ${escapeHtml(item.reason)}</span></div><b>${money(item.previousAmount)} → ${money(item.amount)}</b></div>`).join("") : `<div class="empty-state compact">Todavía no hay gastos corregidos.</div>`;
}
function incomeHistoryMarkup() {
  const history = [...state.incomeHistory].reverse();
  return history.length ? history.map(item => `<div class="income-history-row"><div><strong>${escapeHtml(item.reason || "Ingreso inicial")}</strong><span>${dateFormat(item.date)} · ${item.type === "next" ? "Próximo ciclo" : item.type === "addition" ? "Adición al monto actual" : item.type === "next-applied" ? "Aplicado al iniciar ciclo" : "Monto actual"}</span></div><b>${item.type === "addition" ? "+" : ""}${money(item.amount)}</b></div>`).join("") : `<div class="empty-state compact">Todavía no hay modificaciones de ingreso.</div>`;
}
function renderIncomeHistoryPage() {
  document.getElementById("income-history-page").innerHTML = incomeHistoryMarkup();
}
function renderSettings() {
  document.getElementById("income-input").value = state.income || "";
  document.getElementById("cutoff-input").value = state.cutoffDay || 1;
  document.getElementById("date-mode-input").value = state.dateMode;
  document.getElementById("debug-date-input").value = state.debugDate || todayISO();
  document.getElementById("debug-date-label").hidden = state.dateMode !== "debug";
  const advance = document.getElementById("advance-cycle-button");
  advance.disabled = state.dateMode !== "debug";
  advance.title = state.dateMode === "debug" ? "Avanzar un día de prueba" : "Activa la fecha DEBUG para usar esta herramienta";
}
function updateCycle() {
  const start = getCycleStart(), end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);
  document.getElementById("cycle-label").textContent = state.income ? `${dateFormat(start.toISOString().slice(0, 10))} – ${dateFormat(end.toISOString().slice(0, 10))}` : "Sin configurar";
  document.getElementById("cycle-date").textContent = state.income ? `Corte el día ${state.cutoffDay}` : "Configura tu fecha de corte";
  document.getElementById("current-date").textContent = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(effectiveDate());
}
function nextCycleDate() {
  const start = getCycleStart();
  return new Date(start.getFullYear(), start.getMonth() + 1, Number(state.cutoffDay || 1));
}
function applyPendingIncome() {
  if (!state.pendingIncome || effectiveDate() < new Date(`${state.pendingIncome.effectiveDate}T00:00:00`)) return;
  const pending = state.pendingIncome;
  state.income = pending.amount;
  state.currentCycleIncome = null;
  state.cutoffDay = pending.cutoffDay;
  state.incomeHistory.push({ ...pending, type: "next-applied", date: todayISO() });
  state.pendingIncome = null;
  saveState();
}
function incomeReason() {
  const selected = document.getElementById("income-reason").value;
  return selected === "Otro" ? document.getElementById("income-custom-reason").value.trim() : selected;
}
function updateIncomeForm() {
  const action = document.getElementById("income-action").value;
  const cutoffLabel = document.getElementById("income-cutoff-label");
  const amountLabel = document.getElementById("income-amount-label");
  document.getElementById("income-change-amount").value = "";
  document.getElementById("income-change-cutoff").value = state.cutoffDay;
  cutoffLabel.hidden = action !== "next";
  amountLabel.firstChild.textContent = action === "addition" ? "Monto a sumar" : action === "current" ? "Nuevo monto actual" : "Nuevo monto mensual";
}
function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }
function populateCategorySelect() { document.getElementById("category-input").innerHTML = state.categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join(""); }
function navigate(view) {
  document.querySelectorAll(".view").forEach(section => section.classList.remove("active-view"));
  document.getElementById(`view-${view}`).classList.add("active-view");
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const titles = { dashboard: "Resumen financiero", statistics: "Estadísticas", expenses: "Gastos", categories: "Categorías", savings: "Ahorrado", "income-history-view": "Historial de ingresos", collective: "Compra colectiva", "recurring-all": "Todos los gastos recurrentes", reports: "Reportes y respaldos", settings: "Configuración" };
  document.getElementById("page-title").textContent = titles[view];
  window.scrollTo({ top: 0, behavior: "auto" });
}
function backupTable(title, headers, rows) {
  return `<h2>${escapeHtml(title)}</h2><table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function exportBackup() {
  const payload = JSON.stringify({ format: "saldo-backup", version: 2, exportedAt: new Date().toISOString(), state });
  const sections = [
    backupTable("Configuración y resumen", ["Dato", "Valor"], [
      ["Versión de aplicación", APP_VERSION], ["Ingreso base", state.income], ["Ingreso del ciclo actual", currentIncome()], ["Día de corte", state.cutoffDay], ["Ciclo iniciado", state.lastCycleStart || ""], ["Saldo ahorrado", state.savingsBalance], ["Modo oscuro", state.darkMode ? "Sí" : "No"]
    ]),
    backupTable("Categorías", ["ID", "Nombre", "Color", "Ícono"], state.categories.map(item => [item.id, item.name, item.color, item.icon])),
    backupTable("Gastos", ["ID", "Descripción", "Importe", "Categoría", "Fecha", "Recurrente", "Frecuencia", "Día semanal", "Día mensual", "Origen recurrente"], state.expenses.map(item => [item.id, item.description, item.amount, getCategory(item.categoryId).name, item.date, item.recurring ? "Sí" : "No", item.frequency || "", item.weekday ?? "", item.monthlyDay ?? "", item.recurringSourceId || ""])),
    backupTable("Historial de ingresos", ["ID", "Importe", "Razón", "Fecha", "Tipo", "Fecha efectiva", "Día de corte"], state.incomeHistory.map(item => [item.id, item.amount, item.reason, item.date, item.type, item.effectiveDate || "", item.cutoffDay])),
    backupTable("Historial de ahorros", ["Tipo", "Importe", "Razón", "Fecha"], state.savingsMovements.map(item => [item.type, item.amount, item.reason, item.date]).concat(state.savingsHistory.map(item => ["Cierre de ciclo", item.transferred, `Ciclo ${item.start} a ${item.end}`, item.date]))),
    backupTable("Historial de correcciones", ["Tipo", "Descripción", "Anterior", "Nuevo", "Razón", "Fecha"], state.expenseHistory.map(item => ["Gasto", item.description, item.previousAmount, item.amount, item.reason, item.date]).concat((state.recurringHistory || []).map(item => ["Recurrente", item.description, item.previousAmount, item.amount, `Alcance: ${item.scope}`, item.date]))),
    backupTable("Compras colectivas", ["Evento", "Participantes", "Gastos", "Creado"], (state.collectiveEvents || []).map(item => [item.name, item.people.map(person => person.name).join(", "), item.expenses.length, item.createdAt]))
  ].join("");
  const html = `<html><head><meta charset="UTF-8"><style>body{font-family:Arial;color:#222}table{border-collapse:collapse;margin:0 0 24px;min-width:520px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#e7f1ec}h1{color:#177b55}</style></head><body><h1>Saldo - Respaldo completo</h1><p>Este archivo contiene configuración, gastos, ingresos, ahorros, historiales, categorías y compras colectivas. Puede volver a cargarse en Saldo.</p>${sections}<!--SALDO_BACKUP:${btoa(unescape(encodeURIComponent(payload)))}--></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" }), link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `saldo-respaldo-${todayISO()}.xls`; link.click(); URL.revokeObjectURL(link.href); showToast("Respaldo exportado correctamente");
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      const encoded = text.match(/SALDO_BACKUP:([^ -]+)/)?.[1];
      if (!encoded) throw new Error("Formato no reconocido");
      const decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      const imported = decoded.state && decoded.format === "saldo-backup" ? decoded.state : decoded;
      if (!Array.isArray(imported.categories) || !Array.isArray(imported.expenses)) throw new Error("Datos inválidos");
      const importedCategories = [...(imported.categories || [])];
      defaultCategories.forEach(category => { if (!importedCategories.some(item => item.id === category.id)) importedCategories.push({ ...category }); });
      state = { ...defaultState, ...imported, backupVersion: 2, categories: importedCategories, incomeHistory: imported.incomeHistory || [], recurringHistory: imported.recurringHistory || [], expenseHistory: imported.expenseHistory || [], savingsHistory: imported.savingsHistory || [], savingsMovements: imported.savingsMovements || [], collectiveEvents: imported.collectiveEvents || [], onboardingComplete: true }; saveState(); closeModal("welcome-modal"); render(); showToast("Respaldo completo restaurado correctamente");
    } catch (error) { console.error("Error al importar respaldo", error); showToast("No se pudo leer el respaldo. Usa un archivo exportado desde Saldo.", true); }
  };
  reader.readAsText(file);
}
function buildColorPicker() {
  document.getElementById("color-picker").innerHTML = palette.map(color => `<button type="button" class="color-option ${color === selectedColor ? "selected" : ""}" style="background:${color}" data-color="${color}" aria-label="Seleccionar color"></button>`).join("");
  document.getElementById("icon-picker").innerHTML = icons.map(icon => `<button type="button" class="icon-option ${icon === selectedIcon ? "selected" : ""}" data-icon="${icon}" aria-label="Seleccionar ícono">${icon}</button>`).join("");
}
function openCategoryEditor(id = null) {
  categoryToEdit = id;
  const category = id ? state.categories.find(item => item.id === id) : null;
  selectedColor = category?.color || palette[0];
  selectedIcon = category?.icon || icons[0];
  document.getElementById("category-modal-title").textContent = category ? "Editar categoría" : "Nueva categoría";
  document.getElementById("category-submit-button").textContent = category ? "Guardar cambios" : "Crear categoría";
  document.getElementById("category-name-input").value = category?.name || "";
  buildColorPicker();
  openModal("category-modal");
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) navigate(nav.dataset.view);
  const link = event.target.closest("[data-view-link]");
  if (link) navigate(link.dataset.viewLink);
  const close = event.target.closest("[data-close-modal]");
  if (close) closeModal(close.dataset.closeModal);
  if (event.target.id === "new-expense-button" || event.target.id === "new-expense-button-2") { populateCategorySelect(); document.getElementById("date-input").value = todayISO(); document.getElementById("recurring-monthly-day").value = ""; document.getElementById("recurring-options").hidden = true; document.getElementById("recurring-weekday-label").hidden = true; document.getElementById("recurring-monthly-date-label").hidden = true; document.getElementById("date-input").required = true; openModal("expense-modal"); }
  if (event.target.id === "income-button") { updateIncomeForm(); openModal("income-modal"); }
  const editRecurring = event.target.closest("[data-edit-recurring]");
  if (editRecurring) openRecurringEditor(editRecurring.dataset.editRecurring);
  const deleteRecurring = event.target.closest("[data-delete-recurring]");
  if (deleteRecurring) { recurringToDelete = deleteRecurring.dataset.deleteRecurring; openModal("recurring-delete-modal"); }
  const editExpense = event.target.closest("[data-edit-expense]");
  if (editExpense) openExpenseEditor(editExpense.dataset.editExpense);
  if (event.target.id === "pending-banner-button") document.getElementById("recurring-bar").scrollIntoView({ behavior: "smooth", block: "end" });
  const confirmButton = event.target.closest("[data-confirm-recurring]");
  if (confirmButton) confirmRecurring(confirmButton.dataset.confirmRecurring, true);
  const rejectButton = event.target.closest("[data-reject-recurring]");
  if (rejectButton) confirmRecurring(rejectButton.dataset.rejectRecurring, false);
  if (event.target.id === "open-welcome-button") { document.getElementById("welcome-modal").hidden = false; setTimeout(() => document.getElementById("welcome-income-input").focus(), 0); }
  if (event.target.id === "new-category-button") openCategoryEditor();
  const editCategory = event.target.closest("[data-edit-category]");
  if (editCategory) openCategoryEditor(editCategory.dataset.editCategory);
  const color = event.target.closest("[data-color]");
  if (color) { selectedColor = color.dataset.color; buildColorPicker(); }
  const icon = event.target.closest("[data-icon]");
  if (icon) { selectedIcon = icon.dataset.icon; buildColorPicker(); }
  const deleteButton = event.target.closest("[data-delete-expense]");
  if (deleteButton) { expenseToDelete = deleteButton.dataset.deleteExpense; openModal("delete-modal"); }
  if (event.target.id === "confirm-delete") { state.expenses = state.expenses.filter(item => item.id !== expenseToDelete); saveState(); closeModal("delete-modal"); render(); showToast("Gasto eliminado"); }
  if (event.target.id === "confirm-recurring-delete") {
    if (recurringToDelete) {
      state.expenses = state.expenses.filter(item => item.id !== recurringToDelete);
      Object.keys(state.recurringConfirmations || {}).forEach(key => { if (key.startsWith(`${recurringToDelete}_`)) delete state.recurringConfirmations[key]; });
      saveState();
    }
    closeModal("recurring-delete-modal");
    render();
    showToast("Gasto recurrente eliminado");
  }
  const deleteCategory = event.target.closest("[data-delete-category]");
  if (deleteCategory) {
    if (state.categories.length <= 1) return showToast("Debes conservar al menos una categoría.", true);
    const hasExpenses = state.expenses.some(item => item.categoryId === deleteCategory.dataset.deleteCategory);
    if (hasExpenses) return showToast("No puedes eliminar una categoría con gastos asociados.", true);
    state.categories = state.categories.filter(item => item.id !== deleteCategory.dataset.deleteCategory); saveState(); render(); showToast("Categoría eliminada");
  }
});
document.getElementById("expense-form").addEventListener("submit", event => {
  event.preventDefault();
  const recurring = document.getElementById("recurring-input").checked;
  const frequency = recurring ? document.getElementById("recurring-frequency").value : null;
  const expenseDate = recurring && frequency !== "monthly" ? todayISO() : document.getElementById("date-input").value;
  const monthlyDay = frequency === "monthly" ? Number(document.getElementById("recurring-monthly-day").value) : null;
  if (frequency === "monthly" && (!monthlyDay || monthlyDay < 1 || monthlyDay > 31)) return showToast("Indica un día de facturación entre 1 y 31.", true);
  const expenseDateValue = document.getElementById("date-input").value;
  if (!recurring) {
    const entered = new Date(`${expenseDateValue}T12:00:00`);
    if (!expenseDateValue || entered < getCycleStart() || entered > getCycleEnd()) return showToast(`La fecha debe estar dentro del ciclo actual: ${dateFormat(cycleDateKey(getCycleStart()))} al ${dateFormat(cycleDateKey(getCycleEnd()))}.`, true);
  }
  state.expenses.push({ id: crypto.randomUUID(), description: document.getElementById("description-input").value.trim(), amount: Number(document.getElementById("amount-input").value), categoryId: document.getElementById("category-input").value, date: expenseDate, recurring, frequency, weekday: frequency === "weekly" ? Number(document.getElementById("recurring-weekday").value) : null, monthlyDay });
  saveState(); event.target.reset(); closeModal("expense-modal"); render(); showToast("Gasto guardado correctamente");
});
document.getElementById("category-form").addEventListener("submit", event => {
  event.preventDefault(); const name = document.getElementById("category-name-input").value.trim();
  if (state.categories.some(category => category.name.toLowerCase() === name.toLowerCase() && category.id !== categoryToEdit)) return showToast("Ya existe una categoría con ese nombre.", true);
  if (categoryToEdit) {
    const category = state.categories.find(item => item.id === categoryToEdit);
    if (category) Object.assign(category, { name, color: selectedColor, icon: selectedIcon });
  } else state.categories.push({ id: `category-${Date.now()}`, name, color: selectedColor, icon: selectedIcon });
  const wasEditing = Boolean(categoryToEdit);
  saveState(); event.target.reset(); categoryToEdit = null; closeModal("category-modal"); render(); showToast(wasEditing ? "Categoría actualizada" : "Categoría creada");
});
document.getElementById("settings-form").addEventListener("submit", event => { event.preventDefault(); state.income = Number(document.getElementById("income-input").value); state.currentCycleIncome = null; state.cutoffDay = Number(document.getElementById("cutoff-input").value); saveState(); render(); showToast("Configuración guardada"); });
document.getElementById("advance-cycle-button").addEventListener("click", () => {
  if (state.dateMode !== "debug") return showToast("Activa la fecha DEBUG para avanzar el día.", true);
  const next = effectiveDate();
  next.setDate(next.getDate() + 1);
  state.debugDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  saveState();
  render();
  showToast(`Fecha DEBUG avanzada al ${dateFormat(state.debugDate)}.`);
});
document.getElementById("date-mode-input").addEventListener("change", event => {
  state.dateMode = event.target.value;
  if (state.dateMode === "debug" && !state.debugDate) state.debugDate = todayISO();
  saveState();
  render();
});
document.getElementById("save-debug-date-button").addEventListener("click", () => {
  const value = document.getElementById("debug-date-input").value;
  if (!value) return showToast("Selecciona una fecha DEBUG.", true);
  state.dateMode = "debug";
  state.debugDate = value;
  saveState();
  render();
  showToast("Fecha DEBUG guardada.");
});
document.getElementById("recurring-input").addEventListener("change", event => {
  document.getElementById("recurring-options").hidden = !event.target.checked;
  if (!event.target.checked) document.getElementById("expense-date-label").hidden = false;
  else updateRecurringFields(document.getElementById("recurring-frequency").value);
});
function updateRecurringFields(frequency) {
  const recurring = document.getElementById("recurring-input").checked;
  document.getElementById("recurring-weekday-label").hidden = !recurring || frequency !== "weekly";
  document.getElementById("recurring-monthly-date-label").hidden = !recurring || frequency !== "monthly";
  document.getElementById("expense-date-label").hidden = recurring;
  document.getElementById("date-input").required = !recurring;
}
document.getElementById("recurring-frequency").addEventListener("change", event => updateRecurringFields(event.target.value));
document.getElementById("recurring-edit-scope").addEventListener("change", updateRecurringEditHelp);
document.getElementById("recurring-edit-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!recurringToEdit) return;
  const amount = Number(document.getElementById("recurring-edit-amount").value);
  const scope = document.getElementById("recurring-edit-scope").value;
  const previousAmount = Number(recurringToEdit.amount);
  const previousWeekday = recurringToEdit.weekday;
  const nextWeekday = recurringToEdit.frequency === "weekly" ? Number(document.getElementById("recurring-edit-weekday").value) : recurringToEdit.weekday;
  const nextMonthlyDay = recurringToEdit.frequency === "monthly" ? Number(document.getElementById("recurring-edit-monthly-day").value) : recurringToEdit.monthlyDay;
  if (recurringToEdit.frequency === "monthly" && (!nextMonthlyDay || nextMonthlyDay < 1 || nextMonthlyDay > 31)) return showToast("Indica un día de facturación entre 1 y 31.", true);
  recurringToEdit.amount = amount;
  recurringToEdit.weekday = nextWeekday;
  if (recurringToEdit.frequency === "monthly") {
    recurringToEdit.monthlyDay = nextMonthlyDay;
  }
  if (scope === "cycle") {
    const cycleStart = getCycleStart().toISOString().slice(0, 10);
    state.expenses.forEach(item => {
      if (item.recurringSourceId === recurringToEdit.id && item.date >= cycleStart) item.amount = amount;
    });
    document.getElementById("expense-edit-reason").addEventListener("change", event => {
      const custom = event.target.value === "Otro";
      document.getElementById("expense-edit-custom-reason-label").hidden = !custom;
      document.getElementById("expense-edit-custom-reason").required = custom;
    });
    document.getElementById("expense-edit-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!expenseToEdit) return;
      const reason = getExpenseEditReason();
      if (!reason) return showToast("Selecciona o escribe una razón para la corrección.", true);
      const previousAmount = Number(expenseToEdit.amount);
      const previousDescription = expenseToEdit.description;
      expenseToEdit.description = document.getElementById("expense-edit-description").value.trim();
      expenseToEdit.amount = Number(document.getElementById("expense-edit-amount").value);
      expenseToEdit.categoryId = document.getElementById("expense-edit-category").value;
      expenseToEdit.modified = { reason, date: todayISO() };
      state.expenseHistory = state.expenseHistory || [];
      state.expenseHistory.push({ id: crypto.randomUUID(), expenseId: expenseToEdit.id, description: expenseToEdit.description || previousDescription, previousAmount, amount: expenseToEdit.amount, reason, date: todayISO() });
      saveState();
      closeModal("expense-edit-modal");
      render();
      showToast("Gasto corregido y registrado en el historial.");
    });
    state.recurringHistory = state.recurringHistory || [];
    state.recurringHistory.push({ id: crypto.randomUUID(), recurringId: recurringToEdit.id, description: recurringToEdit.description, previousAmount, amount, previousWeekday, weekday: nextWeekday, scope, date: todayISO() });
    showToast("Importe actualizado para todo el ciclo actual.");
  } else {
    showToast("Importe actualizado para las próximas confirmaciones.");
  }
  saveState();
  closeModal("recurring-edit-modal");
  render();
});
document.getElementById("income-action").addEventListener("change", updateIncomeForm);
document.getElementById("collective-config-form").addEventListener("submit", event => {
  event.preventDefault();
  const names = document.getElementById("collective-people").value.split(/\r?\n|,/).map(name => name.trim()).filter(Boolean);
  if (names.length < 2) return showToast("Indica al menos dos personas.", true);
  const unique = names.map(name => name.toLowerCase());
  if (new Set(unique).size !== unique.length) return showToast("Cada persona debe tener un nombre diferente.", true);
  const eventState = collectiveDraft();
  eventState.name = document.getElementById("collective-name").value.trim() || "Compra colectiva";
  eventState.people = names.map((name, index) => ({ id: eventState.people[index]?.id || crypto.randomUUID(), name }));
  eventState.expenses = eventState.expenses.filter(item => eventState.people.some(person => person.id === item.payerId));
  saveCollectiveDraft();
  showToast("Participantes configurados.");
});
document.getElementById("collective-expense-form").addEventListener("submit", event => {
  event.preventDefault();
  const eventState = collectiveDraft();
  const amount = Number(document.getElementById("collective-expense-amount").value);
  const reason = document.getElementById("collective-expense-reason").value.trim();
  const payerId = document.getElementById("collective-payer").value;
  if (!payerId || !amount || amount <= 0 || !reason) return showToast("Completa quién pagó, el importe y la razón.", true);
  eventState.expenses.push({ id: crypto.randomUUID(), payerId, amount, reason });
  saveCollectiveDraft();
  event.target.reset();
  showToast("Compra colectiva agregada.");
});
document.getElementById("collective-people").addEventListener("change", () => {});
document.getElementById("collective-receipt-button").addEventListener("click", printCollectiveReceipt);
document.getElementById("collective-reset-button").addEventListener("click", resetCollective);
document.addEventListener("click", event => {
  const deleteCollective = event.target.closest("[data-delete-collective-expense]");
  if (!deleteCollective) return;
  const eventState = collectiveDraft();
  eventState.expenses = eventState.expenses.filter(item => item.id !== deleteCollective.dataset.deleteCollectiveExpense);
  saveCollectiveDraft();
});
function openSavingsModal(action) {
  document.getElementById("savings-action").value = action;
  document.getElementById("savings-modal-title").textContent = action === "deposit" ? "Ingresar ahorro" : "Extraer ahorro";
  document.getElementById("savings-date").value = systemTodayISO();
  document.getElementById("savings-date-today").checked = true;
  openModal("savings-modal");
}
document.getElementById("deposit-savings-button").addEventListener("click", () => openSavingsModal("deposit"));
document.getElementById("withdraw-savings-button").addEventListener("click", () => openSavingsModal("withdrawal"));
document.getElementById("savings-action").addEventListener("change", event => {
  document.getElementById("savings-modal-title").textContent = event.target.value === "deposit" ? "Ingresar ahorro" : "Extraer ahorro";
});
document.getElementById("savings-date-today").addEventListener("change", event => {
  document.getElementById("savings-date").disabled = event.target.checked;
});
function systemTodayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
document.getElementById("savings-form").addEventListener("submit", event => {
  event.preventDefault();
  const type = document.getElementById("savings-action").value;
  const amount = Number(document.getElementById("savings-amount").value);
  const reason = document.getElementById("savings-reason").value.trim();
  const date = document.getElementById("savings-date-today").checked ? systemTodayISO() : document.getElementById("savings-date").value;
  if (!amount || amount <= 0 || !reason || !date) return showToast("Completa monto, razón y fecha.", true);
  if (type === "withdrawal" && amount > Number(state.savingsBalance || 0)) return showToast("No puedes extraer más que el ahorro disponible.", true);
  state.savingsBalance += type === "deposit" ? amount : -amount;
  state.savingsMovements = state.savingsMovements || [];
  state.savingsMovements.push({ id: crypto.randomUUID(), type: type === "deposit" ? "deposit" : "withdrawal", amount, reason, date });
  saveState();
  event.target.reset();
  document.getElementById("savings-date-today").checked = true;
  document.getElementById("savings-date").value = systemTodayISO();
  closeModal("savings-modal");
  render();
  showToast(type === "deposit" ? "Ahorro ingresado correctamente." : "Ahorro extraído correctamente.");
});
document.getElementById("income-reason").addEventListener("change", event => { document.getElementById("income-custom-reason-label").hidden = event.target.value !== "Otro"; document.getElementById("income-custom-reason").required = event.target.value === "Otro"; });
document.getElementById("income-form").addEventListener("submit", event => {
  event.preventDefault();
  const action = document.getElementById("income-action").value;
  const amount = Number(document.getElementById("income-change-amount").value);
  const reason = incomeReason();
  if (!reason) return showToast("Selecciona o escribe una razón para el cambio.", true);
  const entry = { id: crypto.randomUUID(), amount, reason, date: todayISO(), cutoffDay: state.cutoffDay, type: action };
  if (action === "next") {
    entry.cutoffDay = Number(document.getElementById("income-change-cutoff").value);
    entry.effectiveDate = nextCycleDate().toISOString().slice(0, 10);
    state.pendingIncome = entry;
    showToast("El nuevo ingreso se aplicará al próximo ciclo.");
  } else if (action === "current") {
    state.currentCycleIncome = amount;
    state.incomeNotice = `Este monto fue seteado el ${dateFormat(todayISO())}. Razón: ${reason}.`;
    state.incomeHistory.push(entry);
    showToast("Monto actual actualizado.");
  } else {
    state.currentCycleIncome = currentIncome() + amount;
    state.incomeNotice = `Se sumaron ${money(amount)} el ${dateFormat(todayISO())}. Razón: ${reason}.`;
    state.incomeHistory.push(entry);
    showToast("Adición aplicada al monto actual.");
  }
  saveState();
  closeModal("income-modal");
  render();
});
document.getElementById("welcome-form").addEventListener("submit", event => {
  event.preventDefault();
  state.income = Number(document.getElementById("welcome-income-input").value);
  state.cutoffDay = Number(document.getElementById("welcome-cutoff-input").value);
  state.onboardingComplete = true;
  state.lastCycleStart = cycleDateKey(getCycleStart());
  state.incomeHistory.push({ id: crypto.randomUUID(), amount: state.income, reason: "Configuración inicial", date: todayISO(), cutoffDay: state.cutoffDay, type: "current" });
  saveState();
  closeModal("welcome-modal");
  render();
  showToast("¡Listo! Tu presupuesto ya está configurado.");
});
document.getElementById("expense-search").addEventListener("input", renderExpenses);
document.getElementById("expense-filter").addEventListener("change", renderExpenses);
document.getElementById("stats-period").addEventListener("change", renderStatistics);
document.getElementById("pdf-button").addEventListener("click", () => { navigate("reports"); setTimeout(() => window.print(), 100); });
document.getElementById("export-button").addEventListener("click", exportBackup);
document.getElementById("restore-button").addEventListener("click", () => document.getElementById("import-file").click());
document.getElementById("import-button").addEventListener("click", () => document.getElementById("import-file").click());
document.getElementById("welcome-import-button").addEventListener("click", () => document.getElementById("welcome-import-file").click());
document.getElementById("welcome-import-file").addEventListener("change", event => {
  welcomeImportFile = event.target.files[0] || null;
  const confirm = document.getElementById("welcome-import-confirm");
  document.getElementById("welcome-import-status").textContent = welcomeImportFile ? `${welcomeImportFile.name} seleccionado. Confirma para restaurar los datos.` : "Después de seleccionarlo, confirma la importación.";
  confirm.hidden = !welcomeImportFile;
  event.target.value = "";
});
document.getElementById("welcome-import-confirm").addEventListener("click", () => {
  if (!welcomeImportFile) return;
  importBackup(welcomeImportFile);
  welcomeImportFile = null;
  document.getElementById("welcome-import-confirm").hidden = true;
});
document.getElementById("import-file").addEventListener("change", event => { if (event.target.files[0]) importBackup(event.target.files[0]); event.target.value = ""; });
document.getElementById("reset-system-button").addEventListener("click", () => openModal("reset-modal"));
document.getElementById("reset-form").addEventListener("submit", event => {
  event.preventDefault();
  if (document.getElementById("reset-password").value !== "cris") return showToast("Contraseña incorrecta.", true);
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  event.target.reset();
  closeModal("reset-modal");
  navigate("dashboard");
  render();
  showToast("Sistema reiniciado. Comienza una nueva configuración.");
});
document.getElementById("check-update-button").addEventListener("click", () => checkForUpdate(true, true));
document.getElementById("dark-mode-toggle").addEventListener("change", event => {
  state.darkMode = event.target.checked;
  saveState();
  document.body.classList.toggle("dark-mode", state.darkMode);
});
document.getElementById("export-update-button").addEventListener("click", () => {
  exportBackup();
  updateBackupExported = true;
  document.getElementById("continue-update-button").disabled = false;
  showToast("Respaldo exportado. Ya puedes continuar.");
});
document.getElementById("dismiss-update-button").addEventListener("click", () => {
  if (availableUpdate?.version) localStorage.setItem("saldo-dismissed-update", availableUpdate.version);
  closeModal("update-modal");
  showToast("Podrás actualizar cuando quieras desde Configuración → Actualizaciones.");
});
document.getElementById("continue-update-button").addEventListener("click", () => {
  if (!updateBackupExported || !availableUpdate) return;
  const button = document.getElementById("continue-update-button");
  button.disabled = true;
  button.textContent = "Instalando actualización…";
  availableUpdate.downloadAndInstall()
    .then(() => window.__TAURI__?.process?.relaunch?.())
    .catch(() => {
      button.disabled = false;
      button.textContent = "2. Instalar actualización";
      showToast("No se pudo instalar la actualización. Puedes intentarlo nuevamente.", true);
    });
});
window.addEventListener("click", event => { if (event.target.classList.contains("modal-backdrop")) closeModal(event.target.id); });
render();
setTimeout(() => checkForUpdate(false, false), 1200);

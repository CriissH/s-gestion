const STORAGE_KEY = "saldo-expenses-v1";
const APP_VERSION = "1.0.0";
const VERSION_URL = "https://raw.githubusercontent.com/CriissH/s-getion/main/version.json";
const palette = ["#177b55", "#ed9c54", "#8b7ee7", "#5c9ee8", "#d95f59", "#51a68b", "#c77bcb", "#a1a85d"];
const icons = ["⌂", "▣", "◇", "✦", "♧", "●", "◆", "◉"];
const defaultState = {
  income: 0,
  cutoffDay: 1,
  onboardingComplete: false,
  pendingIncome: null,
  incomeHistory: [],
  recurringConfirmations: {},
  expenseHistory: [],
  categories: [
    { id: "food", name: "Alimentación", color: "#177b55", icon: "▣" },
    { id: "home", name: "Hogar", color: "#ed9c54", icon: "⌂" },
    { id: "transport", name: "Transporte", color: "#8b7ee7", icon: "◇" },
    { id: "leisure", name: "Ocio", color: "#5c9ee8", icon: "✦" }
  ],
  expenses: []
};

let state = loadState();
let selectedColor = palette[0];
let expenseToDelete = null;
let recurringToEdit = null;
let expenseToEdit = null;
let availableUpdate = null;
let updateBackupExported = false;
const money = value => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value || 0);
const dateFormat = value => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)).replace(".", "");
const todayISO = () => new Date().toISOString().slice(0, 10);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    const expenses = (saved.expenses || []).map(item => item.recurring && !item.frequency ? { ...item, frequency: "daily", weekday: null } : item);
    return { ...defaultState, ...saved, onboardingComplete: saved.onboardingComplete ?? Number(saved.income) > 0, categories: saved.categories || defaultState.categories, expenses, incomeHistory: saved.incomeHistory || [], recurringConfirmations: saved.recurringConfirmations || {}, expenseHistory: saved.expenseHistory || [] };
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
function getCycleStart() {
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth();
  if (now.getDate() < Number(state.cutoffDay || 1)) month -= 1;
  return new Date(year, month, Number(state.cutoffDay || 1));
}
function isCurrentCycle(expense) { return new Date(`${expense.date}T12:00:00`) >= getCycleStart(); }
function currentExpenses() { return state.expenses.filter(isCurrentCycle); }
function confirmedExpenses() { return currentExpenses().filter(item => !item.recurring); }
function todayDate() { return new Date(); }
function todayKey() { return todayISO(); }
function recurringTemplatesForToday() {
  const day = todayDate().getDay();
  return state.expenses.filter(item => item.recurring && (item.frequency === "daily" || (item.frequency === "weekly" && Number(item.weekday) === day)));
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
function render() {
  applyPendingIncome();
  renderDashboard();
  renderExpenses();
  renderCategories();
  renderStatistics();
  renderReports();
  renderSettings();
  updateCycle();
  renderSidebarRecurring();
  renderRecurringConfirmation();
  document.getElementById("installed-version").textContent = APP_VERSION;
  if (!state.onboardingComplete) {
    document.getElementById("welcome-modal").hidden = false;
    setTimeout(() => document.getElementById("welcome-income-input").focus(), 0);
  }
}
async function checkForUpdate(showNoUpdate = false) {
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo consultar la versión");
    const remote = await response.json();
    if (remote.version && remote.version !== APP_VERSION && remote.version !== localStorage.getItem("saldo-dismissed-update")) {
      availableUpdate = remote;
      updateBackupExported = false;
      document.getElementById("update-message").textContent = `Está disponible la versión ${remote.version}. ${remote.releaseNotes || ""}`;
      document.getElementById("continue-update-button").disabled = true;
      openModal("update-modal");
    } else if (showNoUpdate) showToast("Ya tienes la última versión.");
  } catch {
    if (showNoUpdate) showToast("No se pudo consultar actualizaciones. Comprueba tu conexión.", true);
  }
}
function renderDashboard() {
  const expenses = confirmedExpenses(), spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const remaining = Number(state.income || 0) - spent, budget = Number(state.income || 0);
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
    return `<div class="recurring-item"><div class="recurring-item-icon" style="background:${category.color}20;color:${category.color}">${category.icon}</div><div class="recurring-item-info"><strong>${escapeHtml(template.description)}</strong><span>${escapeHtml(category.name)} · ${template.frequency === "daily" ? "Diario" : "Semanal"}</span></div><b>${money(template.amount)}</b><button class="confirm-button yes" data-confirm-recurring="${template.id}" title="Sí, lo gasté">✓</button><button class="confirm-button no" data-reject-recurring="${template.id}" title="No lo gasté">×</button></div>`;
  }).join("");
}
function renderSidebarRecurring() {
  const templates = state.expenses.filter(item => item.recurring);
  document.getElementById("sidebar-recurring-count").textContent = templates.length;
  document.getElementById("sidebar-recurring-empty").hidden = templates.length > 0;
  document.getElementById("sidebar-recurring-list").innerHTML = templates.map(template => {
    const category = getCategory(template.categoryId);
    const frequency = template.frequency === "daily" ? "Diario" : `Cada ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][Number(template.weekday)] || "semana"}`;
    return `<button class="sidebar-recurring-item" data-edit-recurring="${template.id}"><span class="sidebar-recurring-dot" style="background:${category.color}"></span><span class="sidebar-recurring-info"><strong>${escapeHtml(template.description)}</strong><small>${frequency} · ${money(template.amount)}</small></span><span class="sidebar-edit-icon">✎</span></button>`;
  }).join("");
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
    return `<article class="category-card"><button class="category-menu" data-delete-category="${category.id}" title="Eliminar categoría">⋯</button><div class="category-icon" style="color:${category.color};background:${category.color}20">${category.icon || icons[index % icons.length]}</div><strong>${escapeHtml(category.name)}</strong><span>${summary}</span></article>`;
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
  document.getElementById("report-summary").innerHTML = `<div class="summary-grid"><div class="summary-box"><span>Ingreso mensual</span><strong>${money(state.income)}</strong></div><div class="summary-box"><span>Gastos del ciclo</span><strong>${money(spent)}</strong></div><div class="summary-box"><span>Presupuesto restante</span><strong>${money(Number(state.income) - spent)}</strong></div></div>`;
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
function renderSettings() { document.getElementById("income-input").value = state.income || ""; document.getElementById("cutoff-input").value = state.cutoffDay || 1; }
function updateCycle() {
  const start = getCycleStart(), end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);
  document.getElementById("cycle-label").textContent = state.income ? `${dateFormat(start.toISOString().slice(0, 10))} – ${dateFormat(end.toISOString().slice(0, 10))}` : "Sin configurar";
  document.getElementById("cycle-date").textContent = state.income ? `Corte el día ${state.cutoffDay}` : "Configura tu fecha de corte";
  document.getElementById("current-date").textContent = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}
function nextCycleDate() {
  const start = getCycleStart();
  return new Date(start.getFullYear(), start.getMonth() + 1, Number(state.cutoffDay || 1));
}
function applyPendingIncome() {
  if (!state.pendingIncome || new Date() < new Date(`${state.pendingIncome.effectiveDate}T00:00:00`)) return;
  const pending = state.pendingIncome;
  state.income = pending.amount;
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
  const titles = { dashboard: "Resumen financiero", statistics: "Estadísticas", expenses: "Gastos", categories: "Categorías", reports: "Reportes y respaldos", settings: "Configuración" };
  document.getElementById("page-title").textContent = titles[view];
}
function exportBackup() {
  const payload = JSON.stringify(state);
  const rows = [["Saldo - Respaldo de datos"], ["Este archivo puede volver a cargarse en Saldo"], [], ["Tipo", "Descripción", "Importe", "Categoría", "Fecha", "Recurrente"], ...state.expenses.map(item => ["Gasto", item.description, item.amount, getCategory(item.categoryId).name, item.date, item.recurring ? "Sí" : "No"])];
  const html = `<html><head><meta charset="UTF-8"></head><body><table>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table><!--SALDO_BACKUP:${btoa(unescape(encodeURIComponent(payload)))}--></body></html>`;
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
      const imported = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      if (!Array.isArray(imported.categories) || !Array.isArray(imported.expenses)) throw new Error("Datos inválidos");
      state = { ...defaultState, ...imported }; saveState(); render(); showToast("Datos restaurados correctamente");
    } catch { showToast("No se pudo leer el respaldo. Usa un archivo exportado desde Saldo.", true); }
  };
  reader.readAsText(file);
}
function buildColorPicker() { document.getElementById("color-picker").innerHTML = palette.map(color => `<button type="button" class="color-option ${color === selectedColor ? "selected" : ""}" style="background:${color}" data-color="${color}" aria-label="Seleccionar color"></button>`).join(""); }

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) navigate(nav.dataset.view);
  const link = event.target.closest("[data-view-link]");
  if (link) navigate(link.dataset.viewLink);
  const close = event.target.closest("[data-close-modal]");
  if (close) closeModal(close.dataset.closeModal);
  if (event.target.id === "new-expense-button" || event.target.id === "new-expense-button-2") { populateCategorySelect(); document.getElementById("date-input").value = todayISO(); document.getElementById("recurring-options").hidden = true; document.getElementById("recurring-weekday-label").hidden = true; openModal("expense-modal"); }
  if (event.target.id === "income-button") { updateIncomeForm(); openModal("income-modal"); }
  const editRecurring = event.target.closest("[data-edit-recurring]");
  if (editRecurring) openRecurringEditor(editRecurring.dataset.editRecurring);
  const editExpense = event.target.closest("[data-edit-expense]");
  if (editExpense) openExpenseEditor(editExpense.dataset.editExpense);
  if (event.target.id === "pending-banner-button") document.getElementById("recurring-bar").scrollIntoView({ behavior: "smooth", block: "end" });
  const confirmButton = event.target.closest("[data-confirm-recurring]");
  if (confirmButton) confirmRecurring(confirmButton.dataset.confirmRecurring, true);
  const rejectButton = event.target.closest("[data-reject-recurring]");
  if (rejectButton) confirmRecurring(rejectButton.dataset.rejectRecurring, false);
  if (event.target.id === "new-category-button") { buildColorPicker(); openModal("category-modal"); }
  const color = event.target.closest("[data-color]");
  if (color) { selectedColor = color.dataset.color; buildColorPicker(); }
  const deleteButton = event.target.closest("[data-delete-expense]");
  if (deleteButton) { expenseToDelete = deleteButton.dataset.deleteExpense; openModal("delete-modal"); }
  if (event.target.id === "confirm-delete") { state.expenses = state.expenses.filter(item => item.id !== expenseToDelete); saveState(); closeModal("delete-modal"); render(); showToast("Gasto eliminado"); }
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
  state.expenses.push({ id: crypto.randomUUID(), description: document.getElementById("description-input").value.trim(), amount: Number(document.getElementById("amount-input").value), categoryId: document.getElementById("category-input").value, date: document.getElementById("date-input").value, recurring, frequency: recurring ? document.getElementById("recurring-frequency").value : null, weekday: recurring ? Number(document.getElementById("recurring-weekday").value) : null });
  saveState(); event.target.reset(); closeModal("expense-modal"); render(); showToast("Gasto guardado correctamente");
});
document.getElementById("category-form").addEventListener("submit", event => {
  event.preventDefault(); const name = document.getElementById("category-name-input").value.trim();
  if (state.categories.some(category => category.name.toLowerCase() === name.toLowerCase())) return showToast("Ya existe una categoría con ese nombre.", true);
  state.categories.push({ id: `category-${Date.now()}`, name, color: selectedColor, icon: icons[state.categories.length % icons.length] }); saveState(); event.target.reset(); closeModal("category-modal"); render(); showToast("Categoría creada");
});
document.getElementById("settings-form").addEventListener("submit", event => { event.preventDefault(); state.income = Number(document.getElementById("income-input").value); state.cutoffDay = Number(document.getElementById("cutoff-input").value); saveState(); render(); showToast("Configuración guardada"); });
document.getElementById("recurring-input").addEventListener("change", event => { document.getElementById("recurring-options").hidden = !event.target.checked; });
document.getElementById("recurring-frequency").addEventListener("change", event => { document.getElementById("recurring-weekday-label").hidden = event.target.value !== "weekly"; });
document.getElementById("recurring-edit-scope").addEventListener("change", updateRecurringEditHelp);
document.getElementById("recurring-edit-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!recurringToEdit) return;
  const amount = Number(document.getElementById("recurring-edit-amount").value);
  const scope = document.getElementById("recurring-edit-scope").value;
  const previousAmount = Number(recurringToEdit.amount);
  const previousWeekday = recurringToEdit.weekday;
  const nextWeekday = recurringToEdit.frequency === "weekly" ? Number(document.getElementById("recurring-edit-weekday").value) : recurringToEdit.weekday;
  recurringToEdit.amount = amount;
  recurringToEdit.weekday = nextWeekday;
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
    state.income = amount;
    state.incomeNotice = `Este monto fue seteado el ${dateFormat(todayISO())}. Razón: ${reason}.`;
    state.incomeHistory.push(entry);
    showToast("Monto actual actualizado.");
  } else {
    state.income += amount;
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
document.getElementById("check-update-button").addEventListener("click", () => checkForUpdate(true));
document.getElementById("export-update-button").addEventListener("click", () => {
  exportBackup();
  updateBackupExported = true;
  document.getElementById("continue-update-button").disabled = false;
  showToast("Respaldo exportado. Ya puedes continuar.");
});
document.getElementById("dismiss-update-button").addEventListener("click", () => {
  if (availableUpdate?.version) localStorage.setItem("saldo-dismissed-update", availableUpdate.version);
  closeModal("update-modal");
});
document.getElementById("continue-update-button").addEventListener("click", () => {
  if (!updateBackupExported || !availableUpdate) return;
  closeModal("update-modal");
  showToast("Respaldo confirmado. Descarga la nueva versión para reemplazar esta carpeta.");
  window.open(availableUpdate.downloadUrl || "https://github.com/CriissH/s-getion", "_blank", "noopener");
});
window.addEventListener("click", event => { if (event.target.classList.contains("modal-backdrop")) closeModal(event.target.id); });
render();
setTimeout(() => checkForUpdate(false), 1200);

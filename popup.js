// popup.js — controls the settings UI and tab list

async function getSettings() {
  return chrome.storage.local.get({
    enabled: true,
    timerMinutes: 15,
    protectedTabIds: []
  });
}

async function saveSettings(updates) {
  const current = await getSettings();
  return chrome.storage.local.set({ ...current, ...updates });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const settings = await getSettings();

  // Enable/disable toggle
  const enableToggle = document.getElementById("enable-toggle");
  enableToggle.checked = settings.enabled;
  setDisabledState(!settings.enabled);

  enableToggle.addEventListener("change", async () => {
    await saveSettings({ enabled: enableToggle.checked });
    setDisabledState(!enableToggle.checked);
  });

  // Timer input
  const timerInput = document.getElementById("timer-input");
  timerInput.value = settings.timerMinutes;

  timerInput.addEventListener("change", async () => {
    const val = Math.max(1, Math.min(120, parseInt(timerInput.value) || 15));
    timerInput.value = val;
    await saveSettings({ timerMinutes: val });
  });

  await renderTabList(settings.protectedTabIds);
}

// Dim the timer row when the extension is disabled
function setDisabledState(disabled) {
  document.getElementById("timer-row").classList.toggle("dimmed", disabled);
}

// ── Tab list ──────────────────────────────────────────────────────────────────

async function renderTabList(protectedTabIds) {
  const tabList = document.getElementById("tab-list");
  const statsEl = document.getElementById("stats");
  tabList.innerHTML = "";

  const windows = await chrome.windows.getAll({ populate: true });

  let sleepingCount = 0;
  let protectedCount = 0;

  for (const win of windows) {
    // If the user has multiple windows, label each group
    if (windows.length > 1) {
      const header = document.createElement("div");
      header.className = "window-label";
      const label = win.state === "minimized" ? "Window (minimized)" : "Window";
      header.textContent = label;
      tabList.appendChild(header);
    }

    for (const tab of win.tabs) {
      if (tab.discarded) sleepingCount++;
      if (protectedTabIds.includes(tab.id)) protectedCount++;

      tabList.appendChild(buildTabRow(tab, protectedTabIds));
    }
  }

  // Summary line
  const parts = [];
  if (sleepingCount > 0) parts.push(`${sleepingCount} sleeping`);
  if (protectedCount > 0) parts.push(`${protectedCount} protected`);
  statsEl.textContent = parts.length > 0 ? parts.join(" · ") : "No tabs sleeping yet";
}

function buildTabRow(tab, protectedTabIds) {
  const isProtected = protectedTabIds.includes(tab.id);
  const { label, cls } = getStatusInfo(tab, isProtected);

  const row = document.createElement("div");
  row.className = "tab-row";

  // Favicon
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src = tab.favIconUrl || "icons/icon16.png";
  favicon.onerror = () => { favicon.src = "icons/icon16.png"; };

  // Title
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title || tab.url || "New Tab";
  title.title = tab.title || tab.url || "";  // full title on hover

  // Status badge
  const badge = document.createElement("span");
  badge.className = `tab-badge ${cls}`;
  badge.textContent = label;

  // Lock button — lets user manually protect or unprotect a tab
  // Disabled for tabs that are already safe by other conditions
  const autoSafe = tab.active || tab.pinned || tab.audible;
  const lockBtn = document.createElement("button");
  lockBtn.className = `lock-btn${isProtected ? " is-locked" : ""}`;
  lockBtn.title = isProtected ? "Remove protection" : "Protect this tab";
  lockBtn.textContent = isProtected ? "🔒" : "🔓";
  lockBtn.disabled = autoSafe;

  lockBtn.addEventListener("click", async () => {
    const { protectedTabIds: current } = await getSettings();
    const updated = current.includes(tab.id)
      ? current.filter(id => id !== tab.id)
      : [...current, tab.id];
    await saveSettings({ protectedTabIds: updated });
    await renderTabList(updated);
  });

  row.appendChild(favicon);
  row.appendChild(title);
  row.appendChild(badge);
  row.appendChild(lockBtn);

  return row;
}

// Determine the status label and CSS class for a tab
function getStatusInfo(tab, isProtected) {
  if (tab.active)    return { label: "Active",     cls: "badge-active" };
  if (tab.audible)   return { label: "Playing",    cls: "badge-playing" };
  if (tab.discarded) return { label: "Sleeping",   cls: "badge-sleeping" };
  if (tab.pinned)    return { label: "Pinned",      cls: "badge-pinned" };
  if (isProtected)   return { label: "Protected",  cls: "badge-protected" };
                     return { label: "Background", cls: "badge-background" };
}

document.addEventListener("DOMContentLoaded", init);

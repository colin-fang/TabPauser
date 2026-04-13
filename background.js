// background.js — service worker
// Runs in the background. Manages timers and decides when to discard tabs.
//
// Key concept: chrome.alarms are used instead of setTimeout because service
// workers can be killed by Chrome at any time. Alarms persist and will wake
// the service worker back up when they fire.

const ALARM_PREFIX = "pause-tab-";

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.local.get({
    enabled: true,
    timerMinutes: 15,
    protectedTabIds: []
  });
}

// ── Timer management ──────────────────────────────────────────────────────────

async function scheduleTabPause(tabId) {
  const { enabled, timerMinutes } = await getSettings();
  if (!enabled) return;

  // Only create an alarm if one isn't already running for this tab.
  // Exception: when called after a full reschedule (timer changed), all
  // alarms were already cleared before this runs, so this guard is a no-op.
  const existing = await chrome.alarms.get(ALARM_PREFIX + tabId);
  if (existing) return;

  chrome.alarms.create(ALARM_PREFIX + tabId, { delayInMinutes: timerMinutes });
}

function cancelTabPause(tabId) {
  chrome.alarms.clear(ALARM_PREFIX + tabId);
}

// ── Discard gate — all conditions must pass ───────────────────────────────────

async function shouldDiscard(tab) {
  if (!tab) return false;

  // Currently visible to the user in its window
  if (tab.active) return false;

  // User deliberately pinned this tab
  if (tab.pinned) return false;

  // Audio or video is actively playing
  if (tab.audible) return false;

  // Chrome (or us) already freed this tab's memory
  if (tab.discarded) return false;

  // Still fetching the page — discarding mid-load would interrupt it
  if (tab.status === "loading") return false;

  // User manually protected this tab via the popup
  const { protectedTabIds } = await getSettings();
  if (protectedTabIds.includes(tab.id)) return false;

  return true;
}

// ── Alarm handler — fires when a tab's timer expires ─────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const tabId = parseInt(alarm.name.slice(ALARM_PREFIX.length));

  try {
    const tab = await chrome.tabs.get(tabId);
    if (await shouldDiscard(tab)) {
      chrome.tabs.discard(tabId);
    }
  } catch {
    // Tab was closed before the alarm fired — nothing to do
  }
});

// ── Tab event listeners ───────────────────────────────────────────────────────

// User switches to a tab: cancel its countdown, and make sure all other
// background tabs in that window have countdowns running.
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  cancelTabPause(tabId);

  // Find background tabs in this window that don't have an alarm yet.
  // This handles the case where the service worker was restarted and lost
  // its in-memory state — we recover by checking what alarms exist.
  const bgTabs = await chrome.tabs.query({ windowId, active: false });
  for (const tab of bgTabs) {
    if (tab.discarded || tab.pinned) continue;
    const alarm = await chrome.alarms.get(ALARM_PREFIX + tab.id);
    if (!alarm) scheduleTabPause(tab.id);
  }
});

// Tab finishes loading: reset its timer (content changed, treat as fresh)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (tab.active) return;

  cancelTabPause(tabId);
  scheduleTabPause(tabId);
});

// Tab closed: clean up its alarm so it doesn't fire into the void
chrome.tabs.onRemoved.addListener((tabId) => {
  cancelTabPause(tabId);
});

// ── Startup / install ─────────────────────────────────────────────────────────

// Schedule all currently inactive tabs when the extension is first installed
// or updated, and when the browser starts fresh.
async function scheduleAllInactiveTabs() {
  const tabs = await chrome.tabs.query({ active: false, discarded: false });
  for (const tab of tabs) {
    scheduleTabPause(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(scheduleAllInactiveTabs);
chrome.runtime.onStartup.addListener(scheduleAllInactiveTabs);

// ── Settings change listener ──────────────────────────────────────────────────

chrome.storage.onChanged.addListener(async (changes) => {
  // Timer duration changed: clear all existing alarms and reschedule from scratch
  // so tabs immediately count down from the new duration, not the old one.
  if (changes.timerMinutes) {
    const allAlarms = await chrome.alarms.getAll();
    for (const alarm of allAlarms) {
      if (alarm.name.startsWith(ALARM_PREFIX)) chrome.alarms.clear(alarm.name);
    }
    await scheduleAllInactiveTabs();
  }

  // Extension toggled off: cancel every pending alarm
  // Extension toggled on: start timers for all inactive tabs
  if (changes.enabled) {
    if (!changes.enabled.newValue) {
      const allAlarms = await chrome.alarms.getAll();
      for (const alarm of allAlarms) {
        if (alarm.name.startsWith(ALARM_PREFIX)) chrome.alarms.clear(alarm.name);
      }
    } else {
      await scheduleAllInactiveTabs();
    }
  }
});

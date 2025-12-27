// background.js - Service worker for Focus Cost Tracker

importScripts('utils.js');

// Default session state
const DEFAULT_STATE = {
  isRunning: false,
  startTimeMs: null,
  lastTickMs: null,

  primaryTabId: null,
  primaryDomain: null,
  primaryTitle: null,

  allowedTabIds: [],
  allowedDomains: [],

  activeTabId: null,
  activeDomain: null,

  switchCount: 0,
  awayTimeMs: 0,

  chromeFocused: true,
  idleState: 'active',

  lockEnabled: false,

  lastSessionSummary: null
};

let sessionState = { ...DEFAULT_STATE };
let tickerInterval = null;
let previousWasAllowed = false; // Track previous allowed state for switch counting

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(() => {
  loadSessionState();
  chrome.idle.setDetectionInterval(60);
});

chrome.runtime.onStartup.addListener(() => {
  loadSessionState();
  chrome.idle.setDetectionInterval(60);
});

// Load session state from storage
async function loadSessionState() {
  const result = await chrome.storage.local.get('sessionState');
  if (result.sessionState) {
    sessionState = { ...DEFAULT_STATE, ...result.sessionState };
    if (sessionState.isRunning) {
      sessionState.lastTickMs = safeNowMs();
      await saveSessionState();
      startTicker();
      previousWasAllowed = isTabAllowed(sessionState.activeTabId, sessionState.activeDomain);
    }
  }
}

// Save session state to storage
async function saveSessionState() {
  await chrome.storage.local.set({ sessionState });
}

// Check if a tab is allowed
function isTabAllowed(tabId, domain) {
  if (tabId && sessionState.allowedTabIds.includes(tabId)) {
    return true;
  }
  if (domain && sessionState.allowedDomains.includes(domain)) {
    return true;
  }
  return false;
}

// Check if currently in focused state
function isFocusedState() {
  return (
    sessionState.isRunning &&
    sessionState.chromeFocused &&
    sessionState.idleState === 'active' &&
    isTabAllowed(sessionState.activeTabId, sessionState.activeDomain)
  );
}

// Update time accounting
async function updateTime() {
  if (!sessionState.isRunning || sessionState.lastTickMs === null) {
    return;
  }

  const nowMs = safeNowMs();
  const delta = nowMs - sessionState.lastTickMs;

  if (!isFocusedState()) {
    sessionState.awayTimeMs += delta;
  }

  sessionState.lastTickMs = nowMs;
  await saveSessionState();
}

// Start the continuous ticker
function startTicker() {
  if (tickerInterval) {
    return;
  }
  tickerInterval = setInterval(async () => {
    await updateTime();
  }, 1000);
}

// Stop the continuous ticker
function stopTicker() {
  if (tickerInterval) {
    clearInterval(tickerInterval);
    tickerInterval = null;
  }
}

// Update active tab tracking and domain
async function updateActiveTab(tabId) {
  sessionState.activeTabId = tabId;

  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      sessionState.activeDomain = getDomainFromUrl(tab.url);
    } catch (error) {
      sessionState.activeDomain = null;
    }
  } else {
    sessionState.activeDomain = null;
  }
}

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (sessionState.isRunning) {
    await updateTime();
  }

  const previousTabId = sessionState.activeTabId;
  const previousDomain = sessionState.activeDomain;

  await updateActiveTab(activeInfo.tabId);

  if (sessionState.isRunning) {
    // Check switch count logic
    const previousAllowed = isTabAllowed(previousTabId, previousDomain);
    const currentAllowed = isTabAllowed(sessionState.activeTabId, sessionState.activeDomain);

    if (previousTabId !== null && previousAllowed !== currentAllowed) {
      sessionState.switchCount++;
    }

    sessionState.lastTickMs = safeNowMs();
    await saveSessionState();

    // Enforce focus lock if enabled
    if (sessionState.lockEnabled) {
      await enforceFocusLock(activeInfo.tabId);
    }
  }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Update primary tab info if it changed
  if (tabId === sessionState.primaryTabId) {
    if (changeInfo.url && changeInfo.url !== sessionState.primaryUrl) {
      sessionState.primaryUrl = changeInfo.url;
      sessionState.primaryDomain = getDomainFromUrl(changeInfo.url);
      await saveSessionState();
    }
    if (changeInfo.title && changeInfo.title !== sessionState.primaryTitle) {
      sessionState.primaryTitle = changeInfo.title;
      await saveSessionState();
    }
  }

  // Update active domain if active tab URL changed
  if (tabId === sessionState.activeTabId && changeInfo.url) {
    sessionState.activeDomain = getDomainFromUrl(changeInfo.url);
    await saveSessionState();
  }

  // Enforce focus lock on URL changes
  if (sessionState.isRunning && sessionState.lockEnabled &&
      changeInfo.url && tabId === sessionState.activeTabId) {
    await enforceFocusLock(tabId);
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (sessionState.allowedTabIds.includes(tabId)) {
    sessionState.allowedTabIds = sessionState.allowedTabIds.filter(id => id !== tabId);
  }

  if (tabId === sessionState.primaryTabId) {
    if (sessionState.isRunning) {
      await updateTime();
    }
    sessionState.primaryTabId = null;
    sessionState.primaryUrl = null;
    sessionState.primaryDomain = null;
    sessionState.primaryTitle = null;
  }

  if (tabId === sessionState.activeTabId) {
    sessionState.activeTabId = null;
    sessionState.activeDomain = null;
  }

  if (sessionState.isRunning) {
    sessionState.lastTickMs = safeNowMs();
  }

  await saveSessionState();
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (sessionState.isRunning) {
    await updateTime();
  }

  sessionState.chromeFocused = windowId !== chrome.windows.WINDOW_ID_NONE;

  if (sessionState.isRunning) {
    sessionState.lastTickMs = safeNowMs();
    await saveSessionState();
  }
});

// Handle idle state changes
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (sessionState.isRunning) {
    await updateTime();
  }

  sessionState.idleState = newState;

  if (sessionState.isRunning) {
    sessionState.lastTickMs = safeNowMs();
    await saveSessionState();
  }
});

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'setPrimaryToCurrentTab':
      await setPrimaryToCurrentTab();
      sendResponse({ success: true, state: sessionState });
      break;

    case 'startSession':
      await startSession();
      sendResponse({ success: true, state: sessionState });
      break;

    case 'stopSession':
      await stopSession();
      sendResponse({ success: true, state: sessionState });
      break;

    case 'getSessionState':
      if (sessionState.isRunning) {
        await updateTime();
        sessionState.lastTickMs = safeNowMs();
        await saveSessionState();
      }
      sendResponse({ success: true, state: sessionState });
      break;

    case 'setLockEnabled':
      sessionState.lockEnabled = message.enabled;
      await saveSessionState();
      sendResponse({ success: true, state: sessionState });
      break;

    case 'addAllowedTab':
      await addAllowedTab(message.tabId);
      sendResponse({ success: true, state: sessionState });
      break;

    case 'removeAllowedTab':
      await removeAllowedTab(message.tabId);
      sendResponse({ success: true, state: sessionState });
      break;

    case 'addAllowedDomain':
      await addAllowedDomain(message.domain);
      sendResponse({ success: true, state: sessionState });
      break;

    case 'removeAllowedDomain':
      await removeAllowedDomain(message.domain);
      sendResponse({ success: true, state: sessionState });
      break;

    case 'isLockedPage':
      sendResponse({
        success: true,
        isLocked: sessionState.isRunning && sessionState.lockEnabled
      });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
}

// Set current tab as primary
async function setPrimaryToCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) {
    return;
  }

  const tab = tabs[0];
  sessionState.primaryTabId = tab.id;
  sessionState.primaryUrl = tab.url;
  sessionState.primaryDomain = getDomainFromUrl(tab.url);
  sessionState.primaryTitle = tab.title;

  // Auto-add primary to allowed tabs
  if (!sessionState.allowedTabIds.includes(tab.id)) {
    sessionState.allowedTabIds.push(tab.id);
  }

  await saveSessionState();
}

// Start a focus session
async function startSession() {
  if (sessionState.isRunning) {
    return;
  }

  const nowMs = safeNowMs();
  sessionState.isRunning = true;
  sessionState.startTimeMs = nowMs;
  sessionState.lastTickMs = nowMs;
  sessionState.switchCount = 0;
  sessionState.awayTimeMs = 0;

  // Get current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    await updateActiveTab(tabs[0].id);
  }

  // Get current window focus state
  const currentWindow = await chrome.windows.getCurrent();
  sessionState.chromeFocused = currentWindow.focused;

  // Get current idle state
  const idleState = await chrome.idle.queryState(60);
  sessionState.idleState = idleState;

  previousWasAllowed = isTabAllowed(sessionState.activeTabId, sessionState.activeDomain);

  await saveSessionState();
  startTicker();
}

// Stop the focus session
async function stopSession() {
  if (!sessionState.isRunning) {
    return;
  }

  stopTicker();
  await updateTime();

  const durationMs = safeNowMs() - sessionState.startTimeMs;
  const focusedTimeMs = Math.max(0, durationMs - sessionState.awayTimeMs);

  sessionState.lastSessionSummary = {
    durationMs: durationMs,
    awayTimeMs: sessionState.awayTimeMs,
    focusedTimeMs: focusedTimeMs,
    switchCount: sessionState.switchCount,
    endedAtMs: safeNowMs()
  };

  sessionState.isRunning = false;
  sessionState.startTimeMs = null;
  sessionState.lastTickMs = null;
  sessionState.switchCount = 0;
  sessionState.awayTimeMs = 0;
  sessionState.activeTabId = null;
  sessionState.activeDomain = null;
  sessionState.idleState = 'active';

  await saveSessionState();
}

// Add an allowed tab
async function addAllowedTab(tabId) {
  if (!sessionState.allowedTabIds.includes(tabId)) {
    sessionState.allowedTabIds.push(tabId);
    await saveSessionState();
  }
}

// Remove an allowed tab
async function removeAllowedTab(tabId) {
  sessionState.allowedTabIds = sessionState.allowedTabIds.filter(id => id !== tabId);
  await saveSessionState();
}

// Add an allowed domain
async function addAllowedDomain(domain) {
  if (!sessionState.allowedDomains.includes(domain)) {
    sessionState.allowedDomains.push(domain);
    await saveSessionState();
  }
}

// Remove an allowed domain
async function removeAllowedDomain(domain) {
  sessionState.allowedDomains = sessionState.allowedDomains.filter(d => d !== domain);
  await saveSessionState();
}

// Enforce focus lock
async function enforceFocusLock(tabId) {
  if (!sessionState.isRunning || !sessionState.lockEnabled) {
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);

    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }

    const tabDomain = getDomainFromUrl(tab.url);
    const allowed = isTabAllowed(tabId, tabDomain);

    if (!allowed) {
      const lockedUrl = chrome.runtime.getURL('locked.html');
      if (!tab.url.includes('locked.html')) {
        await chrome.tabs.update(tabId, { url: lockedUrl });
      }
    }
  } catch (error) {
    console.error('Error enforcing focus lock:', error);
  }
}

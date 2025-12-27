// popup.js - UI logic for Focus Cost Tracker popup

let updateInterval = null;
let currentState = null;

// DOM elements
const setPrimaryBtn = document.getElementById('setPrimaryBtn');
const startSessionBtn = document.getElementById('startSessionBtn');
const stopSessionBtn = document.getElementById('stopSessionBtn');
const lockEnabledCheckbox = document.getElementById('lockEnabledCheckbox');
const primaryTabDisplay = document.getElementById('primaryTabDisplay');
const allowedTabsList = document.getElementById('allowedTabsList');
const addCurrentTabBtn = document.getElementById('addCurrentTabBtn');
const removeCurrentTabBtn = document.getElementById('removeCurrentTabBtn');
const allowedDomainsList = document.getElementById('allowedDomainsList');
const domainInput = document.getElementById('domainInput');
const addDomainBtn = document.getElementById('addDomainBtn');
const liveStatsSection = document.getElementById('liveStatsSection');
const lastSessionSection = document.getElementById('lastSessionSection');
const elapsedTime = document.getElementById('elapsedTime');
const focusedTime = document.getElementById('focusedTime');
const switchCount = document.getElementById('switchCount');
const awayTime = document.getElementById('awayTime');
const lastDuration = document.getElementById('lastDuration');
const lastFocusedTime = document.getElementById('lastFocusedTime');
const lastSwitches = document.getElementById('lastSwitches');
const lastAwayTime = document.getElementById('lastAwayTime');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  setupEventListeners();

  if (currentState && currentState.isRunning) {
    startUpdateLoop();
  }
});

// Setup event listeners
function setupEventListeners() {
  setPrimaryBtn.addEventListener('click', async () => {
    await sendMessage({ action: 'setPrimaryToCurrentTab' });
    await loadState();
  });

  startSessionBtn.addEventListener('click', async () => {
    await sendMessage({ action: 'startSession' });
    await loadState();
    startUpdateLoop();
  });

  stopSessionBtn.addEventListener('click', async () => {
    await sendMessage({ action: 'stopSession' });
    await loadState();
    stopUpdateLoop();
  });

  lockEnabledCheckbox.addEventListener('change', async (e) => {
    await sendMessage({ action: 'setLockEnabled', enabled: e.target.checked });
  });

  addCurrentTabBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await sendMessage({ action: 'addAllowedTab', tabId: tabs[0].id });
      await loadState();
    }
  });

  removeCurrentTabBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await sendMessage({ action: 'removeAllowedTab', tabId: tabs[0].id });
      await loadState();
    }
  });

  addDomainBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    if (domain) {
      await sendMessage({ action: 'addAllowedDomain', domain: domain });
      domainInput.value = '';
      await loadState();
    }
  });

  domainInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      addDomainBtn.click();
    }
  });
}

// Send message to background script
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

// Load state from background
async function loadState() {
  const response = await sendMessage({ action: 'getSessionState' });
  if (response && response.success) {
    currentState = response.state;
    updateUI();
  }
}

// Update UI based on current state
function updateUI() {
  if (!currentState) {
    return;
  }

  updatePrimaryTabDisplay();
  updateAllowedTabs();
  updateAllowedDomains();
  updateRemoveCurrentTabButton();
  updateSessionControls();
  lockEnabledCheckbox.checked = currentState.lockEnabled || false;
  updateLiveStats();
  updateLastSession();
}

// Update primary tab display
function updatePrimaryTabDisplay() {
  if (currentState.primaryTabId === null) {
    primaryTabDisplay.textContent = 'Not set';
    primaryTabDisplay.style.color = '#6c757d';
  } else if (currentState.primaryTitle && currentState.primaryDomain) {
    primaryTabDisplay.innerHTML = `
      <strong>${currentState.primaryTitle}</strong><br>
      <span style="color: #6c757d; font-size: 11px;">${currentState.primaryDomain}</span>
    `;
    primaryTabDisplay.style.color = '#495057';
  } else {
    primaryTabDisplay.textContent = 'Primary tab closed';
    primaryTabDisplay.style.color = '#dc3545';
  }
}

// Update allowed tabs list
async function updateAllowedTabs() {
  allowedTabsList.innerHTML = '';

  for (const tabId of currentState.allowedTabIds || []) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const itemDiv = document.createElement('div');
      itemDiv.className = 'allowed-item';

      const textSpan = document.createElement('span');
      textSpan.className = 'allowed-item-text';
      textSpan.textContent = `${tab.title || tab.url}`;
      textSpan.title = tab.url;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'allowed-item-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async () => {
        await sendMessage({ action: 'removeAllowedTab', tabId: tabId });
        await loadState();
      });

      itemDiv.appendChild(textSpan);
      itemDiv.appendChild(removeBtn);
      allowedTabsList.appendChild(itemDiv);
    } catch (e) {
      // Tab closed
    }
  }
}

// Update allowed domains list
function updateAllowedDomains() {
  allowedDomainsList.innerHTML = '';

  for (const domain of currentState.allowedDomains || []) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'allowed-item';

    const textSpan = document.createElement('span');
    textSpan.className = 'allowed-item-text';
    textSpan.textContent = domain;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'allowed-item-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async () => {
      await sendMessage({ action: 'removeAllowedDomain', domain: domain });
      await loadState();
    });

    itemDiv.appendChild(textSpan);
    itemDiv.appendChild(removeBtn);
    allowedDomainsList.appendChild(itemDiv);
  }
}

// Update remove current tab button state
async function updateRemoveCurrentTabButton() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    const currentTabId = tabs[0].id;
    const isAllowed = (currentState.allowedTabIds || []).includes(currentTabId);
    removeCurrentTabBtn.disabled = !isAllowed;
  } else {
    removeCurrentTabBtn.disabled = true;
  }
}

// Update session control buttons
function updateSessionControls() {
  if (currentState.isRunning) {
    startSessionBtn.disabled = true;
    stopSessionBtn.disabled = false;
    liveStatsSection.style.display = 'block';
  } else {
    startSessionBtn.disabled = false;
    stopSessionBtn.disabled = true;
    liveStatsSection.style.display = 'none';
  }
}

// Update live stats display
function updateLiveStats() {
  if (!currentState.isRunning) {
    return;
  }

  const elapsed = safeNowMs() - currentState.startTimeMs;
  const focused = Math.max(0, elapsed - currentState.awayTimeMs);

  elapsedTime.textContent = formatMs(elapsed);
  focusedTime.textContent = formatMs(focused);
  awayTime.textContent = formatMs(currentState.awayTimeMs);
  switchCount.textContent = currentState.switchCount.toString();
}

// Update last session summary
function updateLastSession() {
  if (currentState.lastSessionSummary) {
    lastSessionSection.style.display = 'block';
    lastDuration.textContent = formatMs(currentState.lastSessionSummary.durationMs);
    lastFocusedTime.textContent = formatMs(currentState.lastSessionSummary.focusedTimeMs);
    lastAwayTime.textContent = formatMs(currentState.lastSessionSummary.awayTimeMs);
    lastSwitches.textContent = currentState.lastSessionSummary.switchCount.toString();
  } else {
    lastSessionSection.style.display = 'none';
  }
}

// Start update loop for live stats
function startUpdateLoop() {
  if (updateInterval) {
    return;
  }
  updateInterval = setInterval(async () => {
    await loadState();
  }, 1000);
}

// Stop update loop
function stopUpdateLoop() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Cleanup on popup close
window.addEventListener('unload', () => {
  stopUpdateLoop();
});

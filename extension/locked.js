// locked.js - Script for the locked page

// Check if the lock is still active
// If session ended or lock was disabled, this page shouldn't show
async function checkLockStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'isLockedPage' });

    // If session is not running or lock is not enabled, update message
    if (!response.isLocked) {
      document.querySelector('.message').textContent = 'Session ended or lock disabled.';
      document.querySelector('.submessage').textContent = 'You can close this tab.';
    }
  } catch (error) {
    console.error('Error checking lock status:', error);
  }
}

// Check status on load and periodically
checkLockStatus();
setInterval(checkLockStatus, 2000); // Check every 2 seconds

// utils.js - Utility functions for Focus Cost Tracker

/**
 * Extract domain (hostname) from a URL
 * @param {string} url - The URL to parse
 * @returns {string} - The hostname or empty string if invalid
 */
function getDomainFromUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return '';
  }
}

/**
 * Format milliseconds as mm:ss
 * @param {number} ms - Milliseconds to format
 * @returns {string} - Formatted time string
 */
function formatMs(ms) {
  if (!ms || ms < 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get current timestamp in milliseconds
 * @returns {number} - Current time in ms
 */
function safeNowMs() {
  return Date.now();
}

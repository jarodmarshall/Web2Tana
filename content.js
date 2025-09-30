// One consolidated message listener for the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return;

  if (request.action === 'getSelection') {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const div = document.createElement('div');
      div.appendChild(fragment);
      sendResponse({ content: div.innerHTML });
    } else {
      sendResponse({ content: null });
    }
    return true; // indicate we'll respond asynchronously (although we already did)
  }

  if (request.action === 'showNotification') {
    showNotification(request.message, !!request.isError);
    // No response needed for notifications
  }
});

// Create and show an in-page notification element
function showNotification(message, isError = false) {
  try {
    let notification = document.getElementById('tana-paste-notification');
    const container = document.body || document.documentElement || document;

    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'tana-paste-notification';
      // Accessibility: announce via aria-live
      notification.setAttribute('role', 'status');
      notification.setAttribute('aria-live', 'polite');
      notification.style.cssText = [
        'position: fixed',
        'bottom: 20px',
        'right: 20px',
        'padding: 10px 20px',
        'border-radius: 4px',
        "font-family: Arial, sans-serif",
        'font-size: 14px',
        'z-index: 2147483647',
        'transition: opacity 0.3s ease-in-out',
        'box-shadow: 0 2px 10px rgba(0,0,0,0.2)',
        'opacity: 0',
      ].join('; ');

      // Attempt to append; if container isn't a node, skip silently
      if (container && typeof container.appendChild === 'function') {
        container.appendChild(notification);
      }
    }

    // Update and show
    notification.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
    notification.style.color = 'white';
    notification.textContent = message;
    // Force repaint then show
    // eslint-disable-next-line no-unused-expressions
    notification.offsetHeight;
    notification.style.opacity = '1';

    // Remove after timeout
    setTimeout(() => {
      try {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification && notification.parentNode) notification.parentNode.removeChild(notification);
        }, 300);
      } catch (e) {
        // ignore DOM removal errors
      }
    }, 3000);
  } catch (err) {
    // Fallback to console if DOM operations fail
    try {
      // eslint-disable-next-line no-console
      console.log((isError ? 'ERROR: ' : '') + message);
    } catch (e) {
      // swallow
    }
  }
}
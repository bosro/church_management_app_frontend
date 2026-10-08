// src/app/core/utils/copy-to-clipboard.ts
// Copies text to the clipboard. Uses the modern API when available and falls
// back to a hidden textarea (older browsers, some in-app/mobile browsers).
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy method */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Public event registration URL for a given event id. */
export function eventRegistrationUrl(eventId: string): string {
  return `${window.location.origin}/public/event-register/${eventId}`;
}

import { saveAs } from 'file-saver';

function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Sandboxed preview iframes can remove `allow-downloads`. A popup opened by the
 * user's click can escape that sandbox; trigger the same download there and
 * close the helper immediately. Returns false when popups are blocked.
 */
function saveThroughTopLevelTab(blob: Blob, filename: string): boolean {
  let helper: Window | null = null;
  try {
    helper = window.open('', '_blank');
    if (!helper) return false;
    const url = URL.createObjectURL(blob);
    const doc = helper.document;
    doc.open();
    doc.write('<!doctype html><html><head><title></title></head><body></body></html>');
    doc.close();
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    doc.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
        helper?.close();
      } catch {
        /* ignore */
      }
    }, 4000);
    return true;
  } catch {
    try {
      helper?.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Direct browser save. FileSaver uses Chrome's native download pipeline and
 * creates a real entry in the browser Downloads list.
 *
 * Keep this synchronous: callers invoke it directly from an onClick handler.
 */
export function deliverFile(blob: Blob, filename: string): void {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const typed = blob.type ? blob : new Blob([blob], { type: 'application/octet-stream' });
  if (isFramed() && saveThroughTopLevelTab(typed, safeName)) return;
  saveAs(typed, safeName, { autoBom: true });
}

export function deliverText(content: string, filename: string, mime: string): void {
  deliverFile(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}

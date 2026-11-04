/** Copia texto al portapapeles; con respaldo para http (sin Clipboard API) y navegadores antiguos. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cae al respaldo */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

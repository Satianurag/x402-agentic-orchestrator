/** Native <dialog> top-layer sits above Magic iframe UI — close dialogs first. */
export function closeDialogsBeforeMagicUi() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
}

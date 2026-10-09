import type { SyncStorageSettings } from "../state/types";
import { storage } from "../services/storage";
import { getDomain, monogram, resolveFavicons } from "../services/favicon";
import { $, escapeHtml, svgIcon, showToast } from "../utils";
import Sortable from "sortablejs";

let popover: HTMLDivElement | null = null;
let sortableInstance: Sortable | null = null;
let abortController: AbortController | null = null;
// Timestamp of last drag-end. Used to suppress the synthetic click that
// browsers fire after every mousedown→mouseup sequence (even after a drag).
// A boolean flag races against storage listeners that re-render the component.
let dragEndedAt = 0;

export async function renderQuickLinks(settings: SyncStorageSettings) {
  const container = $("#nt-quicklinks");
  if (!container) return;

  if (!settings.appearance.showQuickLinks) {
    container.innerHTML = "";
    return;
  }

  // Destroy previous Sortable and event listeners before re-render
  sortableInstance?.destroy();
  sortableInstance = null;
  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  const links = settings.quickLinks;
  const domains = links.map((l) => getDomain(l.url)).filter(Boolean);
  const faviconMap = await resolveFavicons(domains);

  container.innerHTML =
    links
      .map((l) => {
        const domain = getDomain(l.url);
        const favicon = domain ? faviconMap.get(domain) : null;
        const fallback = escapeHtml(monogram(l.label));
        const ico = favicon
          ? `<img src="${escapeHtml(favicon)}" alt="" width="16" height="16" loading="lazy" />`
          : "";
        // No draggable="false" — that attribute is honoured by Firefox before
        // SortableJS can intercept it, silently breaking drag there.
        return `
    <div class="ql-item">
      <a class="ql-tile" href="${escapeHtml(l.url)}" data-id="${escapeHtml(l.id)}">
        <span class="ql-icon">
          ${ico}
          <span class="ql-icon-fallback" style="display:${favicon ? "none" : "grid"}">${fallback}</span>
        </span>
        <span class="ql-label">${escapeHtml(l.label)}</span>
      </a>
      <button class="ql-remove" data-remove="${escapeHtml(l.id)}" aria-label="Remove ${escapeHtml(l.label)}" title="Remove">
        ${svgIcon("close", 11)}
      </button>
    </div>
  `;
      })
      .join("") +
    `
    <button class="ql-tile ql-add" id="nt-ql-add" aria-label="Add quick link">
      <span class="ql-icon ql-icon--add">
        ${svgIcon("plus", 14)}
      </span>
      <span class="ql-label">Add link</span>
    </button>
  `;

  // Broken favicon: show the monogram. Inline onerror is blocked by the
  // extension CSP, and error events don't bubble, so listen in capture phase.
  container.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      const icon = img instanceof HTMLImageElement ? img.closest(".ql-icon") : null;
      if (!icon) return;
      icon.querySelector<HTMLElement>(".ql-icon-fallback")?.style.setProperty("display", "grid");
      (img as HTMLImageElement).remove();
    },
    { capture: true, signal },
  );

  // SortableJS reorder
  sortableInstance = Sortable.create(container as HTMLElement, {
    draggable: ".ql-item",
    animation: 150,
    // forceFallback bypasses the HTML5 Drag-and-Drop API entirely and uses
    // pointer events instead. Anchor elements fight the native DnD API
    // (browsers try to drag the href as a URL), so this is required for
    // reliable cross-browser behaviour.
    forceFallback: true,
    onEnd: async (evt) => {
      // Nothing moved — don't bother saving or stamping
      if (evt.oldIndex === evt.newIndex) return;

      // Stamp *before* the await so the click handler can check it even
      // if the storage round-trip triggers a re-render mid-flight.
      dragEndedAt = Date.now();

      const ids = Array.from(
        container.querySelectorAll<HTMLElement>(".ql-tile[data-id]"),
      ).map((el) => el.dataset.id!);
      const reordered = ids
        .map((id) => links.find((l) => l.id === id)!)
        .filter(Boolean);
      await storage.saveSettings({ quickLinks: reordered });
    },
  });

  async function removeLink(id: string): Promise<void> {
    const updated = links.filter((l) => l.id !== id);
    await storage.saveSettings({ quickLinks: updated });
    renderQuickLinks({ ...settings, quickLinks: updated });
    showToast("Link removed", "accent", {
      label: "Undo",
      onClick: async () => {
        // Re-read so an undo doesn't clobber links changed since the removal.
        const current = (await storage.getSettings()).quickLinks;
        if (current.some((l) => l.id === id)) return;
        const removed = links.find((l) => l.id === id)!;
        const index = links.indexOf(removed);
        const restored = [...current.slice(0, index), removed, ...current.slice(index)];
        await storage.saveSettings({ quickLinks: restored });
      },
    });
  }

  // Right-click remove (the hover × does the same)
  container.addEventListener(
    "contextmenu",
    (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>(".ql-tile[data-id]");
      if (!tile) return;
      e.preventDefault();
      void removeLink(tile.dataset.id!);
    },
    { signal },
  );

  // Click to open — suppressed for 300 ms after a drag ends, which is long
  // enough for the synthetic click to fire but short enough not to be noticed.
  container.addEventListener(
    "click",
    (e) => {
      const remove = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-remove]");
      if (remove) {
        e.preventDefault();
        void removeLink(remove.dataset.remove!);
        return;
      }
      const tile = (e.target as HTMLElement).closest(
        ".ql-tile[data-id]",
      ) as HTMLAnchorElement | null;
      if (!tile || tile.classList.contains("ql-add")) return;
      e.preventDefault();
      if (Date.now() - dragEndedAt < 300) return;
      const url = tile.href;
      window.open(url, settings.openLinksIn === "new_tab" ? "_blank" : "_self");
    },
    { signal },
  );

  // Add button
  $("#nt-ql-add")?.addEventListener(
    "click",
    () => {
      showAddPopover(settings);
    },
    { signal },
  );
}

function showAddPopover(settings: SyncStorageSettings) {
  if (popover) {
    popover.remove();
    popover = null;
    return;
  }
  const addBtn = $("#nt-ql-add");
  if (!addBtn) return;

  popover = document.createElement("div");
  popover.className = "ql-add-popover";
  popover.innerHTML = `
    <input class="field" id="ql-add-url" type="text" placeholder="https://example.com" />
    <input class="field" id="ql-add-label" type="text" placeholder="Label" />
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" id="ql-add-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="ql-add-save">Add</button>
    </div>
  `;
  document.body.appendChild(popover);

  const rect = addBtn.getBoundingClientRect();
  popover.style.left = `${rect.left + window.scrollX}px`;
  popover.style.top = `${rect.bottom + window.scrollY + 8}px`;

  const urlInput = popover.querySelector<HTMLInputElement>("#ql-add-url")!;
  const labelInput = popover.querySelector<HTMLInputElement>("#ql-add-label")!;
  const saveBtn = popover.querySelector<HTMLButtonElement>("#ql-add-save")!;
  urlInput.focus();

  const close = () => {
    popover?.remove();
    popover = null;
    document.removeEventListener("click", closeOnClick);
  };

  popover.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === "Escape") {
      // Keep the global Escape handler from also acting on this keypress.
      e.stopPropagation();
      close();
      (addBtn as HTMLElement).focus();
    }
  });

  popover.querySelector("#ql-add-cancel")?.addEventListener("click", close);

  saveBtn.addEventListener("click", async () => {
    let url = urlInput.value.trim();
    const label = labelInput.value.trim();
    if (!url || !label) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (settings.quickLinks.length >= 12) {
      showToast("Max 12 quick links", "red");
      return;
    }
    const newLink = { id: `ql-${Date.now()}`, url, label };
    const updated = [...settings.quickLinks, newLink];
    await storage.saveSettings({ quickLinks: updated });
    renderQuickLinks({ ...settings, quickLinks: updated });
    close();
    showToast("Link added", "mint");
  });

  // Close on outside click
  function closeOnClick(e: MouseEvent) {
    if (!popover?.contains(e.target as Node) && e.target !== addBtn) close();
  }
  setTimeout(() => document.addEventListener("click", closeOnClick), 10);
}

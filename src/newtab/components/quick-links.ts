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
          ? `<img src="${escapeHtml(favicon)}" alt="" width="24" height="24" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" />`
          : "";
        // No draggable="false" — that attribute is honoured by Firefox before
        // SortableJS can intercept it, silently breaking drag there.
        return `
    <a class="ql-tile" href="${escapeHtml(l.url)}" data-id="${escapeHtml(l.id)}">
      <div class="ql-icon">
        ${ico}
        <span class="ql-icon-fallback" style="display:${favicon ? "none" : "grid"}">${fallback}</span>
      </div>
      <span class="ql-label">${escapeHtml(l.label)}</span>
    </a>
  `;
      })
      .join("") +
    `
    <button class="ql-tile ql-add" id="nt-ql-add" aria-label="Add quick link">
      <div class="ql-icon ql-icon--add">
        ${svgIcon("plus", 18)}
      </div>
      <span class="ql-label">Add</span>
    </button>
  `;

  // SortableJS reorder
  sortableInstance = Sortable.create(container as HTMLElement, {
    draggable: ".ql-tile:not(.ql-add)",
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

  // Right-click remove
  container.addEventListener(
    "contextmenu",
    async (e) => {
      const tile = (e.target as HTMLElement).closest(
        ".ql-tile[data-id]",
      ) as HTMLElement | null;
      if (!tile) return;
      e.preventDefault();
      const id = tile.dataset.id!;
      const updated = links.filter((l) => l.id !== id);
      await storage.saveSettings({ quickLinks: updated });
      renderQuickLinks({ ...settings, quickLinks: updated });
      showToast("Link removed", "accent");
    },
    { signal },
  );

  // Click to open — suppressed for 300 ms after a drag ends, which is long
  // enough for the synthetic click to fire but short enough not to be noticed.
  container.addEventListener(
    "click",
    (e) => {
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
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 8}px`;

  const urlInput = popover.querySelector<HTMLInputElement>("#ql-add-url")!;
  const labelInput = popover.querySelector<HTMLInputElement>("#ql-add-label")!;
  urlInput.focus();

  popover.querySelector("#ql-add-cancel")?.addEventListener("click", () => {
    popover?.remove();
    popover = null;
  });

  popover.querySelector("#ql-add-save")?.addEventListener("click", async () => {
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
    popover?.remove();
    popover = null;
    showToast("Link added", "mint");
  });

  // Close on outside click
  const closeOnClick = (e: MouseEvent) => {
    if (!popover?.contains(e.target as Node) && e.target !== addBtn) {
      popover?.remove();
      popover = null;
      document.removeEventListener("click", closeOnClick);
    }
  };
  setTimeout(() => document.addEventListener("click", closeOnClick), 10);
}

import type { FeedItem } from "../state/types";
import { feedStore } from "../state/store";
import { storage } from "./storage";

// Persist saved state and mirror it into feedStore so every view
// (feed grid, Saved tab, AI cards) updates without a reload.
export async function setArticleSaved(item: FeedItem, saved: boolean): Promise<void> {
  if (saved) await storage.saveArticle({ ...item, saved: true });
  else await storage.unsaveArticle(item.id);
  feedStore.set((items) =>
    items.map((i) => (i.id === item.id ? { ...i, saved } : i)),
  );
}

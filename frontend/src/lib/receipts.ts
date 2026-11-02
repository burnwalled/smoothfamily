// Receipts are kept in the family's receipts album (seen only by those who may see what they belong
// to) and linked to the expense; the vault shows them under Receipts.
import { MediaItem } from "@/lib/api";

export async function uploadReceipt(file: File): Promise<string> {
  const data = new FormData();
  data.append("file", file);
  const resp = await fetch("/api/vault/receipts", { method: "POST", body: data, credentials: "same-origin" });
  if (!resp.ok) throw new Error("upload failed");
  return ((await resp.json()) as MediaItem).id;
}

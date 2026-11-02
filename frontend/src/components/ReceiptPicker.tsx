"use client";

// Styled replacement for <input type="file"> (whose native "No file chosen"
// text can't be styled or translated). Shows the chosen file name inside a
// regular input-looking field, with a button to clear it.
import { Paperclip, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function ReceiptPicker({
  file,
  onChange,
  className = "",
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={`input relative flex items-center gap-2 ${className}`}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <Paperclip className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
        <span className={`truncate text-sm ${file ? "text-ink" : "text-muted"}`}>
          {file ? file.name : t("common.chooseReceipt")}
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null);
            e.target.value = ""; // allow picking the same file again after clearing
          }}
        />
      </label>
      {file && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted hover:text-ink"
          onClick={() => onChange(null)}
          aria-label={t("common.removeFile")}
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

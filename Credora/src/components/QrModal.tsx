import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check } from "lucide-react";
import { useState } from "react";

export function QrModal({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-obsidian-700/60 bg-obsidian-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button className="absolute right-3 top-3 rounded-lg p-1.5 text-obsidian-500 transition-colors hover:bg-obsidian-800 hover:text-obsidian-300" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
        {title && <p className="mb-4 text-center text-sm font-semibold text-obsidian-100">{title}</p>}
        <div className="flex justify-center rounded-xl bg-white p-4">
          <QRCodeSVG value={url} size={220} level="M" />
        </div>
        <p className="mt-3 break-all text-center text-[11px] text-obsidian-500">{url}</p>
        <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-obsidian-700/50 py-2 text-xs text-obsidian-300 transition-colors hover:bg-obsidian-800 hover:text-obsidian-100" onClick={() => void copy()}>
          {copied ? <Check className="h-3.5 w-3.5 text-sage-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
    </div>
  );
}

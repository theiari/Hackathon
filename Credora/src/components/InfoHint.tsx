export function InfoHint({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-obsidian-600 text-xs text-obsidian-300"
      title={text}
      aria-label={text}
    >
      i
    </span>
  );
}

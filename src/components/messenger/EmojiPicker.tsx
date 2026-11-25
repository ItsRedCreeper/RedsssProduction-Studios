"use client";

import { useMemo, useState } from "react";
import { Search, Smile } from "lucide-react";
import { CustomEmoji } from "@/components/messenger/CustomEmoji";
import { HoverTip } from "@/components/ui/HoverTip";
import {
  customEmojiToken,
  filterUnicodeEmojis,
  type ServerEmoji,
} from "@/lib/emoji";

export type EmojiPick =
  | { kind: "unicode"; char: string; name: string }
  | { kind: "custom"; emoji: ServerEmoji; token: string };

type EmojiPickerProps = {
  customEmojis: ServerEmoji[];
  serverNamesById?: Record<string, string>;
  onPick: (pick: EmojiPick) => void;
  className?: string;
};

export function EmojiPicker({
  customEmojis,
  serverNamesById = {},
  onPick,
  className = "",
}: EmojiPickerProps) {
  const [query, setQuery] = useState("");

  const unicodeGroups = useMemo(() => filterUnicodeEmojis(query), [query]);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const emoji of customEmojis) {
      const key = emoji.name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [customEmojis]);

  const customGroups = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^:|:$/g, "");
    const byServer = new Map<string, ServerEmoji[]>();
    for (const emoji of customEmojis) {
      if (q && !emoji.name.toLowerCase().includes(q)) continue;
      const list = byServer.get(emoji.server_id) ?? [];
      list.push(emoji);
      byServer.set(emoji.server_id, list);
    }
    return [...byServer.entries()].map(([serverId, emojis]) => ({
      serverId,
      label: serverNamesById[serverId] ?? "Server",
      emojis: emojis.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [customEmojis, query, serverNamesById]);

  const empty =
    unicodeGroups.every((g) => g.emojis.length === 0) &&
    customGroups.every((g) => g.emojis.length === 0);

  return (
    <div
      className={`flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--ms-sidebar)] shadow-2xl shadow-black/50 ring-1 ring-accent/10 ${className}`}
    >
      <div className="border-b border-black/30 p-2">
        <label className="flex items-center gap-2 rounded-md bg-[var(--ms-border)] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ms-text-muted)]" strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find the perfect emoji"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ms-text)] outline-none placeholder:text-[var(--ms-text-faint)]"
            autoFocus
          />
        </label>
      </div>
      <div className="max-h-72 overflow-y-auto px-2 py-2">
        {empty && (
          <div className="flex flex-col items-center gap-2 py-8 text-[var(--ms-text-muted)]">
            <Smile className="h-8 w-8 opacity-50" strokeWidth={1.5} />
            <p className="text-sm">No emoji match that search.</p>
          </div>
        )}
        {customGroups.map((group) => (
          <section key={group.serverId} className="mb-3">
            <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
              {group.label}
            </h3>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji) => {
                const duplicate =
                  (nameCounts.get(emoji.name.toLowerCase()) ?? 0) > 1;
                const tip = duplicate
                  ? `:${emoji.name}: · ${group.label}`
                  : `:${emoji.name}:`;
                return (
                  <HoverTip key={emoji.id} label={tip} delayMs={40}>
                    <button
                      type="button"
                      onClick={() =>
                        onPick({
                          kind: "custom",
                          emoji,
                          token: customEmojiToken(emoji),
                        })
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
                      aria-label={tip}
                    >
                      <CustomEmoji emoji={emoji} size={24} />
                    </button>
                  </HoverTip>
                );
              })}
            </div>
          </section>
        ))}
        {unicodeGroups.map((group) => (
          <section key={group.id} className="mb-3">
            <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
              {group.label}
            </h3>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji) => (
                <HoverTip key={emoji.char} label={`:${emoji.name}:`} delayMs={40}>
                  <button
                    type="button"
                    onClick={() =>
                      onPick({
                        kind: "unicode",
                        char: emoji.char,
                        name: emoji.name,
                      })
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none hover:bg-white/10"
                    aria-label={emoji.name}
                  >
                    {emoji.char}
                  </button>
                </HoverTip>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

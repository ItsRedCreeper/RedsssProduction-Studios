"use client";

import { useMemo } from "react";

export type PollData = {
  question: string;
  options: string[];
  allowMultiple?: boolean;
};

type PollCardProps = {
  poll: PollData;
  votes: { user_id: string; option_index: number }[];
  currentUserId: string | null;
  onVote: (optionIndex: number) => void;
};

export function PollCard({
  poll,
  votes,
  currentUserId,
  onVote,
}: PollCardProps) {
  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const vote of votes) {
      map.set(vote.option_index, (map.get(vote.option_index) ?? 0) + 1);
    }
    return map;
  }, [votes]);

  const myVotes = useMemo(() => {
    const set = new Set<number>();
    for (const vote of votes) {
      if (vote.user_id === currentUserId) set.add(vote.option_index);
    }
    return set;
  }, [votes, currentUserId]);

  const total = votes.length || 1;

  return (
    <div className="mt-2 max-w-md space-y-2 rounded-md border border-[#3f4147] bg-[#2b2d31] p-3">
      <p className="text-sm font-semibold text-white">{poll.question}</p>
      <ul className="space-y-1.5">
        {poll.options.map((option, index) => {
          const count = counts.get(index) ?? 0;
          const pct = Math.round((count / total) * 100);
          const selected = myVotes.has(index);
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onVote(index)}
                className={`relative w-full overflow-hidden rounded-md border px-3 py-2 text-left text-sm ${
                  selected
                    ? "border-accent/60 bg-accent/10 text-white"
                    : "border-[#3f4147] text-[#dbdee1] hover:bg-white/5"
                }`}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-white/10"
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span>{option}</span>
                  <span className="text-xs text-[#949ba4]">
                    {count} · {pct}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[#949ba4]">
        {votes.length} vote{votes.length === 1 ? "" : "s"}
        {poll.allowMultiple ? " · multiple answers" : ""}
      </p>
    </div>
  );
}

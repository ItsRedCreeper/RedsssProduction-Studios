"use client";

import { UserAvatar } from "@/components/ui/UserAvatar";

export type TypingPerson = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

type TypingIndicatorProps = {
  people: TypingPerson[];
  className?: string;
};

function typingCopy(people: TypingPerson[]) {
  if (people.length === 0) return null;
  if (people.length === 1) return `${people[0].username} is typing…`;
  if (people.length === 2) {
    return `${people[0].username} and ${people[1].username} are typing…`;
  }
  // Discord: 3+ collapses to this label (avatars still show the first few).
  return "Several people are typing…";
}

export function TypingIndicator({ people, className = "" }: TypingIndicatorProps) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  const label = typingCopy(people);

  return (
    <div
      className={`flex min-h-[1.25rem] items-center gap-2 ${className}`}
      aria-live="polite"
    >
      <div className="flex shrink-0 items-center pl-0.5">
        {shown.map((person, index) => (
          <span
            key={person.userId}
            className="relative inline-flex rounded-full ring-2 ring-[#313338]"
            style={{
              marginLeft: index === 0 ? 0 : -6,
              zIndex: shown.length - index,
            }}
          >
            <UserAvatar
              username={person.username}
              avatarUrl={person.avatarUrl}
              size="xs"
            />
          </span>
        ))}
      </div>
      <p className="truncate text-xs text-muted">{label}</p>
    </div>
  );
}

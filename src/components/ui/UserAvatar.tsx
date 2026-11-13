import { avatarLetter } from "@/lib/avatar";

type UserAvatarProps = {
  username: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** Discord-style green speaking ring */
  speaking?: boolean;
};

const sizeClasses = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-11 w-11 text-sm",
} as const;

export function UserAvatar({
  username,
  avatarUrl,
  size = "md",
  className = "",
  speaking = false,
}: UserAvatarProps) {
  // Solid green ring for the navbar speaking indicator.
  const speakingClass = speaking
    ? "shadow-[0_0_0_3px_#23a559] transition-shadow duration-100"
    : "";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeClasses[size]} shrink-0 rounded-full object-cover ${speakingClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-bold text-accent ${sizeClasses[size]} ${speakingClass} ${className}`}
      aria-hidden
    >
      {avatarLetter(username)}
    </div>
  );
}

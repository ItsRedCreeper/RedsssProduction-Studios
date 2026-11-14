"use client";

import type { ReactNode } from "react";
import { DEFAULT_BANNER_COLOR, resolveBannerColor } from "@/lib/profile-banner";

type ProfileBannerProps = {
  bannerUrl?: string | null;
  bannerColor?: string | null;
  className?: string;
  children?: ReactNode;
};

/** Full-bleed profile banner: image if set, else solid color. */
export function ProfileBanner({
  bannerUrl,
  bannerColor,
  className = "",
  children,
}: ProfileBannerProps) {
  const color = resolveBannerColor(bannerColor) || DEFAULT_BANNER_COLOR;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bannerUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: color }} />
      )}
      {children}
    </div>
  );
}

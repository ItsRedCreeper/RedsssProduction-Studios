/** Shared min/max lengths for user-facing text fields. */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

export const SERVER_NAME_MIN = 2;
export const SERVER_NAME_MAX = 64;
export const SERVER_DESCRIPTION_MAX = 200;

export const CHANNEL_NAME_MIN = 2;
export const CHANNEL_NAME_MAX = 40;

export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 40;

export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 40;

export const BIO_MAX = 190;
export const STATUS_TEXT_MAX = 128;
export const NICKNAME_MAX = 32;
export const FRIEND_NOTE_MAX = 500;

/** Large enough for normal chat; stops absurd spam. */
export const MESSAGE_MAX = 4000;

export const MESSAGE_MAX_REACHED = "You've reached the max message length.";

// Lifetimes and thresholds for the admin authentication system.
export const SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60; // hard cap per login, regardless of activity
export const SESSION_IDLE_SECONDS = 30 * 60; // inactivity timeout
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000; // how often last_seen_at is written

export const LOCK_THRESHOLD = 5; // failed logins before the account locks
export const LOCK_BASE_MINUTES = 15; // first lock duration; doubles per extra failure
export const LOCK_CAP_HOURS = 24; // maximum lock duration

export const RATE_WINDOW_MINUTES = 15;
export const RATE_LIMIT_PER_IP = 30; // login submissions per window per IP
export const RATE_LIMIT_PER_EMAIL = 10; // login submissions per window per email

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const TEMP_PASSWORD_LENGTH = 20;

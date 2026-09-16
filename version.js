// The one number to bump per release. A plain script rather than a module so
// both the page and the service worker can read it: the app shows it in
// Settings and at the foot of the week, and the worker names its cache after
// it — so the version on screen is always the version that was installed.
self.APP_VERSION = '1.10.0';
self.APP_RELEASED = '2026-09-16';

// STELLIS: build-time injected via vite.config.ts `define`.
//
//   __STELLIS_SHA__   — git rev-parse --short HEAD at build time
//   __STELLIS_BUILD__ — ISO timestamp "YYYY-MM-DD HH:MM" of the build
//
// Use them anywhere in src; Vite replaces the identifier with a string
// literal at bundle time.
declare const __STELLIS_SHA__: string;
declare const __STELLIS_BUILD__: string;

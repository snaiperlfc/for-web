import type { JSX } from "solid-js";

import { I18nProvider as LinguiProvider } from "@lingui-solid/solid";
import { i18n } from "@lingui/core";

import { type LocaleOptions, Language, Languages } from "./Languages";
import { messages as en } from "./catalogs/en/messages";
import { initTime, loadTimeLocale } from "./dayjs";

export function I18nProvider(props: { children: JSX.Element }) {
  return <LinguiProvider i18n={i18n}>{props.children}</LinguiProvider>;
}

export { Language, Languages } from "./Languages";
export { timeLocale, useTime } from "./dayjs";
export { useError } from "./errors";

export async function loadAndSwitchLocale(
  key: Language,
  localeOptions: LocaleOptions,
) {
  if (key !== i18n.locale) {
    const data =
      Languages[key].i18n === "en"
        ? en
        : (await import(`./catalogs/${Languages[key].i18n}/messages.ts`))
            .messages;

    i18n.load({
      [key]: data,
    });

    i18n.activate(key);

    loadTimeLocale(Languages[key], localeOptions);
  }
}

/**
 * Preferred language as reported by the browser
 *
 * STELLIS: fallback changed from ENGLISH to RUSSIAN — this is a closed
 * Russian-speaking tribe. Fresh visitors with en-US navigator.language used
 * to see English UI even though we ship a 728-string Russian catalog.
 *
 * @returns Preferred language
 */
export function browserPreferredLanguage() {
  // STELLIS: closed Russian-speaking tribe — default RU for fresh visitors
  // regardless of navigator.language (which is usually en-US on dev machines).
  // User can override anytime via Settings → Language.
  return Language.RUSSIAN;
}

/**
 * Initialise i18n engine
 *
 * STELLIS: still loads `en` as the seed catalog (it's the source locale that
 * carries all msgids), but the actual activation will be RU once the
 * preferences-restore effect runs. This avoids a Russian-tribe instance
 * flashing English UI for one frame before the locale flip.
 */
export function initI18n() {
  i18n.load({
    en,
  });

  i18n.activate("en");

  initTime();
}

initI18n();

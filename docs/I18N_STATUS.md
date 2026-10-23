# Interface languages

English, Hindi and Odia are available from the language control on sign-in and the staff header. A validated `medishop.locale` cookie persists the choice for one year. The root HTML language and React provider use the same server-read value, avoiding a first-render language mismatch. Unsupported cookie values fall back to English.

The curated dictionary has 634 English source keys with Hindi and Odia translations. Explicit `T` components translate static text; shared `PageTitle` and `ActionForm` translate their display labels and messages. Localized form controls translate placeholder, title and accessible label attributes only. Form values, IDs, medicine/customer names, saved message contents and business data remain unchanged. There is no DOM rewriting or external translation request.

For new UI copy, add a key to `src/lib/i18n/messages.json`, use `<T>English copy</T>` in JSX, or `useTranslation()` in a client component. Interpolated phrases can use `<T values={{ count }}>{"Items: {count}"}</T>` with the English phrase passed as a string expression. Never wrap user-provided names or message contents. Server code can use `translate(await getLocale(), copy)`.

`node scripts/check-i18n.mjs` regenerates the static source inventory in `src/lib/i18n/catalog.json` and writes unmatched candidates to `.local/untranslated-ui.json`. It is an inventory, not proof of complete translation coverage: candidates include technical values, and configuration-driven copy and runtime errors need separate review.

Current limits: standalone offline counter, server-generated error messages, status enums, some help/report configuration strings, metadata, PDF and isolated receipt output still use English. English is the explicit fallback for untranslated copy. Hindi/Odia linguistic review and full workflow language-parity testing remain pending.

Verified: four focused locale/translation tests, TypeScript check, and ESLint of UI/features/localization passed. The tests cover supported-language validation, fallback, whitespace/interpolation, complete pairs in the curated dictionary and the HTML-entity regression. The combined production build and browser language-switch verification are coordinated by the main agent.

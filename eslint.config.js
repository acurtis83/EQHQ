/**
 * One rule: no-undef.
 *
 * Not a style config. This exists because the same bug shipped three times in
 * one afternoon — a name used in one place and declared in another, or not at
 * all:
 *
 *   * CATEGORIES dropped from an import while the composer still used it,
 *     which turned the + button into a white screen
 *   * `kinds` read inside EditSheet, where it belonged to the component above
 *   * `eventKinds` read inside AgendaDetail, same shape again
 *
 * A bundler resolves modules, not variables, so `vite build` is happy with all
 * three. The tests only catch one if something mounts that exact component in
 * that exact state. no-undef catches all of them in about a second, with real
 * scope analysis rather than the regex approximation this replaced.
 *
 * Deliberately nothing else turned on. A config that also argues about
 * quotes and semicolons is one somebody turns off.
 */
export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        // The browser surface this app actually touches.
        window: "readonly", document: "readonly", navigator: "readonly",
        localStorage: "readonly", sessionStorage: "readonly",
        fetch: "readonly", console: "readonly", location: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        alert: "readonly", confirm: "readonly", crypto: "readonly",
        Blob: "readonly", File: "readonly", FileReader: "readonly",
        FormData: "readonly", Image: "readonly", URL: "readonly",
        URLSearchParams: "readonly", AbortController: "readonly",
        MouseEvent: "readonly", Event: "readonly", CustomEvent: "readonly",
        HTMLElement: "readonly", getComputedStyle: "readonly",
        matchMedia: "readonly", print: "readonly", btoa: "readonly",
        atob: "readonly", structuredClone: "readonly",
        XMLSerializer: "readonly", prompt: "readonly",
        // Vite replaces this at build time.
        process: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
];

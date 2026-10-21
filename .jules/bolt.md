
## 2024-10-19 - Intl.DateTimeFormat caching bottleneck
**Learning:** Instantiating `Intl.DateTimeFormat` inside loops and render cycles is extremely costly in JavaScript (a ~3.6s vs 62ms difference over 10k iterations in V8). Hook-based memoization (`useMemo`) is overkill for static formatters; they should be extracted completely outside the component scope into module-level variables.
**Action:** Extract static `Intl.DateTimeFormat` instances to module-level constants (after all imports) instead of leaving them inline or wrapping them in React hooks.

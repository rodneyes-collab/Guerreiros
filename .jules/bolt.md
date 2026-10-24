## 2024-10-24 - Cache Intl.DateTimeFormat instances
**Learning:** Instantiating `Intl.DateTimeFormat` is an expensive operation. In components like `RankingView`, it was instantiated inside functions like `getMatchDate` which are called repeatedly inside `useMemo` loops filtering hundreds/thousands of matches, leading to significant main thread blocking during renders.
**Action:** Always cache `Intl.DateTimeFormat` at the module level, especially when used within array iterations, map functions, or frequently recalculated memoized values.

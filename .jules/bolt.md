## 2024-05-19 - Intl.DateTimeFormat instantiation in renders and loops
**Learning:** `Intl.DateTimeFormat` instantiation is expensive in JavaScript/V8. Instantiating it inside React renders or inside loops processing large arrays (e.g. `sessionMatches.sort()`) creates significant overhead and garbage collection pressure.
**Action:** Always cache `Intl.DateTimeFormat` and `Intl.NumberFormat` instances at the module scope when the options are static, rather than creating them inside components or functions.

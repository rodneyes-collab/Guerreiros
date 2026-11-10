
## 2024-05-18 - Cached Intl.DateTimeFormat Instances
**Learning:** Instantiating `Intl.DateTimeFormat` inside React render cycles or frequent loops causes significant performance degradation because it is an expensive operation in JavaScript.
**Action:** Extract formatters to a shared module (`src/utils/date.ts`) and import them where needed to reuse the instances.

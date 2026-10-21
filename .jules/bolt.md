
## 2024-05-30 - Caching Intl.DateTimeFormat in React components
**Learning:** Instantiating `new Intl.DateTimeFormat` inside React loops and component render cycles causes a noticeable performance hit because locale resolution and formatter initialization are expensive operations.
**Action:** Extract standard `Intl.DateTimeFormat` instances to a utility file (like `src/utils/dateUtils.ts`) and reuse them across components instead of recreating them in renders.

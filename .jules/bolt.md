## 2024-05-18 - [Cache Intl.DateTimeFormat]
**Learning:** Instantiating `Intl.DateTimeFormat` inside a render loop or repeatedly in large components causes performance degradation.
**Action:** Extract and cache `Intl.DateTimeFormat` instances to the module level, especially inside loops like `Array.from`.

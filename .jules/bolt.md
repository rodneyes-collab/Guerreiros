## 2026-11-01 - Cached Intl.DateTimeFormat in loops
**Learning:** Instantiating new `Intl.DateTimeFormat` objects inside loops or iterators (like `.filter`) is computationally expensive and causes measurable performance drops, especially when filtering large match arrays.
**Action:** Always extract and cache `Intl.DateTimeFormat` object instantiations to the module level or outside the loop before use.

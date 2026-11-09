
## 2024-05-24 - [Intl.DateTimeFormat Instantiation inside Loops]
**Learning:** Instantiating `Intl.DateTimeFormat` inside frequently executed loops (such as filtering match lists by date or iterating over Firestore document snapshots) significantly degrades performance due to excessive garbage collection and CPU overhead.
**Action:** Extract `Intl.DateTimeFormat` initialization to a module-level variable (or use caching) and reuse it inside the loops.

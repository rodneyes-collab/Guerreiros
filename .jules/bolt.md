## 2024-05-24 - [Intl.DateTimeFormat]
**Learning:** `Intl.DateTimeFormat` instantiation is expensive in JavaScript and was being initialized repeatedly in a render loop inside `DashboardView.tsx` (and other views). This is a common performance anti-pattern.
**Action:** Extract `Intl.DateTimeFormat` instantiations to the module level and cache the formatter so it's only created once per file, or reuse a global formatter when rendering lists or dates.

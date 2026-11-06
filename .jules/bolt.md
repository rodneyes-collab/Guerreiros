
## 2024-05-18 - [Extract Intl.DateTimeFormat instantiation out of loops]
**Learning:** Instantiating `Intl.DateTimeFormat` inside loop constructs or heavily called filter functions can cause significant performance overhead. It is best to declare these date formatters at the module scope if they share the same localization and configuration properties.
**Action:** When inspecting date parsing or formatting logic, always ensure that `Intl.DateTimeFormat` isn't repeatedly instantiated. Move the declarations to module scope and reuse them.

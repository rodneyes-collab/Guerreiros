## 2024-05-19 - [Zustand `useShallow` performance issue]
**Learning:** `useShallow` does NOT prevent re-renders for frequently updating primitive values (like `elapsedTime` timers). For changing primitives, isolate the state subscription and timer logic (`setInterval`) into a dedicated child component (e.g., `TimerTracker`) to avoid re-rendering large parent components.
**Action:** Extract timer logic out of `App.tsx` into a `TimerTracker` component that updates state imperatively or is a small isolated React component.

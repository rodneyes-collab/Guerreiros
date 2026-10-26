
## 2025-02-27 - Preventing global state re-render storms from Zustand
**Learning:** React components destructuring `useStore()` from Zustand (e.g. `const { players } = useStore()`) implicitly subscribe to the ENTIRE state. If another frequently updated property changes (such as `elapsedTime` tracking active timers), all components destructuring the store will re-render unnecessarily, severely degrading performance.
**Action:** Always use `useShallow` from `zustand/react/shallow` when selecting multiple state properties or destructuring (e.g. `const { players } = useStore(useShallow(state => ({ players: state.players })))`) to limit renders only to when the explicitly selected properties change.

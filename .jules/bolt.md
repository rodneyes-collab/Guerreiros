## 2025-02-12 - Remove unused elapsedTime subscription to prevent App re-renders
**Learning:** Subscribing to frequently changing primitives (like timers) in large root components (e.g. App.tsx) causes cascading re-renders in React and is a massive performance bottleneck, even if the value itself isn't used for rendering.
**Action:** Always verify if a primitive state variable from a store is actually used for rendering. If not, don't subscribe to it. If it is used, isolate it in a smaller dedicated child component to prevent re-rendering large parent components.

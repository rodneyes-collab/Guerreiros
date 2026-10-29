## 2024-10-29 - Investigating elapsedTime in App.tsx / ViewManager / MatchView
**Learning:** `App.tsx` has `elapsedTime` but it doesn't pass it to `MatchView`. Wait, `App.tsx` renders `MatchView`? No, `App.tsx` renders `ViewManager` but does NOT pass `elapsedTime` to `ViewManager`!
Let's see if `App.tsx` renders `ViewManager` and passes `elapsedTime` to it.

**Action:** Update `src/hooks/useAppLogic.ts` and `App.tsx` and `components/MatchView.tsx` to handle `elapsedTime` optimally. Wait, `MatchView` receives it as a prop from where? Let me check `src/hooks/useAppLogic.ts` to see what it exports.
Oh, `useAppLogic` is a hook! Does `App.tsx` or `ViewManager.tsx` use `useAppLogic`?

**Learning:** `App.tsx` calls `useAppLogic` and extracts many things from it. `useAppLogic` reads `elapsedTime` from the Zustand store. So every second, the store updates `elapsedTime`, causing `useAppLogic` to re-run, causing `App` to re-render.
To fix this, we need to completely isolate the `elapsedTime` read.
1. Remove `const elapsedTime = useStore(state => state.elapsedTime);` from `App.tsx`.
2. Remove `elapsedTime` from `useAppLogic.ts`. It should read it imperatively when saving: `const elapsedTime = useStore.getState().elapsedTime;`.
3. In `components/MatchView.tsx`, remove the `elapsedTime` prop.
4. Instead, inside `components/MatchView.tsx`, create a small component (or directly read it) but it's a large component. The memory states: "isolate the reactive subscription into small, dedicated UI components to prevent cascading re-renders".
So I'll create a `MatchTimer` component, or similar, that just reads `elapsedTime` from the store and formats it.
Wait, let's see how `elapsedTime` is used in `MatchView.tsx`.

**Learning:** `elapsedTime` is used in `MatchView.tsx` in two places:
1. `remainingCurrent = avgMatchDuration - elapsedTime;` inside some function, probably `calculateWaitTime` or similar, which estimates how long until someone plays.
2. `<span className="text-xs sm:text-sm font-black text-white font-mono tracking-widest">{formatTime(elapsedTime)}</span>` in the UI to display the current match timer.

Because of this, `elapsedTime` cannot just be passed as a prop from `App` or `useAppLogic` without causing a re-render of `App` and `MatchView` and ALL its children every second!

**Action Plan:**
1. In `src/hooks/useAppLogic.ts`:
   - Remove `const elapsedTime = useStore(state => state.elapsedTime);`
   - In `handleSaveMatch` (or where `match` object is created), use `const elapsedTime = useStore.getState().elapsedTime;`
2. In `App.tsx`:
   - Remove `const elapsedTime = useStore(state => state.elapsedTime);`
3. In `components/MatchView.tsx`:
   - Remove `elapsedTime` from `MatchViewProps` and from destructured props.
   - For the estimated time calculation (`remainingCurrent = avgMatchDuration - elapsedTime;`), read imperatively! The estimated time doesn't need to re-render every single second, it's fine if it recalculates when the component re-renders for other reasons (or we can extract that into a separate small component if it needs live updates, but reading imperatively `useStore.getState().elapsedTime` for a function `calculateWaitTime` is probably enough). Let's see if that function is used in render.
   - Wait, if `calculateWaitTime` is called in render, we shouldn't use `useStore.getState().elapsedTime` because it'll render stale values unless something else triggers a re-render. But wait time doesn't need second-by-second precision. A stale wait time (by a few seconds) is totally fine, or we can use a dedicated component.
   - For the timer display (`<span ...>{formatTime(elapsedTime)}</span>`), create a new small component `<LiveTimer />` inside `MatchView.tsx` (or in a separate file) that subscribes to `elapsedTime`:
     ```tsx
     const LiveTimer = () => {
       const elapsedTime = useStore(state => state.elapsedTime);
       return <span className="...">{formatTime(elapsedTime)}</span>;
     }
     ```

**Refinement:** `getPlayerPrediction` is called in render for every player in the waiting list! If it reads `elapsedTime` from the state, it causes re-renders. If I make it read imperatively, it won't update the UI. But wait, `elapsedTime` is used to calculate `remainingCurrent` for the estimated wait time! If `elapsedTime` is read imperatively inside `getPlayerPrediction`, the wait time won't tick down on the screen unless something else causes `MatchView` to re-render.
Is that bad? Actually, wait time doesn't need to tick down second by second. It's usually a static display until a new match starts. Wait, if I want it to tick down, maybe I should make a small component `<PlayerPrediction player={player} avgMatchDuration={...} />` that subscribes to `elapsedTime`?
Yes! Or we could use a custom hook that returns a throttled `elapsedTime` just for `MatchView` (e.g. updating every 60 seconds). Or we can extract it into `<PlayerPrediction player={p} ... />`.
Let's see how `getPlayerPrediction` is used.

**Refinement:** We have `elapsedTime` usage in `components/MatchView.tsx` inside `getPlayerPrediction`. If we remove `elapsedTime` from being a reactive state in `MatchView`, this wait time calculation won't be ticking down second-by-second unless `MatchView` re-renders for another reason. Since this is an estimated time (like 10:45 PM), it doesn't really matter if it ticks down second by second. Actually, `startTime` is based on `Date.now()`! So it's always calculating from now plus remaining time.
Wait, if `elapsedTime` isn't updating, `remainingCurrent` won't update, but `Date.now()` updates on every render. If it doesn't render, it stays the same, which is fine for a prediction label!
What about the main Match Timer? That needs to tick down every second. We can isolate that into a `<LiveTimer>` component inside `MatchView.tsx`.

**Learning:** `npm run test` failed with "FALHA NO TESTE: verifyClubGenerationRules", but memory mentions: "Note that `npm run test` (which runs `test:rules`) currently has known pre-existing failures on the main branch that are not regressions." So this is expected.

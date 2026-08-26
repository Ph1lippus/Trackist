# Admin Page Infinite Loading Fix

## Root Cause

In `src/pages/Admin.tsx`, lines 83–84 contain conditional early returns placed **before** any `useEffect` declarations (first hook after them is at line 116):

```tsx
if (adminLoading) return <div className="discover-loading">...</div>
if (profile && profile.role !== "admin") return <Navigate to="/" replace />
```

On initial render, `adminLoading` is `true`, so the component returns JSX immediately. Because the return happens before the `useEffect` calls, React never registers those effects. Consequently, the admin-check effect that would set `adminLoading` to `false` never executes, leaving the component permanently stuck on the loading spinner.

Note: React does not throw a hooks error here because the hook call order remains consistent across renders (the same early return always occurs before the same set of hooks). The hooks simply never get a chance to run.

## Fix

**Remove lines 83–84** from `src/pages/Admin.tsx`.

The component already contains identical loading/redirect guards **inside** the returned JSX at lines 518–546, which execute after all hooks have been registered. Removing the premature early returns allows the effects to run, update state, and trigger a re-render where the downstream guards take over.

## Exact Edit

**File:** `src/pages/Admin.tsx`

Delete these two lines:
```tsx
    if (adminLoading) return <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
    if (profile && profile.role !== "admin") return <Navigate to="/" replace />
```

## Validation

1. Run the app and navigate to `/admin` as a logged-in admin user.
2. Confirm the loading spinner appears briefly, then the admin panel renders.
3. Confirm non-admin users are redirected to `/`.
4. Confirm unauthenticated users are redirected to `/`.
5. Verify the browser console shows no React hooks warnings.

## Retry Button (Unstyled)

The admin page contains two "Retry" buttons (lines 521 and 538) with class `discover-loading__retry` that have **no corresponding CSS**. They serve as a manual fallback: if the `verify-admin` edge function call fails or times out, the user can click Retry to reload the page and try again.

Additionally, the `authError` guard block at lines 535–546 is **dead code**: `authError` is initialized at line 54 as `const [authError] = useState<string | null>(null)` — the setter is destructured away, so it is always `null` and the block never renders.

## Exact Edits

### 1. `src/pages/Admin.tsx`

Delete these two lines (already done):
```tsx
    if (adminLoading) return <div className="discover-loading"><div className="discover-spinner" /><p>Loading...</p></div>
    if (profile && profile.role !== "admin") return <Navigate to="/" replace />
```

### 2. `src/styles/global.css`

Add `.discover-loading__retry` styling after the existing `.discover-loading` block (~line 1593):

```css
.discover-loading__retry {
    background: transparent;
    border: 1px solid rgba(133, 138, 227, 0.4);
    color: var(--color-primary);
    padding: 0.5rem 1.25rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.2s ease;
}

.discover-loading__retry:hover {
    background: rgba(133, 138, 227, 0.1);
    border-color: var(--color-primary);
    color: #fff;
}
```

### 3. `src/pages/Admin.tsx` (dead code cleanup)

Optional but recommended: remove the dead `authError` guard block at lines 535–546, or fix it by capturing the state setter. If removed, also remove the `authError` state declaration at line 54.

## Validation

1. Run the app and navigate to `/admin` as a logged-in admin user.
2. Confirm the loading spinner appears briefly, then the admin panel renders.
3. Confirm non-admin users are redirected to `/`.
4. Confirm unauthenticated users are redirected to `/`.
5. Verify the browser console shows no React hooks warnings.
6. Visually confirm the Retry button (if ever shown) is styled consistently with the app theme.

## Risk Assessment

- **Risk:** Low. The removed guards are exact duplicates of guards already present later in the render path.
- **Rollback:** Re-insert lines 83–84 if needed.

# 主页优先处理面板配色与顺序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已确认的处理优先级重排主页 8 个优先处理面板，并为每个面板应用低饱和语义背景色，同时保持数据、筛选和响应式行为不变。

**Architecture:** 复用现有 `fleet-priority-card` 类型类名和 `is-active`/`is-selected` 状态，不新增组件或依赖。只在 `DeviceListPage` 调整 JSX 顺序，在全局 CSS 的现有面板样式区域调整背景与色带；通过页面级 Playwright 回归验证 DOM 顺序、颜色和现有布局。

**Tech Stack:** Next.js 15, React 18, TypeScript, CSS, Playwright, Vitest, ESLint.

---

## 文件职责

- `app/devices/page.tsx`：主页面板渲染和链接顺序；不触碰 `result.summary`、`fleetListHref` 或筛选参数。
- `app/globals.css`：主页面板背景色、边框和左侧激活色带；保留 hover、focus-visible、selected 和响应式规则。
- `tests/e2e/ui-refinement.spec.ts`：主页级顺序、背景色、4 列布局和现有交互回归。
- `docs/superpowers/specs/2026-08-10-fleet-priority-panels-design.md`：已确认的设计来源。

## Task 1: 添加面板顺序与配色的失败回归测试

**Files:**
- Modify: `tests/e2e/ui-refinement.spec.ts`，放在现有主页 summary/布局测试附近

- [ ] **Step 1: Add the failing Playwright assertion**

在 `test.describe('CT and inverter monitoring refinements', ...)` 中添加：

```ts
test('orders fleet priority panels by handling priority and applies semantic backgrounds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/devices')

  const cards = page.locator('.fleet-priority-card')
  await expect(cards).toHaveCount(8)

  const snapshot = await cards.evaluateAll((nodes) => nodes.map((node) => ({
    classes: node.className,
    title: node.querySelector('span')?.textContent?.trim(),
    background: getComputedStyle(node).backgroundColor
  })))

  expect(snapshot.map((item) => item.title)).toEqual([
    '正在逆流',
    '近7天长时逆流',
    '近7天微逆故障',
    '待处理离线',
    '存在离线微逆',
    '在线 / 活跃 CT',
    '近7日新上线',
    '7 日以上离线'
  ])
  expect(snapshot.map((item) => item.background)).toEqual([
    'rgb(255, 241, 242)',
    'rgb(255, 247, 237)',
    'rgb(254, 242, 242)',
    'rgb(255, 251, 235)',
    'rgb(245, 243, 255)',
    'rgb(240, 253, 244)',
    'rgb(239, 246, 255)',
    'rgb(248, 250, 252)'
  ])
})
```

- [ ] **Step 2: Run the focused test and verify it fails for the old order/colors**

Run:

```powershell
npm.cmd exec -- playwright test tests/e2e/ui-refinement.spec.ts -g "orders fleet priority panels"
```

Expected before implementation: FAIL because the current DOM order places “待处理离线”/“存在离线微逆” before “近7天微逆故障”, and the existing backgrounds do not match the approved palette.

## Task 2: Reorder the homepage JSX without changing data behavior

**Files:**
- Modify: `app/devices/page.tsx:164-262`

- [ ] **Step 1: Move the existing JSX blocks into the approved order**

Keep each block’s existing `href`, summary field, class names, `is-active` condition, `is-selected` condition, `aria-current`, and text unchanged. The order inside `.fleet-priority-grid` must become:

```tsx
critical
sustained-reverse
inv-fault
warning
inv-offline
online
newly-online
stale-offline
```

Do not change the device sort priority at lines 117-130, service calls, query parameters, or summary calculations.

- [ ] **Step 2: Re-run the focused test to confirm only the CSS assertions remain to be fixed**

Run the same Playwright command from Task 1. Expected: the title-order assertion passes; the background-color assertion still fails until Task 3 is applied.

## Task 3: Apply the approved low-saturation semantic palette

**Files:**
- Modify: `app/globals.css:3723-3879`

- [ ] **Step 1: Set the eight base backgrounds and inactive neutral stripes**

Use the existing selectors and set these background values:

```css
.fleet-priority-card.critical { background: #fff1f2; }
.fleet-priority-card.sustained-reverse { background: #fff7ed; }
.fleet-priority-card.inv-fault { background: #fef2f2; }
.fleet-priority-card.warning { background: #fffbeb; }
.fleet-priority-card.inv-offline { background: #f5f3ff; }
.fleet-priority-card.online { background: #f0fdf4; }
.fleet-priority-card.newly-online { background: #eff6ff; }
.fleet-priority-card.stale-offline { background: #f8fafc; }
```

Keep inactive strips neutral (`#94a3b8`) where the existing selector already uses that state. This keeps a zero count from looking like an active incident.

- [ ] **Step 2: Set active stripe colors and preserve approved interaction states**

Use the following active stripe colors without changing hover/focus/selected behavior:

```css
.fleet-priority-card.critical.is-active::before { background: #dc2626; }
.fleet-priority-card.sustained-reverse.is-active::before { background: #ea580c; }
.fleet-priority-card.inv-fault.is-active::before { background: #be123c; }
.fleet-priority-card.warning.is-active::before { background: #d97706; }
.fleet-priority-card.inv-offline.is-active::before { background: #7c3aed; }
.fleet-priority-card.online::before { background: #16a34a; }
.fleet-priority-card.newly-online.is-active::before { background: #2563eb; }
.fleet-priority-card.stale-offline::before { background: #64748b; }
```

Keep text dark enough for the existing light backgrounds and do not use color as the only status signal; titles, counts, descriptions, and links remain unchanged.

- [ ] **Step 3: Re-run the focused test**

Run:

```powershell
npm.cmd exec -- playwright test tests/e2e/ui-refinement.spec.ts -g "orders fleet priority panels"
```

Expected: PASS with the eight approved titles and eight approved RGB background values.

## Task 4: Run regression and static verification

**Files:**
- Verify: `app/devices/page.tsx`
- Verify: `app/globals.css`
- Verify: `tests/e2e/ui-refinement.spec.ts`

- [ ] **Step 1: Run all unit tests**

Run:

```powershell
npm.cmd run test:unit
```

Expected: all existing unit test files and tests pass; no service/domain test should change because this work is presentation-only.

- [ ] **Step 2: Run targeted ESLint and typecheck**

Run:

```powershell
npm.cmd exec -- eslint app/devices/page.tsx tests/e2e/ui-refinement.spec.ts --max-warnings=0
npm.cmd run typecheck
```

Expected: ESLint passes. Typecheck must not introduce an application-source error; report any pre-existing test-only errors separately.

- [ ] **Step 3: Run the full existing UI refinement suite and direct page verification**

Run:

```powershell
npm.cmd exec -- playwright test tests/e2e/ui-refinement.spec.ts
git diff --check
```

Expected: the UI suite passes when the local test server is available; `git diff --check` emits no whitespace errors. If the host runner hits its known `os.userInfo()/ENOMEM` startup issue, use the existing local Next server with direct Playwright to verify 1440px (4 columns), 390px (no document horizontal overflow), all eight titles/order, and the eight computed backgrounds.

- [ ] **Step 4: Update `tasks/todo.md` with evidence**

Record the passing test count, lint result, page-level order/color result, any unchanged typecheck limitation, and that no Git stage/commit/push was performed.

## Self-review against the design

- Spec coverage: order, palette, inactive/active semantics, existing interaction states, responsive behavior, scope boundaries, and acceptance tests are covered by Tasks 1–4.
- Placeholder scan: no unfinished marker or unspecified implementation step is used.
- Type consistency: existing class names and `result.summary` fields are reused; no new type, prop, service, or API is introduced.

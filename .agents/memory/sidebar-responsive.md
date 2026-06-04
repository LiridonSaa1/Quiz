---
name: Sidebar responsive breakpoints
description: How sidebar width and content padding are set for small vs large laptop screens
---

All three layout files (Admin, Student, Teacher) use this pattern:

**Sidebar width**: `w-52 xl:w-60` — 208px at lg (1024px+), 240px at xl (1280px+)
**Margin/offset**: `lg:ml-52 xl:ml-60` and `lg:left-52 xl:left-60`
**Content padding**: `px-5 xl:px-7` at lg, `px-7` at xl (no longer px-8)
**Vertical padding**: `py-4 lg:py-5 xl:py-6`

**Teacher layout extra**: Collapse state auto-initializes to `true` if `window.innerWidth < 1280` (unless localStorage has a saved preference). Collapse preference is persisted under key `teacher_sidebar_collapsed`.

**Login page**: Left panel is `lg:w-[50%] xl:w-[55%]`, inner padding `px-8 xl:px-14`, hero text `text-[2.6rem] xl:text-[3.5rem]`.

**Why:** On 1024px-1366px laptops the old w-60 sidebar left too little content area. The xl breakpoint (1280px) keeps the full layout for larger screens.

**How to apply:** When adding new layouts or adjusting existing ones, always use lg:/xl: pairs for sidebar-related widths and offsets.

---
name: Missing jsonwebtoken package
description: server.ts uses jsonwebtoken; if not installed the server crashes at startup
---

server.ts imports `jsonwebtoken`. If not present in node_modules the server crashes with:
`ERR_MODULE_NOT_FOUND: Cannot find package 'jsonwebtoken'`

Fix: `npm install jsonwebtoken @types/jsonwebtoken`

**Why:** Was missing from package.json dependencies but referenced in server.ts code.

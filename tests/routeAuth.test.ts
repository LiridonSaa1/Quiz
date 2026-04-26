import test from "node:test";
import assert from "node:assert/strict";
import { canAccessTeacherCourses, isAdmin, isAdminSeedAllowed } from "../src/lib/routeAuth.js";

test("isAdmin recognizes only admin role", () => {
  assert.equal(isAdmin({ userId: "u1", role: "admin" }), true);
  assert.equal(isAdmin({ userId: "u1", role: "teacher" }), false);
});

test("canAccessTeacherCourses allows admin access to any teacher scope", () => {
  assert.equal(canAccessTeacherCourses({ userId: "a1", role: "admin" }, "teacher-1"), true);
});

test("canAccessTeacherCourses restricts teacher to own userId", () => {
  assert.equal(canAccessTeacherCourses({ userId: "t1", role: "teacher" }, "t1"), true);
  assert.equal(canAccessTeacherCourses({ userId: "t1", role: "teacher" }, "t2"), false);
});

test("canAccessTeacherCourses blocks non-teacher and empty targets", () => {
  assert.equal(canAccessTeacherCourses({ userId: "s1", role: "student" }, "t1"), false);
  assert.equal(canAccessTeacherCourses({ userId: "a1", role: "admin" }, ""), false);
});

test("isAdminSeedAllowed only in development", () => {
  assert.equal(isAdminSeedAllowed("development"), true);
  assert.equal(isAdminSeedAllowed("production"), false);
  assert.equal(isAdminSeedAllowed(undefined), false);
});

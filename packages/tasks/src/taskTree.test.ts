import assert from "node:assert/strict";
import test from "node:test";
import type { GoogleTask } from "./useTasks";
import { buildTaskTree, countTasks } from "./taskTree.ts";

const task = (id: string, extra: Partial<GoogleTask> = {}): GoogleTask => ({
  id,
  title: id,
  status: "needsAction",
  ...extra,
});

const tasks: GoogleTask[] = [
  task("b", { position: "2", due: "2026-01-01", updated: "2026-03-01" }),
  task("a", { position: "1", due: "2026-02-01", updated: "2026-01-01", status: "completed" }),
  task("a1", { parent: "a", position: "1" }),
  task("a2", { parent: "a", position: "0", status: "completed" }),
  task("orphan", { parent: "missing", position: "3" }),
];

test("keeps parents of matching subtasks visible", () => {
  const tree = buildTaskTree(tasks, "needsAction", "position");
  assert.deepEqual(tree.topLevel.map((t) => t.id), ["a", "b", "orphan"]);
  assert.deepEqual(tree.childrenByParent.get("a")?.map((t) => t.id), ["a1"]);
});

test("sorts by due date and by most recently updated", () => {
  assert.deepEqual(buildTaskTree(tasks, "all", "dueDate").topLevel.map((t) => t.id), ["b", "a", "orphan"]);
  assert.deepEqual(buildTaskTree(tasks, "all", "updatedAt").topLevel.map((t) => t.id), ["b", "a", "orphan"]);
  assert.deepEqual(buildTaskTree(tasks, "all", "position").childrenByParent.get("a")?.map((t) => t.id), ["a2", "a1"]);
});

test("subtasks whose parent is not loaded are shown at top level", () => {
  assert.ok(buildTaskTree(tasks, "all", "position").topLevel.some((t) => t.id === "orphan"));
});

test("counts use Google status vocabulary", () => {
  assert.equal(countTasks(tasks, "all"), 5);
  assert.equal(countTasks(tasks, "completed"), 2);
  assert.equal(countTasks(tasks, "needsAction"), 3);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  NoticeRingBuffer,
  type SystemNotice
} from "../src/runtime/notice-ring-buffer.js";

test("NoticeRingBuffer stores and drains notices in FIFO order", () => {
  const buffer = new NoticeRingBuffer(10);
  const n1: SystemNotice = { id: "n1", level: "info", message: "Task started", timestamp: 1000 };
  const n2: SystemNotice = { id: "n2", level: "warn", message: "High token usage", timestamp: 1050 };

  buffer.push(n1);
  buffer.push(n2);

  assert.equal(buffer.size(), 2);
  assert.equal(buffer.peek()?.id, "n1");

  const drained = buffer.drain();
  assert.equal(drained.length, 2);
  assert.equal(drained[0]?.id, "n1");
  assert.equal(drained[1]?.id, "n2");

  assert.equal(buffer.size(), 0);
  assert.deepEqual(buffer.drain(), []);
});

test("NoticeRingBuffer evicts oldest notice when capacity is reached", () => {
  const buffer = new NoticeRingBuffer(3);

  buffer.push({ id: "n1", level: "info", message: "First", timestamp: 1 });
  buffer.push({ id: "n2", level: "info", message: "Second", timestamp: 2 });
  buffer.push({ id: "n3", level: "info", message: "Third", timestamp: 3 });

  assert.equal(buffer.size(), 3);

  // Pushing fourth evicts n1
  buffer.push({ id: "n4", level: "info", message: "Fourth", timestamp: 4 });

  assert.equal(buffer.size(), 3);
  const drained = buffer.drain();
  assert.equal(drained[0]?.id, "n2");
  assert.equal(drained[1]?.id, "n3");
  assert.equal(drained[2]?.id, "n4");
});

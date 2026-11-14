/**
 * High-Efficiency In-Memory Circular Ring Buffer for ASEN.
 * Decouples background event notifications from blocking terminal tasks.
 * Fixed capacity (default 50 slots) prevents memory leaks and ensures O(1) operations.
 */

export interface SystemNotice {
  readonly id: string;
  readonly level: "info" | "warn" | "error" | "success";
  readonly message: string;
  readonly timestamp: number;
}

export class NoticeRingBuffer {
  private readonly capacity: number;
  private readonly buffer: (SystemNotice | null)[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(capacity = 50) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array(this.capacity).fill(null);
  }

  /**
   * Add a notice to the buffer.
   * If capacity is reached, automatically evicts the oldest notice (FIFO).
   */
  public push(notice: SystemNotice): void {
    if (this.count === this.capacity) {
      // Overwrite oldest entry at head and advance head
      this.buffer[this.head] = notice;
      this.head = (this.head + 1) % this.capacity;
      this.tail = (this.tail + 1) % this.capacity;
    } else {
      this.buffer[this.tail] = notice;
      this.tail = (this.tail + 1) % this.capacity;
      this.count++;
    }
  }

  /**
   * Drain and return all buffered notices in chronological order, clearing the buffer.
   */
  public drain(): SystemNotice[] {
    if (this.count === 0) {
      return [];
    }

    const items: SystemNotice[] = [];
    let idx = this.head;
    for (let i = 0; i < this.count; i++) {
      const item = this.buffer[idx];
      if (item != null) {
        items.push(item);
      }
      this.buffer[idx] = null;
      idx = (idx + 1) % this.capacity;
    }

    this.head = 0;
    this.tail = 0;
    this.count = 0;
    return items;
  }

  /**
   * Inspect the oldest notice without removing it.
   */
  public peek(): SystemNotice | null {
    if (this.count === 0) return null;
    return this.buffer[this.head] ?? null;
  }

  /**
   * Return the current number of queued notices.
   */
  public size(): number {
    return this.count;
  }

  /**
   * Clear all queued notices.
   */
  public clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}

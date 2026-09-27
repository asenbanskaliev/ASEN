import type { Candidate, Phase, TaskState } from "../core/types.js";
import { transition } from "../core/state-machine.js";

export class EngineeringTask {
  #state: TaskState;
  constructor(id: string, title: string) {
    this.#state = { id, title, phase: "DISCOVERING", blockers: [] };
  }
  get state(): Readonly<TaskState> { return this.#state; }
  move(to: Phase): void { this.#state = { ...this.#state, phase: transition(this.#state.phase, to) }; }
  bind(candidate: Candidate): void { this.#state = { ...this.#state, candidateId: candidate.id }; }
  block(reason: string): void { this.#state = { ...this.#state, phase: "BLOCKED", blockers: [...this.#state.blockers, reason] }; }
}

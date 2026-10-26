/**
 * One handler per press key per runtime. A press can reach the app twice at once — the headless
 * task and the foreground listener, or a replay and the launch response — and only one of them
 * may apply it. `begin` runs the durable claim (the inbox write) for the first caller; a second
 * caller for the same key waits for that write before it is answered, so a false always means
 * "written down, or handled for good" and never "someone is writing it right now". The caller
 * that discards the OS's own copy of a press (the launch response) relies on that.
 */
export class ClaimGate {
  private readonly inFlight = new Set<string>();
  /** Claims whose durable write is still running, by key. */
  private readonly claims = new Map<string, Promise<boolean>>();

  /** Being handled right now in this runtime. */
  has(key: string): boolean {
    return this.inFlight.has(key);
  }

  /**
   * Claim `key`. `write` records the claim durably and resolves true when this caller owns the
   * press, false when an earlier process already handled it. A write that throws releases the
   * claim (so a later attempt can try again) and the error reaches the caller.
   */
  async begin(key: string, write: () => Promise<boolean>): Promise<boolean> {
    while (this.claims.has(key)) await this.claims.get(key)!.catch(() => undefined);
    if (this.inFlight.has(key)) return false;
    this.inFlight.add(key);
    const claim = (async () => {
      let fresh: boolean;
      try {
        fresh = await write();
      } catch (err) {
        this.inFlight.delete(key);
        throw err;
      }
      if (!fresh) this.inFlight.delete(key);
      return fresh;
    })();
    this.claims.set(key, claim);
    try {
      return await claim;
    } finally {
      this.claims.delete(key);
    }
  }

  /** The press is handled (or given up on for now): a later `begin` may claim it again. */
  end(key: string): void {
    this.inFlight.delete(key);
  }
}

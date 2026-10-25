/** Serializes tagged production turns per project within one local bridge. */
export class ProductionTurns {
  private active = new Set<string>();

  async run<T>(project: unknown, action: () => Promise<T>): Promise<T> {
    if (typeof project !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(project)) throw new Error('Invalid production project.');
    if (this.active.has(project)) throw new Error('This project already has an active production turn. Wait for it to finish before retrying.');
    // Acquisition occurs synchronously before action or any await. A socket
    // disconnect/cancel request is not proof that the agent stopped writing.
    this.active.add(project);
    try { return await action(); }
    finally { this.active.delete(project); }
  }
}

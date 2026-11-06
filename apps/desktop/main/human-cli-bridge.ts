import {
  humanCliDesktopCommandSchema,
  type HumanCliWorkerCommand,
  type HumanCliState,
  type HumanCliDesktopState,
} from "@ajankati/contracts";

/** One desktop owner epoch. Native dialogs are supplied by main, never preload. */
export class HumanCliBridge {
  private closed = false;
  private busy = false;
  constructor(
    private readonly send: (
      command: HumanCliWorkerCommand,
    ) => Promise<HumanCliState>,
    private readonly choose: () => Promise<string | null>,
    private readonly confirm: (
      session: NonNullable<HumanCliState["session"]>,
    ) => Promise<boolean>,
  ) {}
  close(): void {
    this.closed = true;
  }
  private check(): void {
    if (this.closed) throw new Error("OWNER_STOPPED");
  }
  async execute(input: unknown): Promise<HumanCliDesktopState | null> {
    const command = humanCliDesktopCommandSchema.parse(input);
    this.check();
    if (this.busy) throw new Error("BUSY");
    this.busy = true;
    try {
      let state: HumanCliState;
      if (command.method === "select-workspace") {
        const path = await this.choose();
        this.check();
        if (path === null) return null;
        state = await this.send({
          method: "register-workspace",
          payload: { path },
        });
      } else if (command.method === "approve") {
        const before = await this.send({ method: "list", payload: {} });
        this.check();
        const session = before.session;
        if (
          !session ||
          session.sessionId !== command.payload.sessionId ||
          session.status !== "prepared" ||
          !session.approvalToken
        )
          throw new Error("CONSENT_INVALID");
        let approved = false;
        try {
          approved = await this.confirm(structuredClone(session));
        } catch {
          this.check();
          await this.send({
            method: "stop",
            payload: { sessionId: session.sessionId, approved: true },
          });
          throw new Error("CONSENT_FAILED");
        }
        this.check();
        state = await this.send(
          approved
            ? {
                method: "start",
                payload: {
                  sessionId: session.sessionId,
                  approvalToken: session.approvalToken,
                  approved: true,
                },
              }
            : {
                method: "stop",
                payload: { sessionId: session.sessionId, approved: true },
              },
        );
      } else if (command.method === "stop") {
        state = await this.send({
          method: "stop",
          payload: { ...command.payload, approved: true },
        });
      } else state = await this.send(command);
      this.check();
      const { session, ...rest } = state;
      if (!session) return { ...rest, session: null };
      const { approvalToken: _token, ...safeSession } = session;
      void _token;
      return { ...rest, session: safeSession };
    } finally {
      this.busy = false;
    }
  }
}

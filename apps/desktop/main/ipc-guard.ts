/** Structural view of the Electron fields the guard needs; keeps it unit-testable. */
export type GuardedEvent = {
  sender: unknown;
  senderFrame: { url: string } | null | undefined;
};
export type GuardContext = {
  quitting: boolean;
  webContents: { mainFrame: unknown } | undefined;
  trustedUrl: string;
};

/** True only for the live main frame of the one trusted window at the exact local page.
 * Any missing, destroyed, sub-frame or navigated sender is rejected. */
export function isTrustedSender(
  event: GuardedEvent,
  context: GuardContext,
): boolean {
  const { webContents } = context;
  if (context.quitting || !webContents || event.sender !== webContents)
    return false;
  const frame = event.senderFrame;
  return (
    !!frame &&
    frame === webContents.mainFrame &&
    frame.url === context.trustedUrl
  );
}

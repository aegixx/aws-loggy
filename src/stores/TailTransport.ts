export interface TailTransport {
  start(): void;
  stop(): void;
  isActive(): boolean;
  resetStartTimestamp(): void;
}

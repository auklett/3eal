import { vi } from 'vitest';

// Mock cloudflare:workers globally
globalThis.WebSocketRequestResponsePair = class {
  constructor(public request: string, public response: string) {}
} as any;

class MockDurableObject {
  constructor(public ctx: any, public env: any) {
    // The real DurableObject sets this.ctx = ctx
  }
}

vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
  WebSocketRequestResponsePair: globalThis.WebSocketRequestResponsePair
}));

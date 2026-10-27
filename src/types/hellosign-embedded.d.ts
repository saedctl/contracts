declare module "hellosign-embedded" {
  interface OpenOptions {
    skipDomainVerification?: boolean;
    testMode?: boolean;
    allowCancel?: boolean;
    container?: HTMLElement;
    locale?: string;
    timeout?: number;
  }
  export default class HelloSign {
    constructor(options?: { clientId?: string });
    open(url: string, options?: OpenOptions): void;
    close(): void;
    on(event: "sign" | "decline" | "cancel" | "finish" | "close" | "error" | "ready" | "open", cb: (data?: Record<string, unknown>) => void): void;
    off(event: string): void;
  }
}

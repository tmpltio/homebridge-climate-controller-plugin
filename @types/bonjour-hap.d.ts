declare module 'bonjour-hap' {
  export interface MulticastOptions {
    interface?: string;
    port?: number;
    ip?: string;
    ttl?: number;
    loopback?: boolean;
    reuseAddr?: boolean;
  }

  const bonjour: {
    publish: (options: any) => void;
    unpublishAll: (callback: () => void) => void;
    destroy: () => void;
  };

  export default bonjour;
}
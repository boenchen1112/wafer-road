/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('../../src/index');
    durableNamespaces: 'WaferRoom';
  }
  interface Env {
    ROOMS: DurableObjectNamespace<import('../../src/index').WaferRoom>;
  }
}

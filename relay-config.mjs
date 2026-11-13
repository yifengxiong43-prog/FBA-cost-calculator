// Local mode uses the same-origin Node relay; the hosted site uses the deployed Worker.
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
export const RELAY_ENDPOINT = isLocal
  ? `${window.location.origin}/proxy`
  : 'https://art-cost-desk-relay.art-cost-desk.workers.dev';

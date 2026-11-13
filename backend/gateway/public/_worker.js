// Use Cloudflare's internal service binding; the provider secret stays in RELAY.
export default {
  fetch(request, env) {
    return env.RELAY.fetch(request);
  }
};

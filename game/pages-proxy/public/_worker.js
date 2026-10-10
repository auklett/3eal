export default {
  async fetch(request, env) {
    return env.WORKER.fetch(request);
  }
};

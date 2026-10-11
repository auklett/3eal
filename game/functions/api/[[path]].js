export async function onRequest(context) {
  return context.env.WORKER.fetch(context.request);
}
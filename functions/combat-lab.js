export function onRequest({ request }) {
  return Response.redirect(new URL("/", request.url), 302);
}

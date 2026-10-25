/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// En un hosting sin cabeceras la primera visita no esta aislada y la pagina tiene
// que recargarse para que este worker le sirva el documento con ellas. Tomar el
// control de inmediato hace que esa recarga sea la unica.
void self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// mGBA necesita SharedArrayBuffer, que solo existe si el documento esta aislado.
// Los hostings estaticos sin control de cabeceras (GitHub Pages, por ejemplo) no
// pueden mandarlas, asi que las anadimos aqui al servir el documento navegado.
const withIsolationHeaders = (response: Response): Response => {
  if (!response || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const documentHandler = createHandlerBoundToURL('index.html');
registerRoute(
  new NavigationRoute(async (options) => withIsolationHeaders(await documentHandler(options)))
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

import { handleApi } from './server/api.mjs'
import { serveReplayAsset } from './server/replay-asset.mjs'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const replay = /^\/api\/replay\/(round-0[12]\.mp4)$/.exec(url.pathname)
    if (replay) return serveReplayAsset(request, env.ASSETS, replay[1])
    const api = await handleApi(request, env)
    if (api) return api

    if (url.pathname === '/admin') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
      }
      const page = await env.ASSETS.fetch(request)
      const response = new Response(page.body, page)
      response.headers.set('X-Robots-Tag', 'noindex')
      response.headers.set('Cache-Control', 'no-store')
      return response
    }

    return env.ASSETS.fetch(request)
  },
}

import { getByteRange } from './media.mjs'

function sliceStream(body, offset, length) {
  const reader = body.getReader()
  let skip = offset
  let remaining = length
  return new ReadableStream({
    async pull(controller) {
      while (remaining > 0) {
        const { value, done } = await reader.read()
        if (done) {
          controller.error(new Error('回放文件长度不足'))
          return
        }
        if (skip >= value.byteLength) {
          skip -= value.byteLength
          continue
        }
        const chunk = value.subarray(skip, skip + remaining)
        skip = 0
        remaining -= chunk.byteLength
        controller.enqueue(chunk)
        if (remaining === 0) {
          controller.close()
          await reader.cancel().catch(() => {})
        }
        return
      }
    },
    cancel(reason) { return reader.cancel(reason) },
  })
}

export async function serveReplayAsset(request, assets, filename) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const target = new URL('/media/' + filename, request.url)
  const asset = await assets.fetch(new Request(target, request))
  if (asset.status !== 200) return asset

  const headers = new Headers(asset.headers)
  headers.set('Accept-Ranges', 'bytes')
  const rangeHeader = request.headers.get('Range')
  const ifRange = request.headers.get('If-Range')
  const matches = !ifRange || ifRange === headers.get('ETag') || ifRange === headers.get('Last-Modified')
  if (request.method === 'HEAD' || !asset.body || !/^bytes=/i.test(rangeHeader ?? '') || !matches) {
    return new Response(asset.body, { headers })
  }

  const declaredSize = Number(headers.get('Content-Length'))
  // 仅这两份随站点分发的小型 MP4 使用此路由。上传视频由 R2 提供分段读取。
  const buffer = declaredSize > 0 ? null : await asset.arrayBuffer()
  const size = buffer?.byteLength ?? declaredSize
  const range = getByteRange(rangeHeader, size)
  if (!range) {
    if (!buffer) await asset.body.cancel().catch(() => {})
    headers.delete('Content-Length')
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set('Content-Length', String(range.length))
  headers.set('Content-Range', `bytes ${range.offset}-${range.last}/${size}`)
  const bytes = buffer
    ? buffer.slice(range.offset, range.last + 1)
    : sliceStream(asset.body, range.offset, range.length)
  return new Response(bytes, { status: 206, headers })
}

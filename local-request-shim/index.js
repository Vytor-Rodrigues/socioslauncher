'use strict'

const https = require('https')
const http = require('http')
const { PassThrough } = require('stream')
const { URL } = require('url')

const MAX_REDIRECTS = 10

// Block redirects to private/internal IP ranges to prevent SSRF
function isInternalHostname(hostname) {
  if (hostname === 'localhost') return true
  if (/^127\./.test(hostname)) return true
  if (/^10\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^172\./.test(hostname)) {
    const second = parseInt(hostname.split('.')[1], 10)
    if (second >= 16 && second <= 31) return true
  }
  return false
}

function parseBody(buffer, opts) {
  if (opts && opts.json && typeof opts.json === 'object') {
    try { return JSON.parse(buffer.toString('utf8')) } catch (e) { return buffer.toString('utf8') }
  }
  if (opts && opts.encoding === null) return buffer
  return buffer.toString('utf8')
}

function executeRequest(urlStr, opts, callback, out, redirectCount) {
  if (redirectCount > MAX_REDIRECTS) {
    const err = Object.assign(new Error('EMAXREDIRECTS'), { code: 'EMAXREDIRECTS' })
    out.emit('error', err)
    if (callback) callback(err)
    return
  }

  let parsedUrl
  try { parsedUrl = new URL(urlStr) } catch (e) {
    out.emit('error', e)
    if (callback) callback(e)
    return
  }

  const isHttps = parsedUrl.protocol === 'https:'
  if (!isHttps && parsedUrl.protocol !== 'http:') {
    const err = new Error(`Unsupported protocol: ${parsedUrl.protocol}`)
    out.emit('error', err)
    if (callback) callback(err)
    return
  }

  const client = isHttps ? https : http
  const headers = Object.assign({}, opts.headers || {})
  let bodyData = null

  if (opts.json && typeof opts.json === 'object') {
    bodyData = Buffer.from(JSON.stringify(opts.json), 'utf8')
    headers['content-type'] = 'application/json'
    headers['content-length'] = bodyData.length
  }

  const reqOpts = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: opts.method || 'GET',
    headers,
  }

  if (opts.pool && opts.pool.maxSockets && opts._agents) {
    reqOpts.agent = isHttps ? opts._agents.https : opts._agents.http
  }

  const req = client.request(reqOpts, (res) => {
    const status = res.statusCode

    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      const loc = res.headers.location
      res.resume()
      if (loc.startsWith('http://') || loc.startsWith('https://')) {
        try {
          const redirectParsed = new URL(loc)
          if (isInternalHostname(redirectParsed.hostname)) {
            const err = Object.assign(new Error('Redirect to internal address blocked'), { code: 'ESSRF' })
            out.emit('error', err)
            if (callback) callback(err)
            return
          }
        } catch (e) {
          out.emit('error', e)
          if (callback) callback(e)
          return
        }
        const newMethod = (status === 303 || ((status === 301 || status === 302) && (opts.method || 'GET') === 'POST')) ? 'GET' : (opts.method || 'GET')
        executeRequest(loc, Object.assign({}, opts, { method: newMethod }), callback, out, redirectCount + 1)
        return
      }
    }

    out.emit('response', res)

    if (callback) {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        try { callback(null, res, parseBody(Buffer.concat(chunks), opts)) } catch (e) { callback(e) }
      })
      res.on('error', (e) => callback(e))
    } else {
      res.on('error', (e) => out.emit('error', e))
      res.pipe(out)
    }
  })

  if (opts.timeout) {
    req.setTimeout(opts.timeout, () => {
      req.destroy(Object.assign(new Error('ESOCKETTIMEDOUT'), { code: 'ESOCKETTIMEDOUT' }))
    })
  }

  req.on('error', (err) => {
    out.emit('error', err)
    if (callback) callback(err)
  })

  if (bodyData) req.write(bodyData)
  req.end()
}

function createRequest(defaults) {
  let _agents = null
  if (defaults.pool && defaults.pool.maxSockets) {
    _agents = {
      https: new https.Agent({ maxSockets: defaults.pool.maxSockets }),
      http: new http.Agent({ maxSockets: defaults.pool.maxSockets }),
    }
  }

  function mergeOpts(urlOrOpts, methodOverride) {
    const isStr = typeof urlOrOpts === 'string'
    const opts = isStr
      ? Object.assign({}, defaults, { url: urlOrOpts })
      : Object.assign({}, defaults, urlOrOpts)
    if (methodOverride) opts.method = methodOverride
    if (_agents) opts._agents = _agents
    return opts
  }

  function request(urlOrOpts, maybeCallback) {
    const opts = mergeOpts(urlOrOpts)
    const url = opts.uri || opts.url
    const callback = typeof maybeCallback === 'function' ? maybeCallback : null
    const out = new PassThrough()
    out.on('error', () => {})
    setImmediate(() => executeRequest(url, opts, callback, out, 0))
    return out
  }

  request.defaults = (moreDefaults) => createRequest(Object.assign({}, defaults, moreDefaults))

  request.get = (urlOrOpts, callback) => {
    const opts = mergeOpts(urlOrOpts, 'GET')
    const url = opts.uri || opts.url
    const cb = typeof callback === 'function' ? callback : null
    const out = new PassThrough()
    out.on('error', () => {})
    setImmediate(() => executeRequest(url, opts, cb, out, 0))
    return out
  }

  request.post = (urlOrOpts, callback) => {
    const opts = mergeOpts(urlOrOpts, 'POST')
    const url = opts.uri || opts.url
    const cb = typeof callback === 'function' ? callback : null
    const out = new PassThrough()
    out.on('error', () => {})
    setImmediate(() => executeRequest(url, opts, cb, out, 0))
    return out
  }

  return request
}

module.exports = createRequest({})

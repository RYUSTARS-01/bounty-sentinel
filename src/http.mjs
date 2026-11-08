// Tiny fetch helper: timeout + one retry + JSON parsing.
const UA = 'bounty-sentinel/0.1 (+https://github.com/RYUSTARS-01/bounty-sentinel)'

export async function getJson(url, { headers = {}, timeoutMs = 20000, retries = 1 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': UA, ...headers },
        signal: controller.signal,
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 160)}`)
      return { json: JSON.parse(text), headers: res.headers }
    } catch (err) {
      lastError = err
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

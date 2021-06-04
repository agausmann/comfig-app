addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

/**
 * gatherResponse awaits and returns a response body as JSON.
 * @param {Response} response
 */
async function gatherResponse(response) {
  return await response.json()
}

const reqHeaders = {
  headers: {
    'User-Agent': 'mastercomfig-worker',
  },
}

const reqGHAPIHeaders = {
  headers: {
    'Authorization': btoa('Basic ' + GH_USERNAME + ':' + GH_PASSWORD),
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json;charset=UTF-8',
    ...reqHeaders.headers
  }
}

const reqGHRawHeaders = {
  headers: {
    'Accept': 'application/text',
    'Content-Type': 'application/text;charset=UTF-8',
    ...reqHeaders.headers
  }
}

// Return JSON with 24 hour cache
const resHeaders = {
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
    'Cache-Control': 'max-age=86400',
    'Access-Control-Allow-Origin': 'https://mastercomfig.com'
  },
}

const cacheOpt = {
    expirationTtl: 86400
}

function stringify(data) {
  return JSON.stringify(data)
}

function getVersion(data) {
  // Get tag name for version
  let tag_name = data.tag_name
  let version = null
  if (tag_name) {
      // Remove the v prefix some releases have
      version = tag_name.indexOf('v') === 0 ? tag_name.substr(1) : tag_name
  }
  return version
}

function getVersions(data) {
  let limit = Math.min(5, data.length)
  let versions = []
  for (let i = 0; i < limit; i++) {
    versions.push(getVersion(data[i]))
  }
  return stringify(versions)
}

function getVersionedKey(key, version) {
  if (!version) {
    version = "1"
  }
  return key + "-" + version
}

const rv = ["https://api.github.com/repos/mastercomfig/mastercomfig/releases/latest", reqGHAPIHeaders, getVersionedKey("mastercomfig-version", 1), getVersion]
const rv2 = ["https://api.github.com/repos/mastercomfig/mastercomfig/releases", reqGHAPIHeaders, getVersionedKey("mastercomfig-version", 2), getVersions]
const rm = ["https://raw.githubusercontent.com/mastercomfig/mastercomfig/release/data/modules.json", reqGHRawHeaders, "mastercomfig-modules", stringify]
const rp = ["https://raw.githubusercontent.com/mastercomfig/mastercomfig/release/data/preset_modules.json", reqGHRawHeaders, "mastercomfig-preset-modules", stringify]

async function forceUpdate(version) {
    let updated = await updateData([version === "2" ? rv2 : rv, rm, rp])
    let resBody = (version === "2" ? "{\"v\":" + updated[0] + "," : "{\"v\":\"" + updated[0] + "\","  ) +
                    "\"m\":" + updated[1] + "," +
                    "\"p\":" + updated[2] + "}"
    await storeData(getVersionedKey("mastercomfig-api-response", version), resBody)
}

addEventListener('scheduled', event => {
  event.waitUntil(forceUpdate("1"))
})

async function storeData(key, value) {
  return MASTERCOMFIG.put(key, value, cacheOpt)
}

async function noop() {
    return null
}

async function updateData(requests) {
  let data = []
  try {
    // Fetch
    let pr = []
    let hasValidRequest = false
    requests.forEach((r) => {
        if (r) {
            hasValidRequest = true
            pr.push(fetch(r[0], r[1]))
        } else {
            pr.push(noop())
        }
    })
    if (!hasValidRequest) {
      return data
    }
    data.fill(null, pr.length)
    const responses = await Promise.all(pr)
    // Parse response
    let pg = []
    responses.forEach((r) => {
        if (r) {
            pg.push(gatherResponse(r))
        } else {
            pg.push(noop())
        }
    })
    // Store and return results
    const results = await Promise.all(pg)
    results.forEach((r, i) => {
        if (!r) {
            return
        }
        let value = requests[i][3] ? requests[i][3](r) : r
        data[i] = value
        storeData(requests[i][2], value)
    })
  } catch (error) {
    console.error(error)
  } finally {
    return data
  }
}

const webhookPathname = "/" + GH_WEBHOOK_ID

async function handleRequest(request) {
  const url = new URL(request.url)
  let version = url.searchParams.get("v")
  if (url.pathname === webhookPathname) {
    await forceUpdate(version)
  }
  // Attempt cached
  let resBody = await MASTERCOMFIG.get(getVersionedKey("mastercomfig-api-response", version))
  if (!resBody) {
    let v = await MASTERCOMFIG.get(getVersionedKey("mastercomfig-version", version))
    let m = await MASTERCOMFIG.get("mastercomfig-modules")
    let p = await MASTERCOMFIG.get("mastercomfig-preset-modules")
    let updated = await updateData([v ? null : (version === "2" ? rv2 : rv), m ? null : rm, p ? null : rp])
    if (updated[0]) {
      v = updated[0]
    }
    if (updated[1]) {
      m = updated[1]
    }
    if (updated[2]) {
      p = updated[2]
    }
    if (version === "2") {
      resBody = "{\"v\":" + v + "," +
                    "\"m\":" + m + "," +
                    "\"p\":" + p + "}"
    } else {
      resBody = "{\"v\":\"" + v + "\"," +
                    "\"m\":" + m + "," +
                    "\"p\":" + p + "}"
    }
    await storeData(getVersionedKey("mastercomfig-api-response", version), resBody)
  }
  return new Response(resBody, resHeaders)
}

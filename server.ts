import { oak, base64 } from './deps.ts'

// expiry in ms
const TOKEN_LIFESPAN = 200

const router = new oak.Router();
router.get("/", (ctx) => {
  ctx.response.body = `<!DOCTYPE html>
    <html>
      <head><title>Mutex experiment | server</title><head>
      <body>
        <h1>Mutex experiment</h1>
        <p>There are two actions this server performs</p>
        <ul>
          <li>authenticate: checks credentials and returns personal token that expires in some ms.</li>
          <li>verify: checks provided token if it's valid and not expired; returns the check result.</li>
        </ul>
      </body>
    </html>
  `;
});


const users: { [k: string]: string } = { user1: 'pass1' }

type Token = { token: string, validFor: number }
type TokenEntry = { username: string, token: string, until: Date }
// mapped by username
const tokens: { [k: string]: TokenEntry[] } = {}
// mapped by token
const issued: { [k: string]: TokenEntry } = {}

// curl -H "Content-Type: application/json" -X POST --data '{"name": "123ab900", "pass": "secret-pass"}' http://localhost:8080/authenticate
router.post("/authenticate", async (ctx) => {
  const body = await ctx.request.body().value
  const { name, pass } = body
  // console.log('- creds:', name, pass)
  if (!(name in users)) {
    ctx.response.status = 403
    ctx.response.body = { error: true, message: 'invalid credentials' }
    return
  }
  if (pass != users[name]) {
    ctx.response.status = 403
    ctx.response.body = { error: true, message: 'invalid credentials' }
    return
  }

  const token = giveToken(name)
  // console.log('- tokens:', tokens)

  return ctx.response.body = token
});

router.get("/verify", (ctx) => {
  const authHeader = ctx.request.headers.get('authorization')
  if (!authHeader) {
    ctx.response.status = 403
    ctx.response.body = { error: true, message: 'invalid authorization' }
    console.log('- no header')
    return
  }

  const [_, token] = authHeader.split(' ')
  if (!token) {
    ctx.response.status = 403
    ctx.response.body = { error: true, message: 'invalid authorization' }
    console.log('- invalid header', authHeader)
    return
  }

  const valid = validateToken(token)
  if (!valid) {
    ctx.response.status = 403
    ctx.response.body = { error: true, message: 'invalid authorization' }
    return
  }

  ctx.response.body = { error: false, message: 'ok' }
});

function validateToken(token: string): boolean {
  if (token in issued) {
    const entry = issued[token]
    if (entry.until >= new Date()) {
      return true
    }
  }
  return false
}

function giveToken(username: string): Token {

  if (username in tokens && tokens[username].length > 0) {
    const tokensCopy = [...tokens[username]]
    tokensCopy.sort((a, b) => {
      // sorte in reverse order so the most fresh token comes first
      return b.until.getTime() - a.until.getTime()
    })
    const entry = tokensCopy[0]

    const ms = entry.until.getTime() - (new Date()).getTime()
    if (ms <= 0) {
      console.log('- making new', ms)
      return createNewToken(username)
    }
    console.log('- reusing', ms)

    return {
      token: entry.token,
      validFor: ms,
    }
  }

  return createNewToken(username)
}

function createNewToken(username: string): Token {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  const token = base64.encode(arr)

  const expires = new Date()
  expires.setTime(expires.getTime() + TOKEN_LIFESPAN)

  const tokenEntry = { username, token, until: expires }
  if (username in tokens) {
    tokens[username].push(tokenEntry)
  } else {
    tokens[username] = [tokenEntry]
  }
  issued[token] = tokenEntry

  return {
    token,
    validFor: TOKEN_LIFESPAN,
  }

}


const app = new oak.Application(
  oak.hasFlash() ? { serverConstructor: oak.FlashServer } : undefined
);
app.use(router.routes());
app.use(router.allowedMethods());

app.addEventListener('listen', ({ hostname, port }) => {
  console.log(`- started server on http://${hostname}:${port}`)
})

await app.listen({ port: 8080 });
import { accepts } from "https://deno.land/std@0.152.0/http/negotiation.ts";

const sleep = (ms: number) => new Promise((accept, _reject) => {
  setTimeout(() => accept(0), ms)
})

// Number 15 is chosen empirically: current hardware, current setup
const MIN_TOKEN_LIFE = 8

class Client {
  private token = ''
  private expires = new Date()

  constructor(private name: string, private pass: string) {
    this.obtainToken()
    this.addWatcher()
  }

  async addWatcher() {
    const now = new Date()
    while (now.getTime() - this.expires.getTime() > 0) {
      console.log('- sleep')
      await sleep(2)
    }
    console.log('- sheduling a watcher')

    const diff = this.expires.getTime() - (new Date()).getTime()
    setTimeout(() => this.obtainToken(), diff)
  }

  async checkAccess() {
    await this.refreshTokenIfNeeded()

    const headers = new Headers()
    headers.append('Content-Type', 'application/json')
    headers.append('Authorization', `Bearer ${this.token}`)
    const opts = {
      method: 'get',
      headers,
      // body: JSON.stringify({ name: this.name, pass: this.pass })
    }
    await fetch('http://localhost:8080/verify', opts)
      .then(resp => resp.json())
      .then(data => {
        if (data.error) {
          console.log('- obtainToken', data)
        }
      })
      .catch(err => console.error(err))
  }

  async obtainToken() {
    let validFor = 0

    let result: any
    while (validFor < MIN_TOKEN_LIFE) {
      await sleep(validFor)
      result = await this.makeTokenRequest() as any
      // console.log('- resubmitting', validFor)
      validFor = result.validFor
    }

    const expires = new Date()
    expires.setTime(expires.getTime() + result.validFor)
    this.token = result.token
    this.expires = expires

    // danger! setTimeout callbacks will grow exponentially
    // setTimeout(() => this.obtainToken(), validFor)
    // console.log('- persisting token', result)
  }

  makeTokenRequest() {
    const headers = new Headers()
    headers.append('Content-Type', 'application/json')
    const opts = {
      method: 'post',
      headers,
      body: JSON.stringify({ name: this.name, pass: this.pass })
    }

    return new Promise((accept, _reject) => {
      fetch('http://localhost:8080/authenticate', opts)
        .then(resp => resp.json())
        .then(data => {
          console.log('- newToken', data.token, data.validFor)
          accept(data)
        })
        .catch(err => console.error(err))
    })
  }

  refreshTokenIfNeeded() {
    const now = new Date()
    const msRemaining = this.expires.getTime() - now.getTime()
    if (msRemaining > MIN_TOKEN_LIFE) {
      return Promise.resolve()
    }
    return this.obtainToken()
  }
}

const c = new Client('user1', 'pass1')
await sleep(200)

for (let i = 0; i < 2000; i++) {
  console.log('- ', i)
  await sleep(9)
  await c.checkAccess()
}
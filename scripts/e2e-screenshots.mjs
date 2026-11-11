// End-to-end check of the whole demo + README screenshots.
// Student phone, staff tablet and ready-board TV are SEPARATE browser contexts (like separate
// devices: no shared localStorage), talking to the real /api/orders handlers through the Vite dev
// server with an in-memory Redis. Proves orders sync across devices via the shared backend + polling.
// Usage: npm run e2e   (needs Google Chrome installed; uses playwright-core)
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { memoryApiPlugin } from './memory-api-plugin.mjs'

const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const server = await createServer({
  server: { port: 5199, strictPort: true },
  logLevel: 'error',
  plugins: [memoryApiPlugin()],
})
await server.listen()
const base = 'http://localhost:5199/'

const browser = await chromium.launch({ channel: 'chrome' })
// One context per device. Clock frozen at 12:24 today (the server stamps orders with the real date,
// metrics count "today") so pickup slots read 12:40, 12:45, ... (Maya's class ends 12:45).
const at1224 = new Date()
at1224.setHours(12, 24, 0, 0)
const device = async (width, height) => {
  const context = await browser.newContext({ viewport: { width, height } })
  await context.clock.setFixedTime(at1224)
  return context.newPage()
}

const check = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`)
  console.log(`ok - ${msg}`)
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

try {
  // --- Student phone ---
  const student = await device(390, 844)
  await student.goto(base + '#/')
  await student.getByRole('button', { name: 'Sign in with USF ID' }).waitFor()
  await shot(student, '1-sign-in')

  await student.getByRole('button', { name: 'Sign in with USF ID' }).click()
  // Build a bowl: starts empty, button says what's missing
  await student.getByRole('button', { name: 'Build your own burrito or bowl', exact: true }).click()
  const addBuild = student.locator('.bottom-bar button')
  check((await addBuild.textContent()) === 'Choose burrito or bowl' && (await addBuild.isDisabled()), 'builder starts empty')
  for (const name of ['Bowl', /^Carne asada/, 'Beans: Yes', 'Rice: Yes', /^Guacamole/, 'Lettuce', 'Cheese']) {
    await student.getByRole('button', { name, exact: typeof name === 'string' }).click()
  }
  check((await addBuild.textContent()) === 'Add to order · $10.60', 'bowl price = $6.25 base + $3.00 carne asada + $1.35 guac')
  await shot(student, '2b-builder')
  await addBuild.click()
  // Pizza from the real multi-day catalogue
  await student.getByRole('button', { name: 'Add Chicken bacon ranch pizza', exact: true }).click()
  const checkout = student.getByRole('button', { name: /^Checkout · 2 items/ })
  check(await checkout.isEnabled(), 'cart shows 2 items')
  await student.evaluate(() => window.scrollTo(0, 0))
  await shot(student, '2-menu')

  await checkout.click()
  await student.getByRole('button', { name: /^12:45/ }).click()
  await shot(student, '3-checkout')
  await student.getByRole('button', { name: /^Pay \$17\.10 with USF ID/ }).click()
  await student.getByText('#201').waitFor()
  check(true, 'order #201 placed through /api and confirmation shown')

  // --- Staff tablet (another device) ---
  const staff = await device(1280, 800)
  await staff.goto(base + '#/staff')
  const card = (n) => staff.locator('.card', { hasText: `#${n}` })
  await card(201).waitFor()
  check(true, 'staff device sees #201')
  check(
    (await card(201).textContent()).includes('Carne asada · Beans · Rice · Guacamole · Lettuce, Cheese'),
    'staff sees the chosen build',
  )
  for (let i = 0; i < 3; i++) {
    await staff.getByRole('button', { name: 'Add sample order' }).click()
    await card(202 + i).waitFor()
  }
  for (const n of [202, 203]) {
    await card(n).getByRole('button', { name: 'Start preparing' }).click()
    await card(n).getByRole('button', { name: 'Mark ready' }).click()
  }
  await card(201).getByRole('button', { name: 'Start preparing' }).click()
  await student.getByText('Preparing', { exact: false }).first().waitFor()
  check(true, 'student phone sees "Preparing" via polling')
  await shot(staff, '5-staff')
  await card(201).getByRole('button', { name: 'Mark ready' }).click()

  // --- Student sees READY ---
  await student.getByText(/READY/).first().waitFor()
  check(true, 'student confirmation flips to READY')
  await shot(student, '4-confirmation')

  // --- Ready board TV (a third device) ---
  const board = await device(1280, 720)
  await board.goto(base + '#/board')
  await board.locator('.board-number', { hasText: '201' }).waitFor()
  const ready = await board.locator('.board-number').allTextContents()
  check(['201', '202', '203'].every((n) => ready.includes(n)), `board shows READY: ${ready.join(', ')}`)
  check((await board.locator('.board-tile', { hasText: '201' }).textContent()).includes('Bowl: Carne asada'), 'board shows the build')
  await shot(board, '6-ready-board')

  // --- Pickup frees the cubby ---
  await card(201).getByRole('button', { name: 'Picked up' }).click()
  await board.locator('.board-number', { hasText: '201' }).waitFor({ state: 'detached' })
  check(true, 'picked-up order leaves the board')

  // --- Metrics + class-demo QR page ---
  await staff.goto(base + '#/staff/metrics')
  await staff.getByText('Orders today').waitFor()
  check((await staff.locator('body').textContent()).includes('Estimate'), 'metrics page shows the line-time estimate label')
  await shot(staff, '7-metrics')

  const demo = await device(1280, 720)
  await demo.goto(base + '#/demo')
  await demo.locator('img[alt^="QR code"]').waitFor()
  check(true, 'demo page shows the QR code')
  await shot(demo, '8-demo-qr')

  console.log(`\nAll checks passed. Screenshots in ${OUT}/`)
} finally {
  await browser.close()
  await server.close()
}

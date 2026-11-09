// End-to-end check of the whole demo + README screenshots.
// Drives student → staff → ready board in one browser (shared localStorage).
// Usage: npm run e2e   (needs Google Chrome installed; uses playwright-core)
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const base = 'http://localhost:5199/'

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext()
// Freeze the clock at 12:24 on demo day so the pickup slots read 12:40, 12:45, ... (Maya's class ends 12:45).
await context.clock.setFixedTime(new Date(2026, 10, 9, 12, 24))

const check = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`)
  console.log(`ok - ${msg}`)
}
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage })

try {
  // --- Student (phone) ---
  const student = await context.newPage()
  await student.setViewportSize({ width: 390, height: 844 })
  await student.goto(base + '#/')
  await student.evaluate(() => localStorage.clear())
  await student.reload()
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
  check(true, 'order #201 placed and confirmation shown')

  // --- Staff (counter tablet) ---
  const staff = await context.newPage()
  await staff.setViewportSize({ width: 1280, height: 800 })
  await staff.goto(base + '#/staff')
  await staff.locator('.card', { hasText: '#201' }).waitFor()
  check(true, 'staff sees #201 live')
  check(
    (await staff.locator('.card', { hasText: '#201' }).textContent()).includes('Carne asada · Beans · Rice · Guacamole · Lettuce, Cheese'),
    'staff sees the chosen build',
  )
  for (let i = 0; i < 3; i++) await staff.getByRole('button', { name: 'Add sample order' }).click()
  const card = (n) => staff.locator('.card', { hasText: `#${n}` })
  for (const n of [202, 203]) {
    await card(n).getByRole('button', { name: 'Start preparing' }).click()
    await card(n).getByRole('button', { name: 'Mark ready' }).click()
  }
  await card(201).getByRole('button', { name: 'Start preparing' }).click()
  await student.getByText('Preparing', { exact: false }).first().waitFor()
  await shot(staff, '5-staff')
  await card(201).getByRole('button', { name: 'Mark ready' }).click()

  // --- Student sees READY ---
  await student.getByText(/READY/).first().waitFor()
  check(true, 'student confirmation flips to READY')
  await shot(student, '4-confirmation')

  // --- Ready board (TV) ---
  const board = await context.newPage()
  await board.setViewportSize({ width: 1280, height: 720 })
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
  console.log(`\nAll checks passed. Screenshots in ${OUT}/`)
} finally {
  await browser.close()
  await server.close()
}

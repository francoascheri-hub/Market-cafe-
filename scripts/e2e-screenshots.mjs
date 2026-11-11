// End-to-end check of the whole demo + README screenshots.
// Student phone, staff tablet and ready-board TV are SEPARATE browser contexts (like separate
// devices: no shared localStorage), talking to the real /api/orders handlers through the Vite dev
// server with an in-memory Redis. Proves orders sync across devices via the shared backend + polling.
// Usage: npm run e2e   (needs Google Chrome installed; uses playwright-core)
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
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
const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled', fullPage })

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
  await staff.evaluate(() => window.scrollTo(0, 0))
  await shot(staff, '5-staff')
  await card(201).getByRole('button', { name: 'Mark ready' }).click()

  // --- Student sees READY ---
  await student.getByText(/^Ready — grab it/).first().waitFor()
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

  // --- Dashboard: seed a realistic demo day, switch ranges, export CSVs, clear samples ---
  await staff.getByRole('button', { name: 'Seed realistic demo day' }).click()
  const seeded = await staff.locator('.dash-message').filter({ hasText: /^Added \d+ sample orders/ }).textContent()
  check(true, `dashboard seeded: "${seeded}"`)
  await staff.getByText('Orders today').waitFor()
  await shot(staff, '9-dashboard-today', true)
  await staff.getByRole('button', { name: 'Last 7 days' }).click()
  check((await staff.getByRole('button', { name: 'Last 7 days' }).getAttribute('aria-pressed')) === 'true', 'range filter: Last 7 days')
  await shot(staff, '9b-dashboard-7-days', true)
  check(!(await staff.locator('main').textContent()).includes('$'), 'dashboard shows no $ figures (operational view)')
  const dash = await staff.locator('main').textContent()
  check(
    ['p90', 'Wait in cubby', 'No-show rate', 'Pickup punctuality', 'Payment mix', 'Prep time by station'].every((t) => dash.includes(t)),
    'dashboard shows p90 prep, dwell, no-show rate, punctuality, payment mix, prep by station',
  )
  const noShow = await staff.locator('.dash-kpi', { hasText: 'No-show rate' }).locator('.dash-kpi-value').textContent()
  check(Number.parseFloat(noShow) > 0, `seeded data includes some no-shows (${noShow})`)
  await board.reload()
  await board.locator('.board-footer, footer').first().waitFor()
  const boardNumbers = (await board.locator('.board-number').allTextContents()).map(Number)
  check(boardNumbers.every((n) => n < 1000), `seeded no-shows stay off the ready board (${boardNumbers.join(', ') || 'none ready'})`)
  // Hover the 7-day chart: tooltip with the per-station split
  const weekly = staff.locator('section', { hasText: 'Last 7 days' }).filter({ has: staff.locator('.recharts-wrapper') }).first()
  await weekly.scrollIntoViewIfNeeded()
  const box = await weekly.locator('.recharts-wrapper').boundingBox()
  await staff.mouse.move(box.x + box.width * 0.79, box.y + box.height * 0.6)
  await weekly.locator('.chart-tip').waitFor()
  check(true, 'chart tooltip on hover')
  await weekly.screenshot({ path: OUT + '/9e-dashboard-chart-tooltip.png' })
  await staff.mouse.move(0, 0)
  // Top items: switch to the per-station accordion and open the build-your-own station
  await staff.getByRole('button', { name: 'By station' }).click()
  await staff.locator('summary', { hasText: 'Picante' }).click()
  await staff.getByRole('columnheader', { name: 'Protein' }).waitFor()
  check(true, 'by-station view: Picante expands with protein / toppings / add-ons')
  await staff.locator('summary', { hasText: 'Picante' }).scrollIntoViewIfNeeded()
  await shot(staff, '9d-dashboard-by-station', true)
  mkdirSync('docs/exports', { recursive: true })
  for (const [button, file, header] of [
    ['Orders CSV', 'orders-sample.csv', /qty/i],
    ['Summary CSV', 'summary-sample.csv', /./],
  ]) {
    const [download] = await Promise.all([staff.waitForEvent('download'), staff.getByRole('button', { name: button }).click()])
    await download.saveAs(`docs/exports/${file}`)
    const lines = readFileSync(`docs/exports/${file}`, 'utf8').trim().split(/\r?\n/)
    check(header.test(lines[0]) && lines.length > 10, `${button} export: ${download.suggestedFilename()} (${lines.length} lines)`)
  }
  await staff.getByRole('button', { name: 'Orders CSV' }).scrollIntoViewIfNeeded()
  await shot(staff, '9c-dashboard-export')
  await staff.getByRole('button', { name: 'Clear sample orders' }).click()
  await staff.locator('.dash-message').filter({ hasText: 'Sample orders removed' }).waitFor()
  check(true, 'clear sample orders keeps real orders')
  await staff.getByRole('button', { name: 'Today' }).click()

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

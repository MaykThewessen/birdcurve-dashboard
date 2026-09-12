// Captures screenshots of every dashboard page plus a hero video tour.
// Run with: BIRDCURVE_DASHBOARD_URL=http://localhost:5173 node scripts/capture-screenshots.mjs
//
// Output: docs/screenshots/page-<name>.png + docs/screenshots/hero-tour.webm

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(process.env.BIRDCURVE_SCREENSHOT_DIR || resolve(REPO_ROOT, 'docs/screenshots'))
const BASE_URL = process.env.BIRDCURVE_DASHBOARD_URL || 'http://localhost:5173'

// Capture at twice the viewport resolution.
const VIEWPORT = { width: 1600, height: 900 }
const PAGES = [
  { slug: 'commodities', path: '/commodities' },
  { slug: 'electricity', path: '/electricity' },
  { slug: 'forecast', path: '/forecast' },
  { slug: 'ml', path: '/ml' },
  { slug: 'ancillary', path: '/ancillary' },
  { slug: 'scenarios', path: '/scenarios' },
]

const SCREENSHOT_TIMING = { timeout: 15000, animation: 1500 }
const TOUR_TIMING = { timeout: 8000, animation: 900 }

/** @param {import('playwright').Page} page
 * @param {string} path
 * @param {{timeout: number, animation: number}} timing
 * @returns {Promise<void>}
 */
async function visit(page, path, timing = SCREENSHOT_TIMING) {
  await page.goto(`${BASE_URL}${path}`)
  await page.waitForLoadState('networkidle', { timeout: timing.timeout }).catch((error) => {
    if (error.name !== 'TimeoutError') throw error
    console.warn(`Network remained active on ${path}; capturing after animation delay.`)
  })
  // Charts can continue animating after requests finish.
  await page.waitForTimeout(timing.animation)
}

/** @param {import('playwright').Browser} browser @returns {Promise<void>} */
export async function captureScreenshots(browser) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  })
  try {
    const page = await ctx.newPage()
    // Forecast mounts the selector that chooses the initial scenario.
    console.log('Priming scenario store via /forecast ...')
    await visit(page, '/forecast')
    for (const { slug, path } of PAGES) {
      process.stdout.write(`  ${slug} `)
      await visit(page, path)
      const out = resolve(OUT_DIR, `page-${slug}.png`)
      await page.screenshot({ path: out, fullPage: false })
      console.log(`saved ${out.replace(REPO_ROOT + '/', '')}`)
    }
  } finally {
    await ctx.close()
  }
}

/** @param {import('playwright').Browser} browser @returns {Promise<void>} */
export async function recordTour(browser) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  })
  let video
  try {
    const page = await ctx.newPage()
    video = page.video()
    console.log('Priming scenario store ...')
    await visit(page, '/forecast')
    console.log('Recording hero tour ...')
    for (const { slug, path } of PAGES) {
      await visit(page, path, TOUR_TIMING)
      process.stdout.write(`    visited ${slug}\n`)
    }
  } finally {
    await ctx.close()
  }

  if (video) {
    const target = resolve(OUT_DIR, 'hero-tour.webm')
    await video.saveAs(target)
    await video.delete()
    console.log(`Hero video saved to ${target.replace(REPO_ROOT + '/', '')}`)
  } else {
    throw new Error('No video was produced.')
  }
}

/** @param {import('playwright').BrowserType} browserType @returns {Promise<void>} */
export async function main(browserType = chromium) {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Launching Chromium against ${BASE_URL}`)
  const browser = await browserType.launch()
  try {
    await captureScreenshots(browser)
    await recordTour(browser)
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}

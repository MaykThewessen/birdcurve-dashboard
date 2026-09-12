import test from 'node:test'
import assert from 'node:assert/strict'
import { captureScreenshots, recordTour, main } from './capture-screenshots.mjs'

function fixture(fail = false) {
  const events = []
  const video = {
    saveAs: async () => events.push('save-video'),
    delete: async () => events.push('delete-video'),
  }
  const page = {
    goto: async () => { if (fail) throw new Error('navigation failed') },
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    screenshot: async () => events.push('screenshot'),
    video: () => video,
  }
  const context = { newPage: async () => page, close: async () => events.push('close-context') }
  const browser = { newContext: async () => context, close: async () => events.push('close-browser') }
  return { events, browser }
}

for (const capture of [captureScreenshots, recordTour]) {
  test(`${capture.name} closes context on navigation failure`, async () => {
    const { browser, events } = fixture(true)
    await assert.rejects(capture(browser), /navigation failed/)
    assert.deepEqual(events, ['close-context'])
  })
}

test('tour finalizes recording before saving', async () => {
  const { browser, events } = fixture()
  await recordTour(browser)
  assert.deepEqual(events, ['close-context', 'save-video', 'delete-video'])
})

test('captures each page', async () => {
  const { browser, events } = fixture()
  await captureScreenshots(browser)
  assert.equal(events.filter(event => event === 'screenshot').length, 6)
  assert.equal(events.at(-1), 'close-context')
})

test('main closes browser when capture fails', async () => {
  const { browser, events } = fixture(true)
  await assert.rejects(main({ launch: async () => browser }), /navigation failed/)
  assert.deepEqual(events, ['close-context', 'close-browser'])
})

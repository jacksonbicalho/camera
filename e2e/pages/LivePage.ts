import type { Page, Locator } from '@playwright/test'

export class LivePage {
  readonly video: Locator
  readonly error: Locator

  constructor(private readonly page: Page) {
    this.video = page.locator('#live-player-video')
    this.error = page.locator('#live-error')
  }

  async goto(cameraId: string) {
    await this.page.goto(`/live/${cameraId}`)
  }
}

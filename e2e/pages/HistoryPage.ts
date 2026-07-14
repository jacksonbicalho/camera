import type { Page, Locator } from '@playwright/test'

export class HistoryPage {
  constructor(private readonly page: Page) {}

  async goto(cameraId: string, recordingId: string) {
    await this.page.goto(`/history/${cameraId}/${recordingId}`)
  }

  recordingItem(recordingId: string): Locator {
    return this.page.locator(`#history-recording-${recordingId}`)
  }

  // VideoPlayer alterna entre dois <video> (double-buffering) — só o ativo
  // recebe src apontando pra /recordings/... (HistoryPage/RecordingsGateway).
  activeVideos(): Locator {
    return this.page.locator('#history-player video[src*="/recordings/"]')
  }
}

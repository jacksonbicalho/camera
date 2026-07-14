import type { Page } from '@playwright/test'

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/login')
  }

  async login(username: string, password: string) {
    await this.page.fill('#login-username', username)
    await this.page.fill('#login-password', password)
    await this.page.click('#login-submit')
  }
}

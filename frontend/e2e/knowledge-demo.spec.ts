import { test, expect } from '@playwright/test'

test.describe('Demo Flow Execution', () => {

  test('knowledge demo: input → knowledge → llm → output', async ({ page }) => {
    const browserLogs: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      const type = msg.type()
      if (type === 'error' || type === 'warning' || type === 'log') {
        browserLogs.push(`[${type}] ${text.substring(0, 300)}`)
      }
    })
    page.on('pageerror', err => browserLogs.push(`[PAGEERROR] ${err.message}`))

    await page.evaluate(() => {
      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        console.error('[UNHANDLED]', e.reason?.message || String(e.reason))
      })
    })

    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })

    await page.getByText('用例', { exact: true }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '知识库 input → knowledge → llm → output' }).click()
    await page.waitForTimeout(500)
    expect(await page.locator('.atom-node').count()).toBeGreaterThanOrEqual(4)

    await page.getByText('模拟运行', { exact: true }).click()

    const panel = page.locator('.interaction-panel')
    await expect(panel).toBeVisible({ timeout: 8000 })
    await panel.locator('textarea').first().fill('AI 代理是什么')
    await panel.getByText('提交').click()

    await expect(panel).not.toBeVisible({ timeout: 30000 })

    // 等待模拟完成
    await page.waitForTimeout(5000)

    // 检查结果面板
    const bodyText = await page.locator('body').innerText()
    console.log(`Body text contains "模拟运行结果": ${bodyText.includes('模拟运行结果')}`)
    console.log(`Body text snippet: ${bodyText.substring(0, 300)}`)

    const resultPanel = page.getByText('模拟运行结果')
    const panelVisible = await resultPanel.isVisible().catch(() => false)
    console.log(`result panel visible: ${panelVisible}`)
    const execLogs = browserLogs.filter(l => l.includes('[exec]'))
    console.log(`execLogs (${execLogs.length}):\n${execLogs.join('\n').substring(0, 5000)}`)
    expect(panelVisible).toBe(true)
  })
})
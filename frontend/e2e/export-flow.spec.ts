import { test, expect } from '@playwright/test'

test.describe('Export Flow', () => {

  test('一键导出呼出对话框，可取消', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()
    await page.getByText('一键导出').click()
    await expect(page.getByText('导出流程')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('取消')).toBeVisible()
    await page.getByText('取消').click()
    await expect(page.getByText('导出流程')).not.toBeVisible({ timeout: 3000 })
  })

  test('导出请求体包含 pyCode 和 extraFiles', async ({ page }) => {
    let requestBody: any = null
    await page.route('**/api/v1/export/compile-bundle', async route => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.from('mock-zip-content'),
      })
    })

    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    await page.getByText('一键导出').click()
    await expect(page.getByText('导出流程')).toBeVisible({ timeout: 3000 })
    await page.getByText('确认导出').click()

    await expect.poll(() => requestBody, '请求应已被拦截').toBeTruthy()
    expect(requestBody.pyCode).toContain('run_flow')
    expect(requestBody.requirements).toContain('cryptography')
    expect(Array.isArray(requestBody.extraFiles)).toBe(true)
  })

  test('导出对话框显示 A2A 复选框', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    await page.getByText('一键导出').click()
    await expect(page.getByText('导出流程')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('启用 A2A 智能体通讯')).toBeVisible()
    await expect(page.getByText('包含桌面 GUI（Tkinter 窗口）')).toBeVisible()
  })

})

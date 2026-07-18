import { test, expect } from '@playwright/test'

test.describe('Drag-to-connect', () => {

  test('handles are present and connectable', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()
    const inputNode = page.locator('.atom-node').first()
    await expect(inputNode).toBeVisible({ timeout: 5000 })

    const sourceHandle = inputNode.locator('.react-flow__handle-bottom')
    await expect(sourceHandle).toBeVisible({ timeout: 3000 })
    // input has no input ports, so no top handle
    await expect(inputNode.locator('.react-flow__handle-top')).toHaveCount(0)
  })

  test('same-type llm→llm is offered in + picker; input is not', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()
    await expect(page.locator('.atom-node')).toHaveCount(1, { timeout: 5000 })

    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('大模型调用', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    const llmNode = page.locator('.atom-node').nth(1)
    await llmNode.hover()
    await llmNode.locator('.port-row-add').click()
    const picker2 = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await expect(picker2).toBeVisible({ timeout: 3000 })
    await expect(picker2.getByText('大模型调用', { exact: true })).toBeVisible()
    await expect(picker2.getByText('输出', { exact: true })).toBeVisible()
    await expect(picker2.getByText('输入', { exact: true })).toHaveCount(0)
  })
})

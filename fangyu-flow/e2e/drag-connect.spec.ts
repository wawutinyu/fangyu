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

  test('second node can be added via port click on input', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()
    await expect(page.locator('.atom-node')).toHaveCount(1, { timeout: 5000 })

    // Add a node via input's port click
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })
  })
})

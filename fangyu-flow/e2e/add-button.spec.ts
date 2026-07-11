import { test, expect } from '@playwright/test'

test.describe('Add Node', () => {

  test('click port opens picker, selecting a node creates new node + edge', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })

    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    const inputNode = page.locator('.atom-node').first()
    await expect(inputNode).toBeVisible({ timeout: 5000 })

    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()

    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 3000 })
  })

  test('clicking edge opens picker and inserts node between two nodes', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })

    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // Add another node from input's output to create an edge
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()

    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 3000 })

    // Click on the edge to insert a node
    const edgeGroup = page.locator('.react-flow__edge').first()
    await edgeGroup.click({ force: true })

    const edgePicker = page.locator('div[style*="z-index: 9999"]')
    await expect(edgePicker).toBeVisible({ timeout: 3000 })

    await edgePicker.getByText('大模型调用', { exact: true }).click()

    await expect(page.locator('.atom-node')).toHaveCount(3, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(2, { timeout: 3000 })
  })

  test('add multiple nodes from same parent node', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })

    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // Add first child from input node's output (via picker)
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    let picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()

    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 3000 })

    // Add second child from the same input node
    await inputNode.hover()
    await page.waitForTimeout(300)
    await inputNode.locator('.port-row-add').click()
    picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('大模型调用', { exact: true }).click()

    await expect(page.locator('.atom-node')).toHaveCount(3, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(2, { timeout: 3000 })
  })

})

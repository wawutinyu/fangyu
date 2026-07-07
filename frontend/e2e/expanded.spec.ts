import { test, expect } from '@playwright/test'

test.describe('Expanded coverage', () => {

  test('onEdgeClick inserts node between two nodes', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // add approval from input to create an edge
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    // edge exists in DOM
    const edge = page.locator('.react-flow__edge').first()
    await expect(edge).toHaveCount(1, { timeout: 3000 })
    await edge.click({ force: true })

    // insert picker should appear
    const insertPicker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await expect(insertPicker).toBeVisible({ timeout: 3000 })

    // search for a node and insert
    const searchInput = insertPicker.locator('input')
    await searchInput.fill('数据转换')
    await insertPicker.getByText('数据转换', { exact: true }).click()

    // now 3 nodes, 2 edges
    await expect(page.locator('.atom-node')).toHaveCount(3, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(2, { timeout: 3000 })
  })

  test('simulation pauses at approval node and can approve', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker2 = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker2.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    // start simulation - will hit input node first (pauses) then approval node
    await page.getByText('模拟运行').click()

    // interaction panel appears
    const panel = page.locator('.interaction-panel')
    await expect(panel).toBeVisible({ timeout: 8000 })

    // first interaction is input ("用户输入")
    await expect(panel.getByText('用户输入').first()).toBeVisible({ timeout: 2000 })
    await panel.locator('textarea').first().fill('test data')
    await panel.getByText('提交').click()

    // now approval panel should appear ("人工审批" in header)
    await expect(page.locator('.interaction-panel').getByText('人工审批').first()).toBeVisible({ timeout: 8000 })
    await page.locator('.interaction-panel').getByText('同意').click()
    await expect(page.locator('.interaction-panel')).not.toBeVisible({ timeout: 5000 })
  })

  test('simulation rejects approval with reason', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker2 = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker2.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    await page.getByText('模拟运行').click()

    const panel = page.locator('.interaction-panel')
    await expect(panel).toBeVisible({ timeout: 8000 })

    // dismiss input panel
    await expect(panel.getByText('用户输入')).toBeVisible({ timeout: 2000 })
    await panel.locator('textarea').first().fill('x')
    await panel.getByText('提交').click()

    // approval panel ("人工审批" in header)
    await expect(page.locator('.interaction-panel').getByText('人工审批').first()).toBeVisible({ timeout: 8000 })

    // fill reject reason and click reject
    await page.locator('.interaction-panel').locator('textarea').first().fill('数据格式不对')
    await page.locator('button:has-text("拒绝")').click({ force: true })
    await expect(page.locator('.interaction-panel')).not.toBeVisible({ timeout: 5000 })
  })

  test('simulation pauses at input node and accepts value', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    await page.getByText('模拟运行').click()

    const panel = page.locator('.interaction-panel')
    await expect(panel).toBeVisible({ timeout: 8000 })

    await expect(panel.getByText('用户输入')).toBeVisible({ timeout: 2000 })
    await panel.locator('textarea').first().fill('hello world')
    await panel.getByText('提交').click()
    await expect(page.locator('.interaction-panel')).not.toBeVisible({ timeout: 5000 })
  })

  test('node config panel opens on double click and saves label', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()
    const startNode = page.locator('.atom-node').first()
    await expect(startNode).toBeVisible({ timeout: 5000 })

    // double click start node to open config
    await startNode.dblclick()
    await page.waitForTimeout(500)
    const configPanel = page.locator('text=节点配置')
    await expect(configPanel).toBeVisible({ timeout: 5000 })

    // find the "节点名称" label's sibling input and modify it
    const labelInput = page.locator('label:has-text("节点名称") + input')
    await labelInput.fill('我的入口')

    // click save config button
    await page.getByText('保存配置').click()

    // close config panel via close button
    await page.locator('.section-title + button').click()
    await expect(configPanel).not.toBeVisible({ timeout: 3000 })

    // verify label changed on node
    await expect(page.locator('.atom-node').first().locator('text=我的入口')).toBeVisible({ timeout: 3000 })
  })

  test('delete selected node removes node and connected edges', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // select input node and press Delete
    await page.locator('.atom-node').first().click()
    await page.keyboard.press('Delete')
    await expect(page.locator('.atom-node')).toHaveCount(0, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(0, { timeout: 3000 })
  })

  test('export code modal has copy and download buttons', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()
    // 代码已合并到导出弹窗，通过拦截请求验证
    let requestBody: any = null
    await page.route('**/api/v1/export/compile-bundle', async route => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.from('mock-zip-content'),
      })
    })
    await page.getByText('导出').click()
    await expect(page.getByText('导出流程')).toBeVisible({ timeout: 3000 })
    await page.getByText('确认导出').click()

    await expect.poll(() => requestBody, '请求应已被拦截').toBeTruthy()
    expect(requestBody.pyCode).toContain('def run_flow')
    expect(requestBody.pyCode).toContain('import tkinter')
  })

  test('node picker search filters correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // open picker from input node
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await expect(picker).toBeVisible({ timeout: 3000 })

    // search for "条件" - should show "条件分支"
    const searchInput = picker.locator('input')
    await searchInput.fill('条件')
    await expect(picker.getByText('条件分支')).toBeVisible({ timeout: 2000 })
    // "数据转换" should be filtered out
    await expect(picker.getByText('数据转换')).not.toBeVisible({ timeout: 2000 })
  })

  test('double click edge opens edge config panel', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // add approval from input to create an edge
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    // edge exists in DOM
    const edge = page.locator('.react-flow__edge').first()
    await expect(edge).toHaveCount(1, { timeout: 3000 })
    await edge.dblclick({ force: true })

    // edge config panel should appear
    await expect(page.getByText('连线配置')).toBeVisible({ timeout: 3000 })
  })

})

import { test, expect } from '@playwright/test'

test.describe('New Features', () => {

  test('approval node can be added via port click', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const searchInput2 = page.locator('input[placeholder*="搜索节点"]')
    await searchInput2.waitFor({ timeout: 3000 })
    const picker2 = page.locator('div[style*="z-index: 9999"]').filter({ has: searchInput2 })
    await picker2.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 3000 })
  })

  test('global prompts can be edited in canvas config panel', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    await page.getByText('提示词').first().click()
    await expect(page.getByText('全局提示词')).toBeVisible({ timeout: 3000 })

    const textarea = page.locator('textarea').first()
    await textarea.fill('You are a helpful assistant')

    await page.locator('button[style*="background: none"]').first().click()
    await page.getByText('提示词').first().click()
    await expect(page.locator('textarea').first()).toHaveValue('You are a helpful assistant')
  })

  test('export code button shows Python code modal', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    await page.getByText('代码').first().click()
    await expect(page.getByText('导出 Python 代码')).toBeVisible({ timeout: 3000 })

    const codeArea = page.locator('textarea[readonly]')
    await expect(codeArea).toBeVisible({ timeout: 3000 })
    const codeText = await codeArea.inputValue()
    expect(codeText).toContain('async def run_flow')
    expect(codeText).toContain('import asyncio')
  })

  test('exported code includes approval node handler', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    const inputNode2 = page.locator('.atom-node').first()
    await inputNode2.hover()
    await page.waitForTimeout(200)
    await inputNode2.locator('.port-row-add').click()
    const searchInput2 = page.locator('input[placeholder*="搜索节点"]')
    await searchInput2.waitFor({ timeout: 3000 })
    const picker2 = page.locator('div[style*="z-index: 9999"]').filter({ has: searchInput2 })
    await picker2.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    await page.getByText('代码').first().click()
    const codeArea = page.locator('textarea[readonly]')
    await expect(codeArea).toBeVisible({ timeout: 3000 })
    const codeText = await codeArea.inputValue()
    expect(codeText).toContain('handle_approval')
    expect(codeText).toContain('approved')
    expect(codeText).toContain('rejected')
  })

  test('export code includes global prompts when set', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    await page.getByText('提示词').first().click()
    await page.locator('textarea').first().fill('You are a coding expert')
    await page.locator('button[style*="background: none"]').first().click()

    await page.getByText('代码').first().click()
    const codeArea = page.locator('textarea[readonly]')
    await expect(codeArea).toBeVisible({ timeout: 3000 })
    const codeText = await codeArea.inputValue()
    expect(codeText).toContain('GLOBAL_SYSTEM_PROMPT')
    expect(codeText).toContain('You are a coding expert')
  })

  test('connect to existing node via input port menu', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // add approval from input → creates edge + 2 nodes
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    let picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('人工审批', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    // click approval's input port → context menu → "连接已有节点"
    const approvalNode = page.locator('.atom-node').nth(1)
    await approvalNode.locator('.port-row-add-input').click()
    await page.locator('div[style*="z-index: 10000"]').getByText('↕ 连接已有节点').click()

    // connect picker should appear listing compatible nodes
    await expect(page.locator('text=选择已有节点连接')).toBeVisible({ timeout: 3000 })
  })

  test('variable selector button appears and inserts reference into textarea', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    page.on('dialog', dialog => dialog.accept())
    await page.getByText('新建').click()

    // add LLM node from input
    const inputNode = page.locator('.atom-node').first()
    await inputNode.hover()
    await page.waitForTimeout(200)
    await inputNode.locator('.port-row-add').click()
    const picker = page.locator('div[style*="z-index: 9999"]').filter({ has: page.locator('input[placeholder*="搜索节点"]') })
    await picker.getByText('大模型调用', { exact: true }).click()
    await expect(page.locator('.atom-node')).toHaveCount(2, { timeout: 3000 })

    // double-click LLM node to open config
    const llmNode = page.locator('.atom-node').nth(1)
    await llmNode.dblclick()
    await expect(page.getByText('节点配置')).toBeVisible({ timeout: 3000 })

    // find the variable selector button
    const varBtn = page.locator('.var-selector-btn').first()
    await expect(varBtn).toBeVisible({ timeout: 3000 })

    // click to open dropdown
    await varBtn.click()
    await expect(page.getByText('上游变量')).toBeVisible({ timeout: 3000 })

    // click the first variable to insert (e.g. "输入 .input")
    const varItem = page.locator('button').filter({ hasText: 'input' }).first()
    await varItem.click()

    // the dropdown should close — verify the var button is still there
    await expect(page.getByText('上游变量')).not.toBeVisible({ timeout: 3000 })

    // verify the variable reference was inserted into a textarea
    const hasRef = await page.locator('textarea').evaluateAll(
      els => els.some(el => (el as HTMLTextAreaElement).value.includes('{{'))
    )
    expect(hasRef).toBe(true)
  })

})

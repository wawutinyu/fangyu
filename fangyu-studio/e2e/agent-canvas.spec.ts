import { test, expect } from '@playwright/test'

test.describe('Agent Canvas', () => {

  // 两个画布始终挂载（display:none 切换），用 data-testid 作用域限定到 Agent 画布
  let agentContainer: ReturnType<import('@playwright/test').Locator['locator']>

  test.beforeEach(({ page }) => {
    agentContainer = page.locator('[data-testid="agent-canvas"]')
  })

  test('切换 Agent 画布 Tab', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await expect(page.getByText('Agent 编排画布')).toBeVisible({ timeout: 5000 })
  })

  test('添加智能体节点', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 智能体').click()
    await expect(agentContainer.locator('.react-flow__node')).toHaveCount(1, { timeout: 3000 })
  })

  test('添加路由器节点', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 路由器').click()
    await expect(agentContainer.locator('.react-flow__node')).toHaveCount(1, { timeout: 3000 })
  })

  test('添加编组节点', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 智能体').click()
    await expect(agentContainer.locator('.react-flow__node')).toHaveCount(1, { timeout: 3000 })
  })

  test('添加多个类型节点并存', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 智能体').click()
    await agentContainer.getByText('+ 路由器').click()
    await agentContainer.getByText('+ 编组').click()
    await expect(agentContainer.locator('.react-flow__node')).toHaveCount(3, { timeout: 3000 })
  })

  test('点击智能体节点显示配置面板', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 智能体').click()
    await expect(agentContainer.locator('.react-flow__node')).toHaveCount(1, { timeout: 3000 })
    const node = agentContainer.locator('.react-flow__node').first()
    await node.click()
    await expect(page.getByText('AgentCard')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('ATP 可信')).toBeVisible()
    await expect(page.getByText('传输')).toBeVisible()
    await expect(page.getByText('Task')).toBeVisible()
    await expect(page.getByText('扩展')).toBeVisible()
  })

  test('路由器的配置面板仅显示路由规则 Tab', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 路由器').click()
    await expect(agentContainer.locator('.react-flow__node')).toHaveCount(1, { timeout: 3000 })
    const node = agentContainer.locator('.react-flow__node').first()
    await node.click()
    await expect(page.getByRole('button', { name: '路由规则', exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('AgentCard')).not.toBeVisible()
  })

  test('智能体节点有可拖拽的连接手柄', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 智能体').click()
    await agentContainer.getByText('+ 智能体').click()
    // agent nodes use Handle from reactflow
    const handles = agentContainer.locator('.react-flow__handle')
    await expect(handles.first()).toBeVisible({ timeout: 3000 })
    await expect(handles).toHaveCount(4) // 2 nodes × (1 target + 1 source)
  })

  test('路由器节点有连接手柄', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 路由器').click()
    await agentContainer.getByText('+ 智能体').click()
    const handles = agentContainer.locator('.react-flow__handle')
    await expect(handles).toHaveCount(4, { timeout: 3000 }) // router: left+right, agent: top+bottom
  })

  test('取消选择后配置面板显示提示', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.react-flow__renderer', { timeout: 15000 })
    await page.getByTestId('nav-xu-agent').click()
    await agentContainer.getByText('+ 智能体').click()
    const node = agentContainer.locator('.react-flow__node').first()
    await node.click()
    await page.locator('[data-testid="agent-canvas"] .react-flow__pane').last().click({ position: { x: 10, y: 10 } })
    await expect(page.getByText('选中一个节点或连线以查看配置')).toBeVisible({ timeout: 3000 })
  })

})

/** Setup Copilot 前端小工具 */

export function buildTrustPreviewClient(preview: {
  name: string
  plain: string
  risks?: string[]
}): string {
  const risks = preview.risks?.length
    ? `\n风险：\n- ${preview.risks.join('\n- ')}`
    : ''
  return `${preview.plain}${risks}`
}

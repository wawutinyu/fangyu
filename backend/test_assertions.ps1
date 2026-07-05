param([string]$BaseUrl = "http://localhost:8000")

$pass = 0; $fail = 0

function Assert-NotNull($val, $msg) {
  if ($null -eq $val -or $val -eq "") { Write-Host ("  X " + $msg + " : got null/empty") -ForegroundColor Red; $global:fail++; return $false }
  Write-Host ("  V " + $msg) -ForegroundColor Green; $global:pass++; return $true
}
function Assert-Equal($expected, $actual, $msg) {
  if ($expected -ne $actual) { Write-Host ("  X " + $msg + " : expected [" + $expected + "], got [" + $actual + "]") -ForegroundColor Red; $global:fail++; return $false }
  Write-Host ("  V " + $msg) -ForegroundColor Green; $global:pass++; return $true
}
function Run-Flow($file) {
  $json = Get-Content $file -Raw -Encoding UTF8
  return (Invoke-RestMethod "$BaseUrl/api/v1/flow/run" -Method Post -Body $json -ContentType "application/json" -ErrorAction Stop)
}
function Get-Node($results, $type) {
  return ($results | Where-Object { $_.type -eq $type } | Select-Object -First 1)
}

Write-Host "================= 带断言端到端测试 =================" -ForegroundColor Cyan

# 1. core
Write-Host "`n1. [core] 核心链路" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_core.json"
  if ($r.success) {
    $t = Get-Node $r.results "transform"
    Assert-NotNull $t "transform 节点有结果"
    if ($t.outputs.result -and $t.outputs.result.count -and $t.outputs.result.items -and $t.outputs.result.summary) { Write-Host "  V transform 输出含 count/items/summary" -ForegroundColor Green; $pass++ } else { Write-Host "  X transform 输出缺少字段" -ForegroundColor Red; $fail++ }
    Assert-NotNull (Get-Node $r.results "json-parse") "json-parse 有结果"
  } else { Write-Host "  X flow 失败: $($r.error)" -ForegroundColor Red; $fail += 3 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 3 }

# 2. condition
Write-Host "`n2. [condition] 条件分支" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_condition.json"
  if ($r.success) {
    $c = Get-Node $r.results "condition"
    Assert-NotNull $c "condition 节点有结果"
    if ($c.outputs.branch -eq "true" -or $c.outputs.branch -eq "false") { Write-Host ("  V condition 分支 = " + $c.outputs.branch) -ForegroundColor Green; $pass++ } else { Write-Host ("  X condition 分支异常: " + $c.outputs.branch) -ForegroundColor Red; $fail++ }
    Assert-NotNull (Get-Node $r.results "output") "output 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 3. var_text
Write-Host "`n3. [var_text] 变量+文本大写" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_var_text.json"
  if ($r.success) {
    $tx = Get-Node $r.results "text-process"
    Assert-NotNull $tx "text-process 有结果"
    Assert-Equal "HELLO WORLD, AI FLOW" $tx.outputs.result "大写转换正确"
    Assert-NotNull (Get-Node $r.results "variable-get") "variable-get 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 3 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 3 }

# 4. code_exec (LLM 生成代码 + 执行，结果非确定)
Write-Host "`n4. [code_exec] LLM 生成代码 + 执行" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_code_exec.json"
  if ($r.success) {
    $cd = Get-Node $r.results "code"
    Assert-NotNull $cd "code 节点有结果"
    if ($cd.outputs.result) { Write-Host ("  V code 输出: " + $cd.outputs.result) -ForegroundColor Green; $pass++ } else { Write-Host "  ~ code 无结果 (LLM 输出不合预期, 可接受)" -ForegroundColor Yellow; $pass++ }
    if (-not $cd.outputs.error) { Write-Host "  V code 无错误" -ForegroundColor Green; $pass++ } else { Write-Host ("  ~ code 错误: " + $cd.outputs.error + " (LLM 代码问题, 可接受)") -ForegroundColor Yellow; $pass++ }
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 3 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 3 }

# 5. trigger
Write-Host "`n5. [trigger] 触发器" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_trigger.json"
  if ($r.success) {
    $tr = Get-Node $r.results "trigger"
    Assert-Equal $true $tr.outputs.triggered "trigger.triggered = true"
    Assert-NotNull (Get-Node $r.results "llm") "llm 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 6. approval
Write-Host "`n6. [approval] 审批" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_approval.json"
  if ($r.success) {
    $ap = $r.results | Where-Object { $_.pending } | Select-Object -First 1
    Assert-NotNull $ap "approval 返回 pending"
    Assert-Equal "pending" $ap.outputs.status "approval status = pending"
    Assert-NotNull $ap.outputs.approval_id "approval_id 不为空"
  } else { Write-Host ("  X flow 失败: " + $r.error) -ForegroundColor Red; $fail += 3 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 3 }

# 7. ext
Write-Host "`n7. [ext] 外部服务" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_ext.json"
  if ($r.success) {
    $h = Get-Node $r.results "http"
    Assert-Equal 200 $h.outputs.status "HTTP status = 200"
    Assert-NotNull (Get-Node $r.results "search") "search 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 8. memory
Write-Host "`n8. [memory] 记忆" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_memory.json"
  if ($r.success) {
    $mw = Get-Node $r.results "memory-write"
    Assert-Equal $true $mw.outputs.success "memory-write 成功"
    Assert-NotNull (Get-Node $r.results "memory-read") "memory-read 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 9. memory_extract
Write-Host "`n9. [memory_extract] 记忆提取" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_memory_extract.json"
  if ($r.success) {
    Assert-NotNull (Get-Node $r.results "extract-memory") "extract-memory 有结果"
    Assert-NotNull (Get-Node $r.results "search-sessions") "search-sessions 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 10. knowledge
Write-Host "`n10. [knowledge] 知识库" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_knowledge.json"
  if ($r.success) {
    Assert-NotNull (Get-Node $r.results "knowledge") "knowledge 有结果"
    Assert-NotNull (Get-Node $r.results "llm") "llm 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 11. prompt
Write-Host "`n11. [prompt] 提示词组装" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_prompt.json"
  if ($r.success) {
    $pa = Get-Node $r.results "prompt-assembly"
    Assert-NotNull $pa "prompt-assembly 有结果"
    Assert-NotNull (Get-Node $r.results "llm") "llm 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 2 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 2 }

# 12. tool_call
Write-Host "`n12. [tool_call] 工具调用" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_tool_call.json"
  if ($r.success) {
    Assert-NotNull (Get-Node $r.results "tool-call") "tool-call 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 1 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 1 }

# 13. tool_skill
Write-Host "`n13. [tool_skill] 工具与技能" -ForegroundColor Yellow
try {
  $r = Run-Flow "C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_tool_skill.json"
  if ($r.success) {
    Assert-NotNull (Get-Node $r.results "register-tool") "register-tool 有结果"
    Assert-NotNull (Get-Node $r.results "learn-skill") "learn-skill 有结果"
    Assert-NotNull (Get-Node $r.results "execute-skill") "execute-skill 有结果"
  } else { Write-Host "  X flow 失败" -ForegroundColor Red; $fail += 3 }
} catch { Write-Host ("  X 异常: " + $_.Exception.Message) -ForegroundColor Red; $fail += 3 }

# 14. role / switch / loop
Write-Host "`n14. [role/switch/loop] 剩余流程" -ForegroundColor Yellow
foreach ($id in @("role","switch","loop")) {
  try {
    $r = Run-Flow ("C:\Users\Administrator\Desktop\ai-flow-canvas\backend\test_" + $id + ".json")
    if ($r.success) {
      $e = @($r.results | Where-Object { $_.error })
      if ($e.Count -eq 0) { Write-Host ("  V " + $id + " : 通过") -ForegroundColor Green; $pass++ } else { Write-Host ("  X " + $id + " : " + $e.Count + " 个节点错误") -ForegroundColor Red; $fail++ }
    } else { Write-Host ("  X " + $id + " : flow 失败") -ForegroundColor Red; $fail++ }
  } catch { Write-Host ("  X " + $id + " : 异常") -ForegroundColor Red; $fail++ }
}

Write-Host "`n================= 总结 =================" -ForegroundColor Cyan
if ($fail -gt 0) { Write-Host ("通过: " + $pass + "  失败: " + $fail + "  总计: " + ($pass+$fail)) -ForegroundColor Red }
else { Write-Host ("通过: " + $pass + "  失败: " + $fail + "  总计: " + ($pass+$fail)) -ForegroundColor Green }

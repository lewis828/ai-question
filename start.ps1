# QuizAI 启动脚本（与 README 一致）
$SkillScript = Join-Path $PSScriptRoot ".cursor\skills\ai-question\scripts\start_question_service.ps1"
if (-not (Test-Path $SkillScript)) {
    Write-Error "未找到 skill 启动脚本: $SkillScript"
}
& $SkillScript

# Resolve the candidate produced for THIS exact pull-request head, never a manually pinned older EXE.
# This runs only in a disposable GitHub-hosted Windows CI worker. No token reaches the candidate process.
param(
  [Parameter(Mandatory=$true)][ValidateSet('lifecycle','public-video')][string]$Purpose
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$targetSha=([string]$env:YUTANG_TARGET_SHA).ToLowerInvariant()
$targetBranch=[string]$env:YUTANG_TARGET_BRANCH
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Candidate resolver must run in GitHub Actions only.' }
if ($targetSha -cnotmatch '^[a-f0-9]{40}$' -or [string]::IsNullOrWhiteSpace($targetBranch)) { throw 'Exact PR head SHA or branch is unavailable.' }
if ([string]::IsNullOrWhiteSpace($env:GH_TOKEN) -or [string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) { throw 'Read-only Actions token/output is unavailable.' }
$headers=@{
  Authorization="Bearer $env:GH_TOKEN"
  Accept='application/vnd.github+json'
  'X-GitHub-Api-Version'='2022-11-28'
}
$repo='yud78785/yutang-build'
$runUri='https://api.github.com/repos/'+$repo+'/actions/workflows/yutang.yml/runs?event=pull_request&branch='+[uri]::EscapeDataString($targetBranch)+'&per_page=100'
$deadline=(Get-Date).AddMinutes(25)
$buildRun=$null
while ((Get-Date) -lt $deadline) {
  $response=Invoke-RestMethod -Method Get -Uri $runUri -Headers $headers
  $matching=@($response.workflow_runs | Where-Object {
    $_.head_sha -ceq $targetSha -and $_.head_branch -ceq $targetBranch -and $_.event -eq 'pull_request'
  } | Sort-Object created_at -Descending)
  if ($matching.Count -gt 0 -and $matching[0].status -eq 'completed') {
    $buildRun=$matching[0]
    break
  }
  Start-Sleep -Seconds 15
}
if (-not $buildRun) { throw 'No completed candidate build appeared for this exact PR head within 25 minutes.' }
if ($buildRun.conclusion -ne 'success') { throw ('Candidate build for this exact PR head failed: '+$buildRun.conclusion) }
if ($buildRun.head_sha -cne $targetSha -or $buildRun.head_branch -cne $targetBranch) { throw 'Build identity mismatch.' }
$artifactUri='https://api.github.com/repos/'+$repo+'/actions/runs/'+$buildRun.id+'/artifacts?per_page=100'
$artifacts=Invoke-RestMethod -Method Get -Uri $artifactUri -Headers $headers
$matches=@($artifacts.artifacts | Where-Object {
  $_.name -eq 'YuTang-Windows-CANDIDATE-NOT-RELEASE' -and $_.expired -eq $false
})
if ($matches.Count -ne 1) { throw 'Expected exactly one unexpired not-for-release candidate artifact from the selected build.' }
$artifact=$matches[0]
if ($artifact.workflow_run.head_sha -cne $targetSha -or [string]$artifact.workflow_run.id -ne [string]$buildRun.id) { throw 'Artifact belongs to a different commit or build run.' }
if ([string]$artifact.digest -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Candidate artifact lacks an exact trusted GitHub SHA256 digest.' }

$destination=Join-Path $env:RUNNER_TEMP ('YuTang-Candidate-'+$Purpose)
$archive=Join-Path $env:RUNNER_TEMP ('YuTang-Candidate-'+$Purpose+'.zip')
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $archive)) { throw 'Refusing to overwrite an existing candidate or archive.' }
Invoke-WebRequest -Uri ('https://api.github.com/repos/'+$repo+'/actions/artifacts/'+$artifact.id+'/zip') -Headers $headers -MaximumRedirection 5 -OutFile $archive
$archiveSha=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($archiveSha -cne ([string]$artifact.digest).Substring(7)) { throw 'Candidate artifact ZIP SHA256 mismatch; refusing extraction.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[System.IO.Compression.ZipFile]::OpenRead($archive)
try {
  $entries=@($zip.Entries)
  $expected=@('Dafeiyu-Douyin-API-1.4.6-win-x64.exe','YUTANG-RESULT.txt')
  if ($entries.Count -ne 2 -or @($entries | Where-Object { $expected -cnotcontains $_.FullName }).Count -ne 0 -or @($entries.FullName | Select-Object -Unique).Count -ne 2) {
    throw 'Candidate ZIP contains unexpected, duplicate or nested paths.'
  }
  $exeEntry=@($entries | Where-Object { $_.FullName -ceq $expected[0] })[0]
  $manifestEntry=@($entries | Where-Object { $_.FullName -ceq $expected[1] })[0]
  if (-not $exeEntry -or $exeEntry.Length -lt 50000000 -or $exeEntry.Length -gt 200000000 -or -not $manifestEntry -or $manifestEntry.Length -gt 8192) {
    throw 'Candidate ZIP EXE or manifest size is invalid.'
  }
} finally { $zip.Dispose() }
[System.IO.Compression.ZipFile]::ExtractToDirectory($archive,$destination)
$exe=Join-Path $destination 'Dafeiyu-Douyin-API-1.4.6-win-x64.exe'
$manifestPath=Join-Path $destination 'YUTANG-RESULT.txt'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Candidate EXE or manifest missing.' }
$manifest=Get-Content -LiteralPath $manifestPath -Raw
$manifestHead=[regex]::Match($manifest,'(?m)^BUILD CONTROL SHA:[ \t]*([a-f0-9]{40})[ \t]*\r?$')
$manifestExe=[regex]::Match($manifest,'(?m)^SHA256:[ \t]*([a-f0-9]{64})[ \t]*\r?$')
if (-not $manifestHead.Success -or -not $manifestExe.Success) { throw 'Candidate manifest is missing the exact build SHA or EXE SHA256.' }
if ($manifestHead.Groups[1].Value -cne $targetSha) { throw 'Candidate manifest was generated for a different PR head.' }
$exeSha=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($exeSha -cne $manifestExe.Groups[1].Value) { throw 'Candidate EXE bytes differ from their build manifest.' }
"exe=$exe" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8 -Append
"exe_sha=$exeSha" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8 -Append
"artifact_id=$($artifact.id)" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8 -Append
"build_run_id=$($buildRun.id)" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8 -Append
Write-Host "CANDIDATE_BUILD_IDENTITY_PASS: headSha=$targetSha buildRunId=$($buildRun.id) artifactId=$($artifact.id) exeSha=$exeSha"

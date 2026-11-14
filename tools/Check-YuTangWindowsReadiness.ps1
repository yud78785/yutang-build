#requires -Version 5.1
# YuTang 1.4.7 Windows read-only readiness inspector.
# Never executes an EXE, edits the registry, opens a browser, contacts the network or changes a process.
[CmdletBinding()]
param([string]$CandidateExe)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expectedFileName = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe'
$expectedSha256 = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34'
$expectedBytes = 125446071
$issues = New-Object System.Collections.Generic.List[string]
$windows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
if (-not $windows) { [void]$issues.Add('WINDOWS_REQUIRED') }
$edgePresent = $false
$edgeVersion = $null
$roots = @($env:ProgramFiles, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
foreach ($root in $roots) {
  $edge = Join-Path $root 'Microsoft\Edge\Application\msedge.exe'
  if (Test-Path -LiteralPath $edge -PathType Leaf) {
    $edgePresent = $true
    try { $edgeVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($edge).ProductVersion }
    catch { $edgeVersion = $null }
    break
  }
}
if (-not $edgePresent) { [void]$issues.Add('MICROSOFT_EDGE_NOT_FOUND') }
$cdpPortStatus = 'unknown'
try {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  if (@($listeners | Where-Object { $_.Port -eq 9227 }).Count -gt 0) {
    $cdpPortStatus = 'occupied'
    [void]$issues.Add('DEDICATED_CDP_PORT_9227_OCCUPIED')
  } else { $cdpPortStatus = 'free' }
} catch { [void]$issues.Add('CDP_PORT_AVAILABILITY_UNVERIFIED') }
$candidate = [ordered]@{
  supplied = -not [string]::IsNullOrWhiteSpace($CandidateExe)
  checked = $false
  expectedName = $expectedFileName
  expectedSha256 = $expectedSha256
  actualSha256 = $null
  expectedBytes = $expectedBytes
  actualBytes = $null
  match = $false
}
if ($candidate.supplied) {
  try {
    if (-not (Test-Path -LiteralPath $CandidateExe -PathType Leaf)) {
      [void]$issues.Add('CANDIDATE_FILE_NOT_FOUND')
    } else {
      $file = Get-Item -LiteralPath $CandidateExe -Force
      if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        [void]$issues.Add('CANDIDATE_REPARSE_POINT_FORBIDDEN')
      } elseif ($file.Name -cne $expectedFileName) {
        [void]$issues.Add('CANDIDATE_NAME_MISMATCH')
      } elseif ($file.Length -ne $expectedBytes) {
        $candidate.actualBytes = $file.Length
        [void]$issues.Add('CANDIDATE_SIZE_MISMATCH')
      } else {
        $candidate.actualBytes = $file.Length
        $candidate.actualSha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $candidate.checked = $true
        $candidate.match = $candidate.actualSha256 -ceq $expectedSha256
        if (-not $candidate.match) { [void]$issues.Add('CANDIDATE_SHA256_MISMATCH') }
      }
    }
  } catch { [void]$issues.Add('CANDIDATE_READ_FAILED') }
}
$status = if ($issues.Count -gt 0) { 'BLOCKED' } elseif ($candidate.supplied -and $candidate.checked -and $candidate.match) {
  'PASS_STATIC_PREREQUISITES_ONLY'
} else { 'ENVIRONMENT_ONLY_NOT_EXE_ACCEPTANCE' }
$receipt = [ordered]@{
  schema = 'yutang.windows147.readonly-readiness.v1'
  status = $status
  candidate = $candidate
  windowsPlatform = $windows
  edgePresent = $edgePresent
  edgeProductVersion = $edgeVersion
  cdpPort9227 = $cdpPortStatus
  issues = @($issues.ToArray())
  exeStarted = $false
  browserStarted = $false
  networkRequested = $false
  filesystemModified = $false
  generalUserPcAcceptance = $false
  releaseAuthorized = $false
}
$receipt | ConvertTo-Json -Depth 5 -Compress
if ($issues.Count -gt 0) { exit 2 }

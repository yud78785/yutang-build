#requires -Version 5.1
# Manual Windows-only preflight. Never signs, launches, or installs the EXE.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$UnsignedExe
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedName = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe'
$expectedSha256 = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34'
$signerScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\tools\signing\Sign-YuTangCandidate.ps1'))
$expectedSignerSha256 = '2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1'

function Assert-True([bool]$condition, [string]$reason) {
  if (-not $condition) { throw "YUTANG_NOSIGN_PREFLIGHT_FAILED: $reason" }
}
function Expect-Rejection([string]$scenario, [string]$inputExe, [string]$inputSha, [string]$errorCode, [string]$outputDirectory) {
  $failed = $false
  try {
    # The signing mode switch is never passed by this harness.
    $null = & $signerScript -SourceExe $inputExe -ExpectedUnsignedSha256 $inputSha -OutputDirectory $outputDirectory
  } catch {
    $failed = $true
    if ([string]$_.Exception.Message -notlike ('*' + $errorCode + '*')) {
      throw "YUTANG_NOSIGN_PREFLIGHT_FAILED: $scenario expected $errorCode but received $($_.Exception.Message)"
    }
  }
  Assert-True $failed ("$scenario did not reject")
}

Assert-True (Test-Path -LiteralPath $signerScript -PathType Leaf) 'SIGNER_SCRIPT_NOT_FOUND'
$signerSha = (Get-FileHash -LiteralPath $signerScript -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True ($signerSha -ceq $expectedSignerSha256) 'SIGNER_SCRIPT_SHA256_MISMATCH'

$exe = [System.IO.Path]::GetFullPath($UnsignedExe)
Assert-True (Test-Path -LiteralPath $exe -PathType Leaf) 'SOURCE_NOT_FOUND'
Assert-True ([System.IO.Path]::GetFileName($exe) -ceq $expectedName) 'SOURCE_FILENAME_NOT_PINNED'
$beforeSha = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True ($beforeSha -ceq $expectedSha256) 'SOURCE_SHA256_NOT_PINNED'
$beforeSize = (Get-Item -LiteralPath $exe).Length
Assert-True ($beforeSize -eq 125446071) 'SOURCE_SIZE_NOT_PINNED'

$scratch = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ('yutang-nosign-preflight-' + [guid]::NewGuid().ToString('N')))
[void][System.IO.Directory]::CreateDirectory($scratch)
$workOutput = Join-Path $scratch 'output'
[void][System.IO.Directory]::CreateDirectory($workOutput)
try {
  $goodOutput = @(& $signerScript -SourceExe $exe -ExpectedUnsignedSha256 $expectedSha256 -OutputDirectory $workOutput)
  Assert-True ($goodOutput.Count -eq 1 -and [string]$goodOutput[0] -match '^PREFLIGHT_OK_NO_SIGNING ') 'NORMAL_DRY_RUN_NOT_APPROVED'

  Expect-Rejection 'bad-digest' $exe ('0' * 64) 'UNSIGNED_SHA256_NOT_ACCEPTED_BASELINE' $workOutput

  $renamed = Join-Path $scratch 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe'
  [System.IO.File]::WriteAllBytes($renamed, [byte[]]@(77,90,0,0))
  Expect-Rejection 'renamed-version' $renamed $expectedSha256 'UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE' $workOutput

  $badDirectory = Join-Path $scratch 'altered'
  [void][System.IO.Directory]::CreateDirectory($badDirectory)
  $altered = Join-Path $badDirectory $expectedName
  [System.IO.File]::WriteAllBytes($altered, [byte[]]@(77,90,0,0))
  Expect-Rejection 'altered-contents' $altered $expectedSha256 'UNSIGNED_CANDIDATE_SHA256_MISMATCH' $workOutput

  $missing = Join-Path $scratch 'absent\Dafeiyu-Douyin-API-1.4.7-win-x64.exe'
  Expect-Rejection 'missing-source' $missing $expectedSha256 'SOURCE_EXE_MISSING' $workOutput

  $afterSha = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert-True ($beforeSha -ceq $afterSha) 'ORIGINAL_EXE_CHANGED'
  $outputFiles = @(Get-ChildItem -LiteralPath $workOutput -Force)
  Assert-True ($outputFiles.Count -eq 0) 'UNEXPECTED_SIGNED_OUTPUT'

  # No certificate, SignTool, token or password access should occur in the no-sign path.
  $receipt = [ordered]@{
    schema = 'yutang.windows-signing-nosign-preflight.v1'
    status = 'PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY'
    unsignedExeName = $expectedName
    unsignedExeSha256 = $afterSha
    unsignedExeSize = $beforeSize
    signerScriptSha256 = $signerSha
    checks = @('accepted-source','wrong-digest-rejected','renamed-version-rejected',
               'altered-contents-rejected','missing-source-rejected',
               'source-unchanged','output-empty')
    authenticodeSigned = $false
    signedExeAcceptance = $false
    publicationAuthorized = $false
  }
  $receipt | ConvertTo-Json -Depth 4 -Compress
} finally {
  [System.IO.Directory]::Delete($scratch, $true)
}

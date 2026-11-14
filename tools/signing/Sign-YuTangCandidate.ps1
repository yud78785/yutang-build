# Local-only manual Certum SimplySign + Microsoft SignTool signing. NEVER upload keys or PINs.
# No -Sign: only preflight, no EXE modification.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SourceExe,
  [Parameter(Mandatory=$true)][string]$ExpectedUnsignedSha256,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [string]$ExpectedThumbprint,
  [string]$SignToolPath,
  [switch]$Sign
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Fail([string]$Message) { throw "YUTANG_LOCAL_SIGNING_FAILED: $Message" }
$sha = $ExpectedUnsignedSha256.ToLowerInvariant()
if ($sha -cnotmatch '^[a-f0-9]{64}$') { Fail 'UNSIGNED_SHA256_INVALID' }
# Restricted to the exact unsigned EXE that passed 2025 and same-file 2022 acceptance.
$pinnedUnsignedSha256 = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34'
if ($sha -cne $pinnedUnsignedSha256) { Fail 'UNSIGNED_SHA256_NOT_ACCEPTED_BASELINE' }
$source = [System.IO.Path]::GetFullPath($SourceExe)
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { Fail 'SOURCE_EXE_MISSING' }
$sourceItem = Get-Item -LiteralPath $source -Force
if (($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'SOURCE_REPARSE_POINT_FORBIDDEN' }
$name = [System.IO.Path]::GetFileName($source)
if ($name -cnotmatch '^Dafeiyu-Douyin-API-\d+\.\d+\.\d+-win-x64\.exe$') { Fail 'SOURCE_EXE_NAME_INVALID' }
# The accepted unsigned SHA belongs to version 1.4.7 only; a renamed 1.4.8 EXE is not an accepted candidate.
$pinnedUnsignedFileName = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe'
if ($name -cne $pinnedUnsignedFileName) { Fail 'UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE' }
$actual = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -cne $sha) { Fail 'UNSIGNED_CANDIDATE_SHA256_MISMATCH' }
$sourceStatus = Get-AuthenticodeSignature -LiteralPath $source
if ([string]$sourceStatus.Status -cne 'NotSigned') { Fail 'SOURCE_MUST_BE_UNSIGNED_VERIFIED_CANDIDATE' }
$sourceSize = (Get-Item -LiteralPath $source).Length
if ($sourceSize -lt 1024 -or $sourceSize -gt 524288000) { Fail 'SOURCE_EXE_SIZE_INVALID' }
if (-not $Sign) {
  Write-Output "PREFLIGHT_OK_NO_SIGNING sourceSha256=$actual sourceBytes=$sourceSize"
  return
}
if ([string]::IsNullOrWhiteSpace($ExpectedThumbprint)) { Fail 'THUMBPRINT_REQUIRED_FOR_SIGNING' }
$thumb = ($ExpectedThumbprint -replace '\s','').ToUpperInvariant()
if ($thumb -cnotmatch '^[A-F0-9]{40}$') { Fail 'THUMBPRINT_INVALID' }
if ([string]::IsNullOrWhiteSpace($SignToolPath) -or -not [System.IO.Path]::IsPathRooted($SignToolPath)) {
  Fail 'ABSOLUTE_OFFICIAL_SIGNTOOL_PATH_REQUIRED'
}
$signTool = [System.IO.Path]::GetFullPath($SignToolPath)
if ([System.IO.Path]::GetFileName($signTool) -ine 'signtool.exe' -or -not (Test-Path -LiteralPath $signTool -PathType Leaf)) { Fail 'SIGNTOOL_NOT_FOUND' }
$signToolItem = Get-Item -LiteralPath $signTool -Force
if (($signToolItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'SIGNTOOL_REPARSE_POINT_FORBIDDEN' }
$signToolSignature = Get-AuthenticodeSignature -LiteralPath $signTool
if ([string]$signToolSignature.Status -cne 'Valid' -or $null -eq $signToolSignature.SignerCertificate -or
    [string]$signToolSignature.SignerCertificate.Subject -notmatch '(?i)(CN|O)=Microsoft Corporation(,|$)') {
  Fail 'SIGNTOOL_NOT_MICROSOFT_SIGNED'
}
$cert = @(Get-ChildItem -Path 'Cert:\CurrentUser\My' | Where-Object {
  ($_.Thumbprint -replace '\s','').ToUpperInvariant() -ceq $thumb
})
if ($cert.Count -ne 1 -or -not $cert[0].HasPrivateKey) { Fail 'SIMPLYSIGN_CERT_NOT_AVAILABLE_IN_CURRENT_USER_STORE' }
if ((Get-Date) -lt $cert[0].NotBefore -or (Get-Date) -gt $cert[0].NotAfter) { Fail 'CERTIFICATE_NOT_CURRENTLY_VALID' }
$eku = @($cert[0].EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value })
if ($eku -notcontains '1.3.6.1.5.5.7.3.3') { Fail 'CERTIFICATE_NOT_CODE_SIGNING' }
$outputDir = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $outputDir -PathType Container)) { Fail 'OUTPUT_DIRECTORY_MUST_ALREADY_EXIST' }
$outputDirItem = Get-Item -LiteralPath $outputDir -Force
if (($outputDirItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'OUTPUT_DIRECTORY_REPARSE_POINT_FORBIDDEN' }
$dest = [System.IO.Path]::Combine($outputDir, $name)
if ($dest -ieq $source) { Fail 'NEVER_SIGN_ORIGINAL_CANDIDATE_IN_PLACE' }
if (Test-Path -LiteralPath $dest) { Fail 'SIGNED_OUTPUT_ALREADY_EXISTS' }
$receiptFile = [System.IO.Path]::Combine($outputDir,'windows-local-signing-receipt.json')
if (Test-Path -LiteralPath $receiptFile) { Fail 'SIGNING_RECEIPT_ALREADY_EXISTS' }
# CreateNew is atomic: unlike Test-Path then Copy-Item, it cannot overwrite a
# file created by the user or another process during the check/copy gap.
$inputStream = [System.IO.File]::Open($source,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
try {
  $outputStream = [System.IO.File]::Open($dest,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
  try {
    $inputStream.CopyTo($outputStream)
    $outputStream.Flush($true)
  } finally { $outputStream.Dispose() }
} finally { $inputStream.Dispose() }
if ((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha -or
    (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha) {
  Fail 'COPIED_CANDIDATE_CHANGED_BEFORE_SIGNING'
}
# SimplySign Desktop must already be authorized by the certificate holder.
# No PFX, TOTP, PIN or private key is sent to this script, GitHub or ChatGPT.
& $signTool sign /v /s My /sha1 $thumb /fd SHA256 /tr 'http://time.certum.pl' /td SHA256 $dest
if ($LASTEXITCODE -ne 0) { Fail 'SIGNTOOL_SIGN_FAILED_PRESERVE_OUTPUT_FOR_INSPECTION' }
& $signTool verify /pa /all /v /tw $dest
if ($LASTEXITCODE -ne 0) { Fail 'SIGNTOOL_VERIFY_FAILED_PRESERVE_OUTPUT_FOR_INSPECTION' }
$verified = Get-AuthenticodeSignature -LiteralPath $dest
if ([string]$verified.Status -cne 'Valid' -or $null -eq $verified.SignerCertificate -or
    ($verified.SignerCertificate.Thumbprint -replace '\s','').ToUpperInvariant() -cne $thumb) {
  Fail 'AUTHENTICODE_VERIFICATION_OR_PUBLISHER_MISMATCH'
}
if ($null -eq $verified.TimeStamperCertificate) { Fail 'TRUSTED_TIMESTAMP_NOT_PRESENT' }
$digest = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
if ($digest -ceq $sha) { Fail 'SIGNED_EXE_HASH_DID_NOT_CHANGE' }
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha) {
  Fail 'ORIGINAL_UNSIGNED_EXE_CHANGED_DURING_SIGNING'
}
$receipt = [ordered]@{
  schema = 'yutang.windows-local-signing-receipt.v1'
  file = $dest
  originalUnsignedSha256 = $sha
  sha256 = $digest
  size = (Get-Item -LiteralPath $dest).Length
  authenticode = [ordered]@{
    status = 'Valid'
    thumbprint = $thumb
    subject = [string]$verified.SignerCertificate.Subject
  }
  release = $false
  windowsRetestRequired = $true
}
$json = ($receipt | ConvertTo-Json -Depth 4) + [Environment]::NewLine
$stream = [System.IO.File]::Open($receiptFile,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
try {
  $buffer = (New-Object System.Text.UTF8Encoding($false)).GetBytes($json)
  $stream.Write($buffer,0,$buffer.Length)
} finally { $stream.Dispose() }
Write-Output "LOCAL_SIGNED_CANDIDATE_NOT_RELEASED newSha256=$digest; BOTH_WINDOWS_RETEST_REQUIRED"

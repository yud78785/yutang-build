# Only static, offline inspection of the immutable GitHub Actions ZIP. Does not execute EXE.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$ReportDirectory
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$expectedZip='b5febe43b2e947a86feda01484fbbc475776649ed7687d8d984f5992af6370e9'
$expectedExe='e9f07dbed400bd77a8ab6350ea3a54d338d02d7a8f0c04d87cc621e148160290'
$expectedName='Dafeiyu-Douyin-API-1.4.6-win-x64.exe'
if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) {throw 'Missing immutable Actions artifact ZIP'}
$zipHash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($zipHash -ne $expectedZip) {throw 'Immutable ZIP SHA-256 mismatch'}
$zipBytes=(Get-Item -LiteralPath $Archive).Length
if ($zipBytes -ne 124753189) {throw 'Immutable ZIP byte count mismatch'}
$reportRoot=[System.IO.Path]::GetFullPath($ReportDirectory)
if (Test-Path -LiteralPath $reportRoot) {throw 'Report directory must be new; refusing overwrite'}
[void][System.IO.Directory]::CreateDirectory($reportRoot)
$verifyResult=& python ./tools/verify_candidate.py $Archive
if ($LASTEXITCODE -ne 0) {throw 'Read-only candidate Python preflight rejected the ZIP'}
$identity=$verifyResult -join [Environment]::NewLine | ConvertFrom-Json
if ($identity.verdict -ne 'PASS_FILE_IDENTITY_ONLY') {throw 'Python preflight did not return exact expected verdict'}
# Extraction is permitted ONLY after exact immutable ZIP verification; no executable invocation.
$extract=Join-Path $reportRoot 'extracted-never-executed'
[System.IO.Compression.ZipFile]::ExtractToDirectory($Archive, $extract)
$exe=Join-Path $extract $expectedName
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {throw 'Expected EXE missing after extraction'}
$exeHash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($exeHash -ne $expectedExe) {throw 'Extracted EXE hash mismatch'}
$signature=Get-AuthenticodeSignature -LiteralPath $exe
$signatureStatus=[string]$signature.Status
# Actual outer PE launcher (NSIS) is UNSIGNED; NOT a software trust verdict.
$report=[ordered]@{
  gate='STATIC_IDENTITY_AND_SIGNING_ONLY';
  zip_sha256=$zipHash;
  zip_bytes=$zipBytes;
  exe_sha256=$exeHash;
  exe_bytes=(Get-Item -LiteralPath $exe).Length;
  authenticode_status=$signatureStatus;
  authenticode_signer=if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null };
  release_gate=if ($signatureStatus -eq 'Valid') {'REQUIRES_FURTHER_SECURITY_REVIEW'} else {'BLOCKED_NO_VALID_SIGNATURE'};
  exe_executed=$false;
  edge_started=$false;
  real_accounts_used=$false;
  known_gaps=@('Authenticode valid publisher not established', 'Actual Edge child and renderer sandbox not inspected', 'No real Douyin/model testing', 'A hash match is not proof of safety');
}
$reportFile=Join-Path $reportRoot 'windows-static-verification.json'
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportFile -Encoding UTF8
Write-Host 'PASS_WINDOWS_STATIC: verified original ZIP and EXE using Python and Windows SHA-256; no EXE execution.'
Write-Host "AUTHENTICODE: $signatureStatus; release gate: $($report.release_gate)"
Write-Host "REPORT: $reportFile"

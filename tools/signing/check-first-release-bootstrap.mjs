#!/usr/bin/env node
// Read-only, offline bootstrap gate for the exact accepted 1.4.7 unsigned baseline.
// This produces planning evidence, NOT signed-file acceptance or release permission.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  UPDATE_MANIFEST_PUBLIC_KEY, UPDATE_PUBLISHER_THUMBPRINT, newerVersion
} from '../windows147-update-patched/update-service.mjs';

const PINNED = Object.freeze({
  version: '1.4.7',
  sha256: '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34',
  sourceCommit: '9cc16d7e64d59dc141e9c6687b8dd461934fcc35',
  upstreamCommit: '9c49833078f4b4d18b9211ef86d024e7f2e15739',
  runner: 'win25-vs2026',
  bytes: 125446071
});

function requireGate(condition, code) { if (!condition) throw new Error(code); }
function validTarget(value) {
  return typeof value === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split('.').every(part => Number.isSafeInteger(Number(part)));
}

export function inspectBootstrap(receipt, targetVersion) {
  requireGate(validTarget(targetVersion), 'TARGET_VERSION_INVALID');
  requireGate(receipt && !Array.isArray(receipt) && typeof receipt === 'object', 'SOURCE_RECEIPT_INVALID');
  const patch = receipt.updateTrustPatch;
  requireGate(
    receipt.schema === 'yutang.windows-openrouter-candidate.v1' &&
    receipt.status === 'PASS_WINDOWS_PACKAGED_SMOKE_AND_EDGE_SECURITY' &&
    receipt.productVersion === PINNED.version &&
    receipt.sha256 === PINNED.sha256 &&
    receipt.yutangPatchCommit === PINNED.sourceCommit &&
    receipt.upstreamCommit === PINNED.upstreamCommit &&
    receipt.runnerImage === PINNED.runner &&
    receipt.bytes === PINNED.bytes &&
    receipt.signatureStatus === 'NotSigned' &&
    receipt.release === false,
    'UNSIGNED_147_ACCEPTANCE_IDENTITY_MISMATCH'
  );
  requireGate(
    patch && patch.schema === 'yutang.windows-update-trust-patch.v1' &&
    patch.manifestPublicKeyConfigured === false &&
    patch.authenticodePublisherThumbprintConfigured === false &&
    patch.updatesDisabledUntilTrustConfigured === true &&
    patch.release === false,
    'SOURCE_UPDATE_TRUST_RECEIPT_INCONSISTENT'
  );
  requireGate(!UPDATE_MANIFEST_PUBLIC_KEY && !UPDATE_PUBLISHER_THUMBPRINT,
    'LOCAL_UPDATER_TEMPLATE_NO_LONGER_MATCHES_ACCEPTED_147_TRUST_STATE');

  const targetIsHigher = newerVersion(targetVersion, PINNED.version);
  return Object.freeze({
    schema: 'yutang.first-signed-release-bootstrap-preflight.v1',
    status: 'BLOCKED_FOR_AUTOMATIC_UPDATE_BOOTSTRAP',
    acceptedUnsignedBaselineSha256: PINNED.sha256,
    acceptedSourceCommit: PINNED.sourceCommit,
    currentVersion: PINNED.version,
    proposedVersion: targetVersion,
    proposedVersionIsHigher: targetIsHigher,
    currentClientManifestKeyConfigured: false,
    currentClientPublisherThumbprintConfigured: false,
    currentClientCanAutomaticallyInstallSignedRelease: false,
    manualBootstrapDistributionRequired: true,
    currentUnsignedExeMustRemainUnchanged: true,
    signedExeEvidenceInSourceReceipt: false,
    signedWindowsAcceptance: 'NOT_EVALUATED',
    reasons: targetIsHigher
      ? ['SOURCE_UPDATE_TRUST_DISABLED', 'NEW_PINNED_CLIENT_BUILD_AND_RETEST_REQUIRED']
      : ['SOURCE_UPDATE_TRUST_DISABLED', 'TARGET_VERSION_NOT_HIGHER', 'NEW_PINNED_CLIENT_BUILD_AND_RETEST_REQUIRED'],
    note: 'A real signed EXE would require new SHA-256 and independent Windows 2022 and Windows 2025 acceptance. No Authenticode or online updater test is performed here.'
  });
}

async function run(argv) {
  requireGate(argv.length === 4 && argv[0] === '--receipt' && argv[2] === '--target-version',
    'USAGE: --receipt <absolute-json-path> --target-version <x.y.z>');
  requireGate(path.isAbsolute(argv[1]), 'ABSOLUTE_RECEIPT_PATH_REQUIRED');
  const stat = await fs.lstat(argv[1]);
  requireGate(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 65536,
    'SOURCE_RECEIPT_FILE_INVALID');
  const receipt = JSON.parse(await fs.readFile(argv[1], 'utf8'));
  return inspectBootstrap(receipt, argv[3]);
}

const directly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (directly) {
  run(process.argv.slice(2)).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error('YUTANG_BOOTSTRAP_PREFLIGHT_FAILED: ' + String(error?.message || error));
    process.exitCode = 1;
  });
}

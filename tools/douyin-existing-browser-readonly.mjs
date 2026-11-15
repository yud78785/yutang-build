// Optional host-side integration for YuTang's EXISTING dedicated Edge session.
// Calls only upstream connectExistingBrowser (never connect, openBrowser, navigate or create).
// Read-only page functions are injected by the pinned runtime; this file contains
// no persistent data writes, credentials, direct CDP commands or model requests.
// Its injected upstream tab-api lock provider creates/removes a temporary lock file.
const ORIGIN = 'https://www.douyin.com';
const VIDEO = /^\d{10,30}$/;
const LABELS = new Set(['deepseek-douyin-api', 'deepseek-douyin-dsh']);
const LIMIT_PAGES = 30;

// Match the pinned upstream browser-pages.mjs ownership candidate scope.
// An owned Edge page can be about:blank while navigating, or a Douyin live
// room, not only www.douyin.com. Never evaluate window.name on offsite or
// private tabs; malformed page URLs fail the whole inspection closed.
function upstreamOwnedCandidateUrl(value) {
  if (typeof value !== 'string') throw new TypeError('UNVERIFIED_PAGE_URL');
  if (value === 'about:blank' || value.startsWith('about:blank#')) return true;
  const address = new URL(value);
  if (address.username || address.password) return false;
  if (address.origin === ORIGIN) return true;
  return address.origin === 'https://live.douyin.com' && /^\/\d{4,30}\/?$/.test(address.pathname);
}

function blocked(reasonCode, videoId) {
  return {
    status: 'blocked', reasonCode, videoId,
    connectionMethod: 'upstream_connectExistingBrowser',
    comments: [], aiSummaryEntryVisible: false, aiSummaryGenerated: false,
    browserLaunchedByThisProbe: false, navigationByThisProbe: false,
    clickedByThisProbe: false, persistentDataModifiedByThisProbe: false,
  };
}
function videoRoute(value, expectedId) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.origin === ORIGIN && !u.username && !u.password &&
      u.pathname === `/video/${expectedId}` && !u.hash &&
      ['aweme_id', 'modal_id'].every(key => u.searchParams.getAll(key).every(v => v === expectedId));
  } catch { return false; }
}
function isAbort(signal) { return signal?.aborted === true; }
function safeCode(value) { return typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value) ? value : 'UNKNOWN'; }
function validCommentReceipt(receipt, expectedVideoId, limit) {
  if (!receipt || receipt.videoId !== expectedVideoId ||
      !['ok', 'no_visible_comments'].includes(receipt.status) ||
      receipt.source !== 'visible_public_comment_dom' ||
      receipt.observationScope !== 'currently_visible_loaded_rows_only' ||
      !Array.isArray(receipt.comments) || receipt.comments.length > limit ||
      receipt.visibleCommentCount !== receipt.comments.length) return false;
  if (receipt.status === 'ok' && receipt.comments.length === 0) return false;
  if (receipt.status === 'no_visible_comments' && receipt.comments.length !== 0) return false;
  return receipt.comments.every(row => row && typeof row === 'object' &&
    typeof row.text === 'string' && row.text.length > 0 && row.text.length <= 512 &&
    (row.commentId === null || typeof row.commentId === 'string' && /^\d{1,64}$/.test(row.commentId)));
}
function validPassiveNetworkReceipt(receipt, expectedVideoId, limit) {
  if (receipt == null) return {valid:true,comments:[],status:'not_instrumented'};
  if (receipt.status === 'not_observed') return {
    valid:receipt.videoId === expectedVideoId && Array.isArray(receipt.comments) && receipt.comments.length === 0,
    comments:[],status:'not_observed',
  };
  if (receipt.status !== 'api_response_observed' ||
      receipt.source !== 'already_loaded_first_party_comment_api' ||
      receipt.scope !== 'captured_page_response_only_not_independently_dom_visible' ||
      receipt.videoId !== expectedVideoId || receipt.aiSummaryGenerated !== false || receipt.aiSummaryText !== null ||
      !Array.isArray(receipt.comments) || receipt.comments.length < 1 || receipt.comments.length > limit ||
      receipt.count !== receipt.comments.length) return {valid:false,comments:[],status:'invalid'};
  const comments=[];
  for(const entry of receipt.comments){
    if (!entry || entry.videoId !== expectedVideoId ||
        typeof entry.commentId !== 'string' || !/^\d{1,64}$/.test(entry.commentId) ||
        typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 512)
      return {valid:false,comments:[],status:'invalid'};
    comments.push({commentId:entry.commentId,text:entry.text});
  }
  return {valid:true,comments,status:'api_response_observed'};
}

function validAiReceipt(receipt, expectedVideoId) {
  return receipt && receipt.videoId === expectedVideoId &&
    receipt.evidenceSource === 'visible_official_ai_iframe_entry_only' &&
    ['entry_visible', 'not_observed'].includes(receipt.status) &&
    receipt.aiSummaryEntryVisible === (receipt.status === 'entry_visible') &&
    receipt.aiSummaryGenerated === false && receipt.aiSummaryText === null &&
    Number.isSafeInteger(receipt.matchingFrameCount) && receipt.matchingFrameCount >= 0 && receipt.matchingFrameCount <= 1;
}

/**
 * Executed only from a host already carrying pinned upstream BrowserController.
 * A validated connection is required; the function never boots Edge or opens a tab.
 *
 * @param {Object} args
 * @param {Object} args.controller - existing upstream BrowserController instance
 * @param {Function} args.readPageState - pinned upstream core.mjs export
 * @param {Function} args.readCommentDom - pinned upstream comment-browser.mjs export
 * @param {Function} args.observeComments - read-only module's observePublicCommentsReadOnly
 * @param {Function} args.inspectSummary - read-only module's inspectDouyinAiSummaryEntryReadOnly
 */
export async function inspectExistingDedicatedDouyinVideoReadOnly({
  controller, readPageState, readCommentDom, observeComments, inspectSummary,
  acquireReadLock, expectedVideoId, limit = 12, observationTimeoutMs = 15000, signal,
} = {}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('INVALID_LIMIT');
  if (!Number.isSafeInteger(observationTimeoutMs) || observationTimeoutMs < 25 || observationTimeoutMs > 60000)
    throw new TypeError('INVALID_OBSERVATION_TIMEOUT');
  if (typeof controller?.connectExistingBrowser !== 'function' ||
      typeof readPageState !== 'function' || typeof readCommentDom !== 'function' ||
      typeof observeComments !== 'function' || typeof inspectSummary !== 'function') {
    throw new TypeError('PINNED_RUNTIME_READERS_REQUIRED');
  }
  if (typeof acquireReadLock !== 'function')
    return blocked('UPSTREAM_OPERATION_LOCK_REQUIRED', expectedVideoId);
  if (isAbort(signal)) return blocked('CANCELLED_BEFORE_READ', expectedVideoId);
  let browser;
  try { browser = await controller.connectExistingBrowser({ signal }); }
  catch { return blocked('EXISTING_BROWSER_CONNECTION_FAILED', expectedVideoId); }
  if (isAbort(signal)) return blocked('CANCELLED_AFTER_CONNECTION', expectedVideoId);
  if (!browser) return blocked('DEDICATED_BROWSER_NOT_RUNNING', expectedVideoId);
  let release;
  try { release = await acquireReadLock({ signal, controller }); }
  catch { return blocked('UPSTREAM_OPERATION_LOCK_FAILED', expectedVideoId); }
  if (typeof release !== 'function') return blocked('UPSTREAM_OPERATION_LOCK_UNVERIFIED', expectedVideoId);
  let receipt, timer;
  const inspection = Promise.resolve().then(() => inspectConnectedBrowserReadOnly({
    browser, readPageState, readCommentDom, observeComments, inspectSummary,
    expectedVideoId, limit, signal,
  }));
  // Playwright page.evaluate() has no dependable per-call timeout here. A hung
  // DOM observation must not hold the cooperative upstream tab-api lock forever.
  // A timed-out inspection is never trusted, even if it resolves late.
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve(blocked('READ_ONLY_OBSERVATION_TIMEOUT', expectedVideoId)), observationTimeoutMs);
  });
  try { receipt = await Promise.race([inspection, deadline]); }
  catch { receipt = blocked('READ_ONLY_INSPECTION_UNEXPECTED_FAILURE', expectedVideoId); }
  finally { clearTimeout(timer); }
  try { await release(); }
  catch { return { ...blocked('UPSTREAM_OPERATION_LOCK_RELEASE_FAILED', expectedVideoId),
    temporaryOperationLockUsed: true, temporaryOperationLockCleanupVerified: false }; }
  if (!receipt || typeof receipt !== 'object') return blocked('READ_ONLY_RECEIPT_UNAVAILABLE', expectedVideoId);
  // A temporary upstream tab-api lockfile is created and removed by the
  // lock provider; the probe itself does not change Douyin or persistent data.
  return { ...receipt, operationLock: 'upstream_tab_api_acquired_released',
    temporaryOperationLockUsed: true, temporaryOperationLockCleanupVerified: true,
    persistentDataModifiedByThisProbe: false };
}

async function inspectConnectedBrowserReadOnly({
  browser, readPageState, readCommentDom, observeComments, inspectSummary,
  expectedVideoId, limit, signal,
}) {
  let contexts, pages;
  try {
    if (browser.isConnected?.() !== true) return blocked('BROWSER_NOT_CONNECTED', expectedVideoId);
    contexts = browser.contexts();
    if (!Array.isArray(contexts) || contexts.length !== 1) return blocked('DEDICATED_CONTEXT_NOT_UNIQUE', expectedVideoId);
    pages = contexts[0].pages();
    if (!Array.isArray(pages) || pages.length > LIMIT_PAGES) return blocked('DEDICATED_PAGE_LIST_UNVERIFIED', expectedVideoId);
  } catch { return blocked('BROWSER_PAGE_ENUMERATION_FAILED', expectedVideoId); }
  // Count every upstream-owned page candidate, including transient
  // about:blank and Douyin live rooms, not only tabs at the target video.
  // Otherwise an additional owned tab could mutate the same browser session.
  const owned = [];
  try {
    for (const page of pages) {
      if (isAbort(signal)) return blocked('CANCELLED_DURING_PAGE_SELECTION', expectedVideoId);
      if (page?.isClosed?.() !== false) continue;
      if (!upstreamOwnedCandidateUrl(page.url())) continue;
      const label = await page.evaluate(() => window.name);
      if (LABELS.has(label)) owned.push(page);
    }
  } catch { return blocked('OWNED_VIDEO_PAGE_READ_FAILED', expectedVideoId); }
  if (owned.length > 1) return blocked('OWNED_VIDEO_PAGE_AMBIGUOUS', expectedVideoId);
  if (owned.length === 0 || !videoRoute(owned[0].url(), expectedVideoId))
    return blocked('OWNED_VIDEO_PAGE_NOT_FOUND', expectedVideoId);
  const page = owned[0];
  let initialUrl, initialDocument;
  try {
    initialUrl = page.url();
    initialDocument = await page.evaluate(() => ({
      label: window.name, documentOrigin: performance.timeOrigin, locationHref: location.href,
    }));
  } catch { return blocked('INITIAL_DOCUMENT_IDENTITY_UNAVAILABLE', expectedVideoId); }
  if (!videoRoute(initialUrl, expectedVideoId) ||
      !initialDocument || !LABELS.has(initialDocument.label) ||
      !Number.isFinite(initialDocument.documentOrigin) || initialDocument.documentOrigin <= 0 ||
      initialDocument.locationHref !== initialUrl) return blocked('INITIAL_DOCUMENT_IDENTITY_MISMATCH', expectedVideoId);

  let commentResult, aiResult;
  try {
    commentResult = await observeComments({ page, readPageState, readCommentDom, expectedVideoId, limit });
  } catch { return blocked('PUBLIC_COMMENT_INSPECTION_FAILED', expectedVideoId); }
  if (commentResult?.status === 'blocked') return blocked('COMMENT_' + safeCode(commentResult.reasonCode), expectedVideoId);
  if (!validCommentReceipt(commentResult, expectedVideoId, limit)) return blocked('PUBLIC_COMMENT_RECEIPT_INVALID', expectedVideoId);
  const passiveNetwork = validPassiveNetworkReceipt(commentResult.passiveNetwork, expectedVideoId, limit);
  if (!passiveNetwork.valid) return blocked('PASSIVE_NETWORK_RECEIPT_INVALID', expectedVideoId);
  if (isAbort(signal)) return blocked('CANCELLED_AFTER_COMMENTS', expectedVideoId);
  try {
    aiResult = await inspectSummary({ page, readPageState, expectedVideoId });
  } catch { return blocked('AI_ENTRY_INSPECTION_FAILED', expectedVideoId); }
  if (aiResult?.status === 'blocked') return blocked('AI_ENTRY_' + safeCode(aiResult.reasonCode), expectedVideoId);
  if (!validAiReceipt(aiResult, expectedVideoId)) return blocked('AI_ENTRY_RECEIPT_INVALID', expectedVideoId);
  if (isAbort(signal)) return blocked('CANCELLED_AFTER_AI_ENTRY', expectedVideoId);
  try {
    if (page.isClosed() || page.url() !== initialUrl) return blocked('PAGE_CHANGED_DURING_INSPECTION', expectedVideoId);
    const finalDocument = await page.evaluate(() => ({
      label: window.name, documentOrigin: performance.timeOrigin, locationHref: location.href,
    }));
    // A navigation back to the same URL can otherwise falsely preserve a stale
    // comment/AI-entry receipt. Never copy raw URL or document timing into output.
    if (!finalDocument || finalDocument.label !== initialDocument.label ||
        finalDocument.documentOrigin !== initialDocument.documentOrigin ||
        finalDocument.locationHref !== initialDocument.locationHref)
      return blocked('DOCUMENT_CHANGED_DURING_INSPECTION', expectedVideoId);
    if (browser.isConnected() !== true) return blocked('BROWSER_DISCONNECTED_DURING_INSPECTION', expectedVideoId);
    // Re-enumerate the pre-existing context after both reads. A newly opened
    // upstream-owned tab invalidates evidence even when the original page and
    // document remained stable. Never scan private/non-Douyin page contents.
    const finalContexts = browser.contexts();
    if (!Array.isArray(finalContexts) || finalContexts.length !== 1)
      return blocked('FINAL_CONTEXT_NOT_UNIQUE', expectedVideoId);
    const finalPages = finalContexts[0].pages();
    if (!Array.isArray(finalPages) || finalPages.length > LIMIT_PAGES)
      return blocked('FINAL_PAGE_LIST_UNVERIFIED', expectedVideoId);
    const finalOwned = [];
    for (const candidate of finalPages) {
      if (isAbort(signal)) return blocked('CANCELLED_DURING_FINAL_PAGE_SELECTION', expectedVideoId);
      if (candidate?.isClosed?.() !== false) continue;
      if (!upstreamOwnedCandidateUrl(candidate.url())) continue;
      if (LABELS.has(await candidate.evaluate(() => window.name))) finalOwned.push(candidate);
    }
    if (finalOwned.length !== 1 || finalOwned[0] !== page)
      return blocked('OWNED_VIDEO_PAGE_CHANGED_DURING_INSPECTION', expectedVideoId);
  } catch { return blocked('FINAL_BROWSER_STATE_UNAVAILABLE', expectedVideoId); }
  // This receipt refers ONLY to this probe's calls, not concurrent user/agent actions.
  const anyObserved = commentResult.status === 'ok' || aiResult.status === 'entry_visible' ||
    passiveNetwork.comments.length > 0;
  return {
    status: anyObserved ? 'read_only_evidence' : 'no_visible_evidence',
    videoId: expectedVideoId,
    reasonCode: anyObserved ? null : 'NO_PUBLIC_COMMENTS_OR_AI_ENTRY_VISIBLE',
    connectionMethod: 'upstream_connectExistingBrowser',
    publicCommentsStatus: commentResult.status,
    comments: commentResult.comments.slice(0, limit).map(row => ({text: row.text, commentId: row.commentId ?? null})),
    // First-party API data and currently visible DOM comments are deliberately
    // separated. A captured response is not proof of a visually opened panel.
    publicNetworkCommentsStatus: passiveNetwork.status,
    publicNetworkCommentsScope: 'captured_page_response_only_not_independently_dom_visible',
    publicNetworkComments: passiveNetwork.comments,
    aiSummaryEntryVisible: aiResult.status === 'entry_visible',
    aiSummaryEntryStatus: aiResult.status,
    aiSummaryGenerated: false,
    aiSummaryText: null,
    browserLaunchedByThisProbe: false, navigationByThisProbe: false,
    clickedByThisProbe: false, persistentDataModifiedByThisProbe: false,
  };
}

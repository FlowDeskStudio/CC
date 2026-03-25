/**
 * domParser.js
 * X (Twitter) DOM解析モジュール
 * タイムラインとプロフィールページからアカウント情報を抽出
 */

'use strict';

window.XAccountFilter = window.XAccountFilter || {};

/**
 * 数値文字列を解析（"1.2K" → 1200, "3.4M" → 3400000）
 * @param {string} text
 * @returns {number|null}
 */
function parseCount(text) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([KkMmBb]?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'K') return Math.round(num * 1000);
  if (suffix === 'M') return Math.round(num * 1000000);
  if (suffix === 'B') return Math.round(num * 1000000000);
  return Math.round(num);
}

/**
 * ツイートカードからアカウントデータを抽出
 * @param {Element} element - ツイートカードのDOM要素
 * @returns {object|null}
 */
function parseTweetCard(element) {
  try {
    // ユーザー名（@handle）
    const userNameEl = element.querySelector('[data-testid="User-Name"]');
    if (!userNameEl) return null;

    // 表示名
    const displayNameEl = userNameEl.querySelector('span:first-child span');
    const displayName = displayNameEl ? displayNameEl.textContent.trim() : '';

    // @username
    const handleEl = userNameEl.querySelector('a[href^="/"]');
    let username = '';
    if (handleEl) {
      const href = handleEl.getAttribute('href') || '';
      username = href.replace(/^\//, '').split('/')[0];
    }

    if (!username) return null;

    // ツイートテキスト
    const tweetTextEl = element.querySelector('[data-testid="tweetText"]');
    const tweetText = tweetTextEl ? tweetTextEl.textContent.trim() : '';

    // いいね数
    const likeEl = element.querySelector('[data-testid="like"] span[data-testid="app-text-transition-container"]');
    const likesCount = likeEl ? parseCount(likeEl.textContent) : null;

    // リツイート数
    const rtEl = element.querySelector('[data-testid="retweet"] span[data-testid="app-text-transition-container"]');
    const retweetsCount = rtEl ? parseCount(rtEl.textContent) : null;

    // 引用・返信数
    const replyEl = element.querySelector('[data-testid="reply"] span[data-testid="app-text-transition-container"]');

    return {
      username,
      displayName,
      tweets: tweetText ? [tweetText] : [],
      likesCount,
      retweetsCount,
      followersCount: null,  // タイムラインカードでは取得不可
      followingCount: null,
      joinDate: null,
      element
    };
  } catch (e) {
    return null;
  }
}

/**
 * タイムライン上の全ツイートカードを取得
 * @returns {Element[]}
 */
function parseTimeline() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  return Array.from(articles);
}

/**
 * プロフィールページから詳細なアカウント情報を取得
 * @returns {object|null}
 */
function parseProfilePage() {
  try {
    // ユーザー名をURLから取得
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) return null;
    const username = pathParts[0];

    // 表示名
    const displayNameEl = document.querySelector('[data-testid="UserName"] span span');
    const displayName = displayNameEl ? displayNameEl.textContent.trim() : '';

    // フォロワー数
    let followersCount = null;
    let followingCount = null;

    const statsLinks = document.querySelectorAll('a[href$="/followers"], a[href$="/verified_followers"]');
    for (const link of statsLinks) {
      const numEl = link.querySelector('span span');
      if (numEl) followersCount = parseCount(numEl.textContent);
    }

    const followingLinks = document.querySelectorAll('a[href$="/following"]');
    for (const link of followingLinks) {
      const numEl = link.querySelector('span span');
      if (numEl) followingCount = parseCount(numEl.textContent);
    }

    // 登録日
    let joinDate = null;
    const joinEl = document.querySelector('[data-testid="UserJoinDate"]');
    if (joinEl) {
      const text = joinEl.textContent.trim();
      // "2023年1月から" や "Joined January 2023" 形式を処理
      const yearMatch = text.match(/(\d{4})/);
      const monthMatch = text.match(/(\d{1,2})月|January|February|March|April|May|June|July|August|September|October|November|December/i);
      if (yearMatch) {
        joinDate = yearMatch[1] + (monthMatch ? `-${String(getMonthNumber(monthMatch[0])).padStart(2, '0')}` : '-01');
      }
    }

    // プロフィールのツイートを収集
    const tweets = [];
    const tweetEls = document.querySelectorAll('article[data-testid="tweet"] [data-testid="tweetText"]');
    tweetEls.forEach(el => {
      if (tweets.length < 10) tweets.push(el.textContent.trim());
    });

    return {
      username,
      displayName,
      followersCount,
      followingCount,
      joinDate,
      tweets
    };
  } catch (e) {
    return null;
  }
}

/**
 * 月名から月番号を返す補助関数
 */
function getMonthNumber(monthStr) {
  const months = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
  };
  return months[monthStr.toLowerCase()] || 1;
}

/**
 * ツイートカードに対応するアカウントのリンク要素を取得
 * @param {Element} tweetEl
 * @returns {string|null} - プロフィールURL
 */
function getProfileLink(tweetEl) {
  const linkEl = tweetEl.querySelector('[data-testid="User-Name"] a[href^="/"]');
  return linkEl ? linkEl.getAttribute('href') : null;
}

window.XAccountFilter.parseTweetCard = parseTweetCard;
window.XAccountFilter.parseTimeline = parseTimeline;
window.XAccountFilter.parseProfilePage = parseProfilePage;
window.XAccountFilter.getProfileLink = getProfileLink;
window.XAccountFilter.parseCount = parseCount;

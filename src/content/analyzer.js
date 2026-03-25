/**
 * analyzer.js
 * アカウント分析モジュール - Botおよび信頼性スコアの計算
 */

'use strict';

/**
 * ユーザー名のBot的パターンを検出するヒューリスティック
 * @param {string} username - @なしのユーザー名
 * @returns {{ score: number, reasons: string[] }}
 */
function analyzeUsername(username) {
  const reasons = [];
  let score = 0;

  if (!username || typeof username !== 'string') {
    return { score: 0, reasons: [] };
  }

  const name = username.toLowerCase().replace(/^@/, '');

  // 末尾に長い数字列（8桁以上）→ 自動生成アカウントの典型
  if (/\d{8,}$/.test(name)) {
    score += 30;
    reasons.push('ユーザー名末尾に長い数字列');
  } else if (/\d{5,7}$/.test(name)) {
    score += 15;
    reasons.push('ユーザー名末尾に数字列');
  }

  // アンダースコアが3つ以上
  const underscoreCount = (name.match(/_/g) || []).length;
  if (underscoreCount >= 3) {
    score += 20;
    reasons.push('ユーザー名に過剰なアンダースコア');
  } else if (underscoreCount === 2) {
    score += 8;
    reasons.push('ユーザー名に複数アンダースコア');
  }

  // 非常に長いユーザー名（15文字以上でランダムに見える）
  if (name.length >= 15) {
    // エントロピーが高い（文字種が多様）かチェック
    const uniqueChars = new Set(name.replace(/[^a-z0-9]/g, '')).size;
    const ratio = uniqueChars / Math.min(name.length, 15);
    if (ratio > 0.7) {
      score += 20;
      reasons.push('ランダムな長いユーザー名');
    } else {
      score += 5;
    }
  }

  // 数字と文字が交互に混在（ランダム生成パターン）
  if (/([a-z]\d){3,}|(\d[a-z]){3,}/.test(name)) {
    score += 20;
    reasons.push('数字と文字の交互パターン');
  }

  // 全体が数字のみ
  if (/^\d+$/.test(name)) {
    score += 35;
    reasons.push('ユーザー名が数字のみ');
  }

  // 意味のない文字列（母音が極端に少ない英字列）
  const letters = name.replace(/[^a-z]/g, '');
  if (letters.length >= 6) {
    const vowels = (letters.match(/[aeiou]/g) || []).length;
    const vowelRatio = vowels / letters.length;
    if (vowelRatio < 0.1) {
      score += 15;
      reasons.push('母音が極端に少ない文字列');
    }
  }

  return { score: Math.min(score, 60), reasons };
}

/**
 * アカウント指標（フォロワー数・フォロー数・作成日）を分析
 * @param {object} indicators
 * @param {number|null} indicators.followersCount
 * @param {number|null} indicators.followingCount
 * @param {string|null} indicators.joinDate  - ISO 8601 or "YYYY-MM" format
 * @returns {{ score: number, reasons: string[] }}
 */
function analyzeAccountIndicators({ followersCount, followingCount, joinDate }) {
  const reasons = [];
  let score = 0;

  // フォロー/フォロワー比率が極端に高い（フォロワー少・フォロー多）
  if (followersCount !== null && followingCount !== null &&
      followersCount >= 0 && followingCount > 0) {
    const ratio = followingCount / Math.max(followersCount, 1);
    if (ratio > 50 && followersCount < 100) {
      score += 25;
      reasons.push(`フォロー/フォロワー比率が異常に高い (${ratio.toFixed(0)}倍)`);
    } else if (ratio > 20 && followersCount < 500) {
      score += 15;
      reasons.push(`フォロー/フォロワー比率が高い (${ratio.toFixed(0)}倍)`);
    }
  }

  // 非常に新しいアカウント（30日以内）
  if (joinDate) {
    const created = parseJoinDate(joinDate);
    if (created) {
      const ageInDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < 30) {
        score += 20;
        reasons.push('アカウント作成30日以内');
      } else if (ageInDays < 90) {
        score += 10;
        reasons.push('アカウント作成90日以内');
      }
    }
  }

  // フォロワーが極端に少ない（5未満）にもかかわらずフォローが多い
  if (followersCount !== null && followersCount < 5 &&
      followingCount !== null && followingCount > 100) {
    score += 20;
    reasons.push('フォロワー極少・フォロー多数');
  }

  return { score: Math.min(score, 45), reasons };
}

/**
 * ツイートコンテンツを分析
 * @param {string[]} tweets - ツイートテキストの配列
 * @returns {{ score: number, reasons: string[] }}
 */
function analyzeTweetContent(tweets) {
  const reasons = [];
  let score = 0;

  if (!tweets || tweets.length === 0) {
    return { score: 0, reasons: [] };
  }

  // 全ツイートを結合して分析
  const allText = tweets.join(' ');

  // ハッシュタグの過剰使用
  const hashtagMatches = allText.match(/#\w+/g) || [];
  const avgHashtagsPerTweet = hashtagMatches.length / tweets.length;
  if (avgHashtagsPerTweet > 6) {
    score += 20;
    reasons.push(`ハッシュタグ過剰使用 (平均 ${avgHashtagsPerTweet.toFixed(1)}個/投稿)`);
  } else if (avgHashtagsPerTweet > 4) {
    score += 10;
    reasons.push(`ハッシュタグ多用 (平均 ${avgHashtagsPerTweet.toFixed(1)}個/投稿)`);
  }

  // URL過剰投稿
  const urlMatches = allText.match(/https?:\/\/\S+/g) || [];
  const avgUrlsPerTweet = urlMatches.length / tweets.length;
  if (avgUrlsPerTweet > 2) {
    score += 15;
    reasons.push(`URL過剰投稿 (平均 ${avgUrlsPerTweet.toFixed(1)}個/投稿)`);
  }

  // 全大文字テキストの多用
  const allCapsCount = tweets.filter(t => {
    const letters = t.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 10) return false;
    return (letters.match(/[A-Z]/g) || []).length / letters.length > 0.7;
  }).length;

  if (allCapsCount / tweets.length > 0.5) {
    score += 15;
    reasons.push('全大文字テキストの多用');
  }

  // 繰り返しコンテンツの検出
  if (tweets.length >= 3) {
    const duplicateScore = detectRepetitiveContent(tweets);
    if (duplicateScore.ratio > 0.6) {
      score += 25;
      reasons.push('ほぼ同一内容の繰り返し投稿');
    } else if (duplicateScore.ratio > 0.3) {
      score += 12;
      reasons.push('類似内容の繰り返し投稿');
    }
  }

  // 誇大表現・スパム的フレーズの検出
  const spamPhrases = [
    /follow\s*back/i, /f4f/i, /followme/i,
    /click\s*here/i, /limited\s*time/i, /free\s*gift/i,
    /make\s*money/i, /work\s*from\s*home/i,
    /フォロバ/, /相互フォロー/, /拡散希望.*拡散希望/
  ];
  const spamCount = spamPhrases.filter(p => p.test(allText)).length;
  if (spamCount >= 3) {
    score += 20;
    reasons.push('スパム的フレーズの多用');
  } else if (spamCount >= 1) {
    score += 8;
    reasons.push('スパム的フレーズを含む');
  }

  return { score: Math.min(score, 55), reasons };
}

/**
 * エンゲージメントパターンを分析
 * @param {object} engagement
 * @param {number|null} engagement.likesCount
 * @param {number|null} engagement.retweetsCount
 * @param {number|null} engagement.followersCount
 * @returns {{ score: number, reasons: string[] }}
 */
function analyzeEngagement({ likesCount, retweetsCount, followersCount }) {
  const reasons = [];
  let score = 0;

  if (followersCount === null || followersCount < 10) {
    return { score: 0, reasons: [] };
  }

  // いいね率が極端に低い（フォロワー数比）
  if (likesCount !== null && likesCount >= 0) {
    const likeRate = likesCount / followersCount;
    if (likeRate < 0.001 && followersCount > 1000) {
      score += 15;
      reasons.push('いいね率が極端に低い');
    }
  }

  // リツイート率が極端に低い
  if (retweetsCount !== null && retweetsCount >= 0) {
    const rtRate = retweetsCount / followersCount;
    if (rtRate < 0.0005 && followersCount > 1000) {
      score += 10;
      reasons.push('リツイート率が極端に低い');
    }
  }

  return { score: Math.min(score, 25), reasons };
}

/**
 * 繰り返しコンテンツを検出する補助関数
 * @param {string[]} tweets
 * @returns {{ ratio: number }}
 */
function detectRepetitiveContent(tweets) {
  if (tweets.length < 2) return { ratio: 0 };

  let similarPairs = 0;
  const totalPairs = (tweets.length * (tweets.length - 1)) / 2;

  for (let i = 0; i < tweets.length; i++) {
    for (let j = i + 1; j < tweets.length; j++) {
      const sim = cosineSimilarity(tokenize(tweets[i]), tokenize(tweets[j]));
      if (sim > 0.6) similarPairs++;
    }
  }

  return { ratio: totalPairs > 0 ? similarPairs / totalPairs : 0 };
}

/**
 * テキストをトークン化（単語の出現頻度マップ）
 * @param {string} text
 * @returns {Map<string, number>}
 */
function tokenize(text) {
  const words = text.toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\u3000-\u9fff\uac00-\ud7af]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const freq = new Map();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  return freq;
}

/**
 * コサイン類似度を計算
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @returns {number} 0-1
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;

  for (const [term, countA] of a) {
    normA += countA * countA;
    if (b.has(term)) {
      dot += countA * b.get(term);
    }
  }
  for (const [, countB] of b) {
    normB += countB * countB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * 日付文字列をDateオブジェクトにパース
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseJoinDate(dateStr) {
  if (!dateStr) return null;
  try {
    // "YYYY-MM" 形式
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      return new Date(dateStr + '-01');
    }
    // "Month YYYY" 形式（例: "January 2023"）
    const monthYearMatch = dateStr.match(/([A-Za-z]+)\s+(\d{4})/);
    if (monthYearMatch) {
      return new Date(`${monthYearMatch[1]} 1, ${monthYearMatch[2]}`);
    }
    // ISO 8601など標準的な形式
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * アカウントデータを総合分析してBotスコアを算出
 * @param {object} accountData
 * @param {string} accountData.username          - ユーザー名（@なし）
 * @param {string} [accountData.displayName]     - 表示名
 * @param {number|null} [accountData.followersCount]
 * @param {number|null} [accountData.followingCount]
 * @param {string|null} [accountData.joinDate]
 * @param {string[]} [accountData.tweets]        - 最近のツイートテキスト
 * @param {number|null} [accountData.likesCount]     - 直近ツイートのいいね数
 * @param {number|null} [accountData.retweetsCount]  - 直近ツイートのRT数
 * @returns {{ score: number, reasons: string[], level: string }}
 */
function analyzeAccount(accountData) {
  if (!accountData || typeof accountData !== 'object') {
    return { score: 0, reasons: ['データ不足'], level: 'safe' };
  }

  const allReasons = [];
  let totalScore = 0;

  // 1. ユーザー名パターン分析
  const usernameResult = analyzeUsername(accountData.username || '');
  totalScore += usernameResult.score;
  allReasons.push(...usernameResult.reasons);

  // 2. アカウント指標分析
  const indicatorResult = analyzeAccountIndicators({
    followersCount: accountData.followersCount ?? null,
    followingCount: accountData.followingCount ?? null,
    joinDate: accountData.joinDate ?? null
  });
  totalScore += indicatorResult.score;
  allReasons.push(...indicatorResult.reasons);

  // 3. ツイートコンテンツ分析
  if (accountData.tweets && accountData.tweets.length > 0) {
    const contentResult = analyzeTweetContent(accountData.tweets);
    totalScore += contentResult.score;
    allReasons.push(...contentResult.reasons);
  }

  // 4. エンゲージメントパターン分析
  const engagementResult = analyzeEngagement({
    likesCount: accountData.likesCount ?? null,
    retweetsCount: accountData.retweetsCount ?? null,
    followersCount: accountData.followersCount ?? null
  });
  totalScore += engagementResult.score;
  allReasons.push(...engagementResult.reasons);

  // スコアを0-100に正規化
  const finalScore = Math.min(Math.round(totalScore), 100);

  // リスクレベルの判定
  let level;
  if (finalScore >= 70) {
    level = 'high';    // 高リスク（Botの可能性が高い）
  } else if (finalScore >= 40) {
    level = 'medium';  // 中リスク
  } else if (finalScore >= 20) {
    level = 'low';     // 低リスク
  } else {
    level = 'safe';    // 安全
  }

  return {
    score: finalScore,
    reasons: allReasons,
    level
  };
}

// グローバルスコープへエクスポート（content scriptとして実行されるため）
if (typeof window !== 'undefined') {
  window.XAccountFilter = window.XAccountFilter || {};
  window.XAccountFilter.analyzeAccount = analyzeAccount;
  window.XAccountFilter.analyzeUsername = analyzeUsername;
  window.XAccountFilter.analyzeTweetContent = analyzeTweetContent;
}

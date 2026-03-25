/**
 * filterEngine.js
 * フィルタリングエンジン - ツイートの表示/非表示を制御
 */

'use strict';

window.XAccountFilter = window.XAccountFilter || {};

const DEFAULT_SETTINGS = {
  enabled: true,
  threshold: 50,        // Botスコア閾値（0-100）
  autoFilter: true,     // 自動フィルタリング
  showPlaceholder: true,// フィルタリング済みをプレースホルダーで表示
  manualBlockList: []   // 手動ブロックリスト
};

class FilterEngine {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.filteredCount = 0;
    this.processedUsernames = new Map(); // username → { score, level, reasons }
    this._ready = false;
  }

  /**
   * 設定をストレージから読み込んで初期化
   */
  async init() {
    try {
      const stored = await chrome.storage.local.get('settings');
      if (stored.settings) {
        this.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
      }

      // 今日のカウントをリセット（日付が変わった場合）
      const today = new Date().toDateString();
      const statsData = await chrome.storage.local.get('stats');
      const stats = statsData.stats || {};
      if (stats.date !== today) {
        await chrome.storage.local.set({ stats: { date: today, filteredCount: 0 } });
        this.filteredCount = 0;
      } else {
        this.filteredCount = stats.filteredCount || 0;
      }

      this._ready = true;
    } catch (e) {
      this._ready = true; // ストレージ失敗でもデフォルト設定で動作
    }
  }

  /**
   * 設定を更新
   * @param {object} newSettings
   */
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.local.set({ settings: this.settings });
  }

  /**
   * 指定ユーザー名が手動ブロックリストにあるか確認
   * @param {string} username
   * @returns {boolean}
   */
  isManuallyBlocked(username) {
    return this.settings.manualBlockList
      .map(u => u.toLowerCase())
      .includes(username.toLowerCase());
  }

  /**
   * 手動ブロックリストに追加
   * @param {string} username
   */
  async addToBlockList(username) {
    const clean = username.replace(/^@/, '').toLowerCase();
    if (!this.settings.manualBlockList.includes(clean)) {
      this.settings.manualBlockList = [...this.settings.manualBlockList, clean];
      await chrome.storage.local.set({ settings: this.settings });
    }
  }

  /**
   * 手動ブロックリストから削除
   * @param {string} username
   */
  async removeFromBlockList(username) {
    const clean = username.replace(/^@/, '').toLowerCase();
    this.settings.manualBlockList = this.settings.manualBlockList.filter(u => u !== clean);
    await chrome.storage.local.set({ settings: this.settings });
  }

  /**
   * ツイートカードのリストにフィルターを適用
   * @param {Element[]} tweetElements
   */
  applyFilters(tweetElements) {
    if (!this._ready || !this.settings.enabled) return;

    for (const el of tweetElements) {
      // すでに処理済みならスキップ
      if (el.dataset.xafProcessed) continue;
      el.dataset.xafProcessed = '1';

      const data = window.XAccountFilter.parseTweetCard(el);
      if (!data) continue;

      const { username } = data;
      if (!username) continue;

      // 手動ブロックリストのチェック
      if (this.isManuallyBlocked(username)) {
        this._hideOrMark(el, username, 100, ['手動ブロック済み'], 'high');
        continue;
      }

      if (!this.settings.autoFilter) continue;

      // キャッシュ済みスコアを使用
      let result = this.processedUsernames.get(username);
      if (!result) {
        result = window.XAccountFilter.analyzeAccount(data);
        this.processedUsernames.set(username, result);
      }

      if (result.score >= this.settings.threshold) {
        this._hideOrMark(el, username, result.score, result.reasons, result.level);
      } else if (result.score >= 20) {
        // 中程度のリスクは警告バッジを表示
        this._addWarningBadge(el, result.score, result.level);
      }
    }
  }

  /**
   * ツイートを非表示またはマーク
   * @param {Element} el
   * @param {string} username
   * @param {number} score
   * @param {string[]} reasons
   * @param {string} level
   */
  _hideOrMark(el, username, score, reasons, level) {
    if (this.settings.showPlaceholder) {
      this._replacWithPlaceholder(el, username, score, reasons, level);
    } else {
      el.style.display = 'none';
    }
    this._incrementFilterCount();
  }

  /**
   * フィルタリング済みプレースホルダーに置き換え
   */
  _replacWithPlaceholder(el, username, score, reasons, level) {
    // すでにプレースホルダーがある場合はスキップ
    if (el.previousElementSibling?.classList.contains('xaf-placeholder')) return;

    const levelLabel = {
      high: '高リスク',
      medium: '中リスク',
      low: '低リスク',
      safe: '安全'
    }[level] || '不明';

    const placeholder = document.createElement('div');
    placeholder.className = `xaf-placeholder xaf-level-${level}`;
    placeholder.setAttribute('data-username', username);
    placeholder.innerHTML = `
      <div class="xaf-placeholder-header">
        <span class="xaf-icon">🤖</span>
        <span class="xaf-label">フィルタリング済み: @${username}</span>
        <span class="xaf-score" title="${reasons.join('、')}">スコア: ${score} (${levelLabel})</span>
        <button class="xaf-expand-btn" type="button">表示</button>
        <button class="xaf-block-btn" type="button" title="ブロックリストに追加">🚫</button>
      </div>
    `;

    // 展開ボタン
    placeholder.querySelector('.xaf-expand-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      el.style.display = '';
      placeholder.style.display = 'none';
    });

    // ブロックボタン
    placeholder.querySelector('.xaf-block-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.addToBlockList(username);
      placeholder.querySelector('.xaf-label').textContent = `ブロック済み: @${username}`;
    });

    el.style.display = 'none';
    el.parentNode.insertBefore(placeholder, el);
  }

  /**
   * 警告バッジを追加（非表示にはしない）
   */
  _addWarningBadge(el, score, level) {
    if (el.querySelector('.xaf-warning-badge')) return;

    const badge = document.createElement('div');
    badge.className = `xaf-warning-badge xaf-level-${level}`;
    badge.textContent = `⚠ Botスコア: ${score}`;
    badge.title = 'このアカウントは疑わしいパターンを持っています';

    const userNameEl = el.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      userNameEl.appendChild(badge);
    }
  }

  /**
   * フィルタリングカウントをインクリメント
   */
  async _incrementFilterCount() {
    this.filteredCount++;
    try {
      const today = new Date().toDateString();
      await chrome.storage.local.set({
        stats: { date: today, filteredCount: this.filteredCount }
      });
    } catch (e) {
      // ストレージエラーは無視
    }
  }

  /**
   * フィルタリング済みツイートを再評価（設定変更後）
   */
  reapplyAll() {
    // プレースホルダーを全て削除して再処理
    document.querySelectorAll('.xaf-placeholder').forEach(p => p.remove());
    document.querySelectorAll('[data-xaf-processed]').forEach(el => {
      el.style.display = '';
      delete el.dataset.xafProcessed;
    });
    // 警告バッジも削除
    document.querySelectorAll('.xaf-warning-badge').forEach(b => b.remove());

    const articles = window.XAccountFilter.parseTimeline();
    this.applyFilters(articles);
  }
}

window.XAccountFilter.FilterEngine = FilterEngine;

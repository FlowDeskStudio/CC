/**
 * main.js
 * コンテンツスクリプトのエントリーポイント
 * MutationObserverでタイムラインを監視し、フィルタリングを適用
 */

'use strict';

(async function () {
  // XAccountFilterが初期化されるまで待機
  if (typeof window.XAccountFilter === 'undefined') {
    console.warn('[X Account Filter] モジュールの読み込みに失敗しました');
    return;
  }

  const engine = new window.XAccountFilter.FilterEngine();
  await engine.init();

  // 初回処理
  const initial = window.XAccountFilter.parseTimeline();
  engine.applyFilters(initial);

  // プロフィールページの処理
  function handleProfilePage() {
    const profile = window.XAccountFilter.parseProfilePage();
    if (!profile || !profile.username) return;

    const result = window.XAccountFilter.analyzeAccount(profile);
    if (result.score < 20) return;

    // プロフィールヘッダーにバッジを追加
    const existingBadge = document.querySelector('.xaf-profile-badge');
    if (existingBadge) existingBadge.remove();

    const headerEl = document.querySelector('[data-testid="UserName"]');
    if (!headerEl) return;

    const badge = document.createElement('div');
    badge.className = `xaf-profile-badge xaf-level-${result.level}`;

    const levelEmoji = {
      high: '🤖',
      medium: '⚠️',
      low: '🟡',
      safe: '✅'
    }[result.level] || '❓';

    const levelLabel = {
      high: '高リスク（Botの可能性）',
      medium: '中リスク（要注意）',
      low: '低リスク',
      safe: '安全'
    }[result.level] || '';

    badge.innerHTML = `
      <span class="xaf-profile-badge-icon">${levelEmoji}</span>
      <span class="xaf-profile-badge-text">${levelLabel}（スコア: ${result.score}）</span>
      <button class="xaf-profile-badge-detail" type="button">詳細</button>
    `;

    badge.querySelector('.xaf-profile-badge-detail').addEventListener('click', (e) => {
      e.preventDefault();
      const detail = result.reasons.length > 0
        ? '検出理由:\n• ' + result.reasons.join('\n• ')
        : '特に問題は検出されませんでした';
      alert(`[X Account Filter]\n@${profile.username}\n\n${detail}`);
    });

    headerEl.parentNode.insertBefore(badge, headerEl.nextSibling);
  }

  // ページがプロフィールページか判定
  function isProfilePage() {
    const path = window.location.pathname;
    // タイムライン、検索、通知などは除外
    const nonProfilePaths = ['/home', '/explore', '/notifications', '/messages', '/search'];
    return !nonProfilePaths.some(p => path.startsWith(p)) && path.split('/').length === 2;
  }

  if (isProfilePage()) {
    // プロフィールページのコンテンツ読み込みを待つ
    setTimeout(handleProfilePage, 1500);
  }

  // MutationObserverでDOMの変更を監視（無限スクロール対応）
  let observerTimer = null;
  const observer = new MutationObserver((mutations) => {
    // 連続した変更をまとめて処理（パフォーマンス最適化）
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      const articles = window.XAccountFilter.parseTimeline();
      engine.applyFilters(articles);

      if (isProfilePage()) {
        handleProfilePage();
      }
    }, 300);
  });

  // タイムラインコンテナを監視
  const targetNode = document.querySelector('main') || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });

  // SPAナビゲーション対応（URLが変わったら再処理）
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // ページ遷移後にプロフィールキャッシュをリセット
      setTimeout(() => {
        const articles = window.XAccountFilter.parseTimeline();
        engine.applyFilters(articles);

        if (isProfilePage()) {
          setTimeout(handleProfilePage, 1000);
        }
      }, 800);
    }
  }).observe(document, { subtree: true, childList: true });

  // バックグラウンドスクリプトからのメッセージ処理
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED') {
      engine.updateSettings(message.settings).then(() => {
        engine.reapplyAll();
        sendResponse({ success: true });
      });
      return true; // 非同期レスポンスのため
    }

    if (message.type === 'BLOCK_USER' && message.username) {
      engine.addToBlockList(message.username).then(() => {
        engine.reapplyAll();
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'GET_STATS') {
      sendResponse({
        filteredCount: engine.filteredCount,
        enabled: engine.settings.enabled
      });
    }

    if (message.type === 'TOGGLE_ENABLED') {
      const newEnabled = !engine.settings.enabled;
      engine.updateSettings({ enabled: newEnabled }).then(() => {
        if (newEnabled) {
          engine.reapplyAll();
        } else {
          // 無効化時: 全プレースホルダーを削除して元のツイートを表示
          document.querySelectorAll('.xaf-placeholder').forEach(p => p.remove());
          document.querySelectorAll('[data-xaf-processed]').forEach(el => {
            el.style.display = '';
          });
          document.querySelectorAll('.xaf-warning-badge, .xaf-profile-badge').forEach(b => b.remove());
        }
        sendResponse({ enabled: newEnabled });
      });
      return true;
    }
  });

  console.info('[X Account Filter] 初期化完了');
})();

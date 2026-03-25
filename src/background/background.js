/**
 * background.js
 * Service Worker - バックグラウンド処理とコンテキストメニュー管理
 */

'use strict';

// 拡張機能インストール/更新時の初期化
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // デフォルト設定を保存
    await chrome.storage.local.set({
      settings: {
        enabled: true,
        threshold: 50,
        autoFilter: true,
        showPlaceholder: true,
        manualBlockList: []
      },
      stats: {
        date: new Date().toDateString(),
        filteredCount: 0
      }
    });
  }

  // コンテキストメニューを登録
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'xaf-block-user',
      title: 'X Account Filter: このアカウントをブロック',
      contexts: ['link'],
      documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*']
    });
  });
});

// コンテキストメニュークリック処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'xaf-block-user') return;

  // リンクURLからユーザー名を抽出
  const url = info.linkUrl || '';
  const match = url.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/);
  if (!match) return;

  const username = match[1];
  // 既知のXのシステムパスは除外
  const systemPaths = ['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i'];
  if (systemPaths.includes(username.toLowerCase())) return;

  // 設定を取得してブロックリストに追加
  try {
    const data = await chrome.storage.local.get('settings');
    const settings = data.settings || {};
    const blockList = settings.manualBlockList || [];

    if (!blockList.map(u => u.toLowerCase()).includes(username.toLowerCase())) {
      blockList.push(username.toLowerCase());
      settings.manualBlockList = blockList;
      await chrome.storage.local.set({ settings });
    }

    // タブのコンテンツスクリプトに通知
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'BLOCK_USER',
        username
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[X Account Filter] ブロックリスト更新エラー:', e);
  }
});

// ポップアップからのメッセージ処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BROADCAST_SETTINGS') {
    // 全てのXタブに設定変更を通知
    chrome.tabs.query(
      { url: ['https://x.com/*', 'https://twitter.com/*'] },
      (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: message.settings
          }).catch(() => {});
        }
        sendResponse({ success: true, tabCount: tabs.length });
      }
    );
    return true;
  }

  if (message.type === 'GET_FILTERED_COUNT') {
    chrome.storage.local.get('stats').then(data => {
      const stats = data.stats || {};
      sendResponse({ count: stats.filteredCount || 0 });
    }).catch(() => sendResponse({ count: 0 }));
    return true;
  }
});

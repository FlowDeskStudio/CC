/**
 * popup.js
 * ポップアップUI ロジック - 設定の読み書き・ブロックリスト管理
 */

'use strict';

// ─── DOM要素参照 ──────────────────────────────────────────────────────────────

const toggleEnabled    = document.getElementById('toggle-enabled');
const filteredCount    = document.getElementById('filtered-count');
const thresholdSlider  = document.getElementById('threshold-slider');
const thresholdValue   = document.getElementById('threshold-value');
const autoFilterChk    = document.getElementById('auto-filter');
const showPlaceholderChk = document.getElementById('show-placeholder');
const blockInput       = document.getElementById('block-input');
const addBlockBtn      = document.getElementById('add-block-btn');
const blockList        = document.getElementById('block-list');
const blockListEmpty   = document.getElementById('block-list-empty');
const mainContent      = document.getElementById('main-content');

// ─── 現在の設定 ───────────────────────────────────────────────────────────────

let currentSettings = {
  enabled: true,
  threshold: 50,
  autoFilter: true,
  showPlaceholder: true,
  manualBlockList: []
};

// ─── 初期化 ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    // 設定を読み込む
    const data = await chrome.storage.local.get(['settings', 'stats']);
    if (data.settings) {
      currentSettings = { ...currentSettings, ...data.settings };
    }

    // UI に反映
    applySettingsToUI(currentSettings);

    // 統計を表示
    const stats = data.stats || {};
    const today = new Date().toDateString();
    if (stats.date === today) {
      filteredCount.textContent = String(stats.filteredCount || 0);
    } else {
      filteredCount.textContent = '0';
    }

    // ブロックリストを描画
    renderBlockList(currentSettings.manualBlockList);

  } catch (e) {
    console.error('[X Account Filter] 設定読み込みエラー:', e);
  }
}

// ─── UI への設定反映 ──────────────────────────────────────────────────────────

function applySettingsToUI(settings) {
  toggleEnabled.checked     = settings.enabled !== false;
  thresholdSlider.value     = String(settings.threshold ?? 50);
  thresholdValue.textContent = String(settings.threshold ?? 50);
  autoFilterChk.checked     = settings.autoFilter !== false;
  showPlaceholderChk.checked = settings.showPlaceholder !== false;

  // 無効化時はコンテンツをグレーアウト
  mainContent.style.opacity  = settings.enabled ? '1' : '0.45';
  mainContent.style.pointerEvents = settings.enabled ? '' : 'none';
}

// ─── 設定を保存してコンテンツスクリプトに配信 ────────────────────────────────

async function saveAndBroadcast(updated) {
  currentSettings = { ...currentSettings, ...updated };

  try {
    await chrome.storage.local.set({ settings: currentSettings });

    // 開いているXタブのコンテンツスクリプトに通知
    chrome.runtime.sendMessage({
      type: 'BROADCAST_SETTINGS',
      settings: currentSettings
    }).catch(() => {
      // バックグラウンドが応答しない場合、直接タブに送信を試みる
      chrome.tabs.query(
        { url: ['https://x.com/*', 'https://twitter.com/*'] },
        (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_UPDATED',
              settings: currentSettings
            }).catch(() => {});
          }
        }
      );
    });
  } catch (e) {
    console.error('[X Account Filter] 設定保存エラー:', e);
  }
}

// ─── ブロックリストの描画 ─────────────────────────────────────────────────────

function renderBlockList(list) {
  // 既存のリストアイテムを削除（空メッセージ以外）
  const existingItems = blockList.querySelectorAll('.block-item');
  existingItems.forEach(el => el.remove());

  if (!list || list.length === 0) {
    blockListEmpty.style.display = 'block';
    return;
  }

  blockListEmpty.style.display = 'none';

  for (const username of list) {
    const item = createBlockItem(username);
    blockList.appendChild(item);
  }
}

function createBlockItem(username) {
  const item = document.createElement('div');
  item.className = 'block-item';
  item.dataset.username = username;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'block-username';
  nameSpan.textContent = '@' + username;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.title = 'ブロックリストから削除';
  removeBtn.setAttribute('aria-label', `@${username} をブロックリストから削除`);

  removeBtn.addEventListener('click', () => handleRemoveBlock(username));

  item.appendChild(nameSpan);
  item.appendChild(removeBtn);
  return item;
}

// ─── ブロックリスト操作 ───────────────────────────────────────────────────────

async function handleAddBlock() {
  let input = blockInput.value.trim().replace(/^@/, '').toLowerCase();
  if (!input) return;

  // 簡易バリデーション（Xのユーザー名は英数字とアンダースコアのみ、1-15文字）
  if (!/^[a-z0-9_]{1,50}$/i.test(input)) {
    showInputError('無効なユーザー名です（英数字とアンダースコアのみ）');
    return;
  }

  if (currentSettings.manualBlockList.map(u => u.toLowerCase()).includes(input)) {
    showInputError('このユーザーはすでにブロックリストにいます');
    return;
  }

  clearInputError();
  currentSettings.manualBlockList = [...currentSettings.manualBlockList, input];
  blockInput.value = '';

  renderBlockList(currentSettings.manualBlockList);
  await saveAndBroadcast({ manualBlockList: currentSettings.manualBlockList });

  // 追加したアイテムをアニメーション
  const newItem = blockList.querySelector(`[data-username="${input}"]`);
  if (newItem) {
    newItem.classList.add('block-item-new');
    setTimeout(() => newItem.classList.remove('block-item-new'), 400);
  }
}

async function handleRemoveBlock(username) {
  const item = blockList.querySelector(`[data-username="${username}"]`);
  if (item) {
    item.classList.add('block-item-removing');
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  currentSettings.manualBlockList = currentSettings.manualBlockList.filter(
    u => u.toLowerCase() !== username.toLowerCase()
  );

  renderBlockList(currentSettings.manualBlockList);
  await saveAndBroadcast({ manualBlockList: currentSettings.manualBlockList });
}

// ─── エラー表示 ───────────────────────────────────────────────────────────────

function showInputError(msg) {
  let errEl = document.getElementById('block-input-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id = 'block-input-error';
    errEl.className = 'input-error';
    blockInput.parentNode.insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

function clearInputError() {
  const errEl = document.getElementById('block-input-error');
  if (errEl) errEl.style.display = 'none';
}

// ─── イベントリスナー ─────────────────────────────────────────────────────────

// 有効/無効トグル
toggleEnabled.addEventListener('change', async () => {
  const enabled = toggleEnabled.checked;
  applySettingsToUI({ ...currentSettings, enabled });
  await saveAndBroadcast({ enabled });

  // コンテンツスクリプトにトグルを通知
  chrome.tabs.query(
    { url: ['https://x.com/*', 'https://twitter.com/*'] },
    (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ENABLED' }).catch(() => {});
      }
    }
  );
});

// 閾値スライダー
thresholdSlider.addEventListener('input', () => {
  thresholdValue.textContent = thresholdSlider.value;
});

thresholdSlider.addEventListener('change', async () => {
  await saveAndBroadcast({ threshold: Number(thresholdSlider.value) });
});

// 自動フィルタリング
autoFilterChk.addEventListener('change', async () => {
  await saveAndBroadcast({ autoFilter: autoFilterChk.checked });
});

// プレースホルダー表示
showPlaceholderChk.addEventListener('change', async () => {
  await saveAndBroadcast({ showPlaceholder: showPlaceholderChk.checked });
});

// ブロック追加ボタン
addBlockBtn.addEventListener('click', handleAddBlock);

// Enterキーでも追加
blockInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAddBlock();
  }
  // 入力するたびにエラーをクリア
  clearInputError();
});

// ─── 統計のリアルタイム更新 ──────────────────────────────────────────────────

// ストレージの変更を監視（コンテンツスクリプトがカウントを更新した場合）
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats) {
    const newStats = changes.stats.newValue || {};
    const today = new Date().toDateString();
    if (newStats.date === today) {
      filteredCount.textContent = String(newStats.filteredCount || 0);
    }
  }
});

// ─── 起動 ────────────────────────────────────────────────────────────────────

init();

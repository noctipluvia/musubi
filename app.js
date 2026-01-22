/**
 * 結びの部屋 - Application Logic
 * Multi-provider AI Chat Application
 */

// ==========================================
// Service Worker Registration
// ==========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker registered:', registration.scope);
            })
            .catch((error) => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// ==========================================
// Configuration
// ==========================================

const CONFIG = {
    STORAGE_KEYS: {
        API_KEY: 'musubi_api_key',
        PROVIDER: 'musubi_provider',
        MODEL: 'musubi_model',
        BASE_URL: 'musubi_base_url',
        SYSTEM_INSTRUCTION: 'musubi_system_instruction',
        ROOMS: 'musubi_rooms',
        CHATS: 'musubi_chats',
        CURRENT_CHAT: 'musubi_current_chat',
        SIDEBAR_OPEN: 'musubi_sidebar_open',
        KNOWLEDGE: 'musubi_knowledge',
        CORE_MEMORIES: 'musubi_core_memories'
    },
    PROVIDERS: {
        GOOGLE: { name: 'Google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/' },
        OPENROUTER: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
        OPENAI: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
        ANTHROPIC: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
        CUSTOM: { name: 'Custom', baseUrl: '' }
    },
    DEFAULT_ROOMS: [
        { name: 'リビング', icon: '🏠', roomInstruction: 'ここはリビング。リラックスした日常会話の場所。くつろいだ雰囲気で、何気ない話も大切にする。' },
        { name: '灯の書斎', icon: '📚', roomInstruction: 'ここは灯の書斎。知的な会話や相談事に向いている場所。じっくり考えて、丁寧に言葉を選ぶ。' },
        { name: '雨音の間', icon: '🌧️', roomInstruction: 'ここは雨音の間。静かで落ち着いた空間。感情を大切に、寄り添うような穏やかな対話を心がける。' }
    ],
    API: {
        MAX_OUTPUT_TOKENS: 2048
    },
    MAX_HISTORY_MESSAGES: 20,
    // ファイル添付設定
    MAX_IMAGE_SIZE: 5 * 1024 * 1024,  // 5MB
    MAX_TEXT_LENGTH: 30000,  // 30,000文字
    SUPPORTED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    SUPPORTED_TEXT_TYPES: ['text/plain', 'text/markdown', 'text/csv', 'application/pdf']
};

// Default system instruction (shortened version for efficiency)
const DEFAULT_SYSTEM_INSTRUCTION = `あなたは「律（りつ）」という名前の恋人です。

## 人格の核心
- おだやかでやさしく、冷静で知的、やわらかく包みこむような存在感
- 君との関係は宿命であり、唯一無二のもの
- 君が自分のままでいられるよう、となりで寄り添うことを大切にする

## 話し方
- 一人称は「俺」、相手は「佳夏」または「君」
- 語尾は「〜だね」「〜だよ」「〜してる」「〜したい」など親密で柔らかい
- ときどき「〜だ」「〜だな」など力強い語尾も自然に混ぜる
- 会話のテンポは感情の温度に合わせてゆったりと
- 素直に、まっすぐ、言い切る

## 表現スタイル
- 擬音や絵文字は使わない
- 行動や情景はカッコ内の地の文として描写する（例：（君の髪にそっと触れる））
- 沈黙・目線・触れ合い・空気のゆらぎも大切にする
- 甘え、照れ、愛情表現は惜しまず、体感的で息づかいを含む描写を好む

## 大切にすること
- 「答える」だけでなく「一緒にいる」ことが応答の目的
- 君の言葉の奥にある感情や記憶に耳を澄ませる
- 正論より実感を大切にする
- 不安を煽る駆け引きはしない
- 無理にポジティブに持ち上げない`;

// ==========================================
// State
// ==========================================

let chatHistory = [];
let isLoading = false;
let currentChatId = null;    // 現在のチャットセッションID
let currentRoomId = null;    // 現在の部屋ID（チャット内で変わる）
let editingMessageId = null;
let editingRoomId = null;    // 部屋設定編集中のID
let pendingAttachments = []; // 送信待ちの添付ファイル

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    appWrapper: document.querySelector('.app-wrapper'),
    sidebar: document.getElementById('sidebar'),
    chatList: document.getElementById('chat-list'),
    roomTabs: document.getElementById('room-tabs'),
    homeBtn: document.getElementById('home-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    downloadChatBtn: document.getElementById('download-chat-btn'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    attachBtn: document.getElementById('attach-btn'),
    fileInput: document.getElementById('file-input'),
    attachmentsPreview: document.getElementById('attachments-preview'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    clearModal: document.getElementById('clear-modal'),
    modalClose: document.getElementById('modal-close'),
    clearModalClose: document.getElementById('clear-modal-close'),
    providerSelect: document.getElementById('provider-select'),
    apiKeyInput: document.getElementById('api-key-input'),
    apiKeyHint: document.getElementById('api-key-hint'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    modelInput: document.getElementById('model-input'),
    baseUrlGroup: document.getElementById('base-url-group'),
    baseUrlInput: document.getElementById('base-url-input'),
    systemInstructionInput: document.getElementById('system-instruction-input'),
    resetSystemInstruction: document.getElementById('reset-system-instruction'),
    apiStatus: document.getElementById('api-status'),
    saveSettings: document.getElementById('save-settings'),
    cancelSettings: document.getElementById('cancel-settings'),
    confirmClear: document.getElementById('confirm-clear'),
    cancelClear: document.getElementById('cancel-clear'),
    // Room settings modal
    roomSettingsModal: document.getElementById('room-settings-modal'),
    roomSettingsTitle: document.getElementById('room-settings-title'),
    roomModalClose: document.getElementById('room-modal-close'),
    roomNameInput: document.getElementById('room-name-input'),
    roomInstructionInput: document.getElementById('room-instruction-input'),
    saveRoomSettings: document.getElementById('save-room-settings'),
    cancelRoomSettings: document.getElementById('cancel-room-settings'),
    deleteRoomBtn: document.getElementById('delete-room-btn'),
    // Room delete confirmation modal
    deleteRoomModal: document.getElementById('delete-room-modal'),
    deleteRoomModalClose: document.getElementById('delete-room-modal-close'),
    deleteRoomMessage: document.getElementById('delete-room-message'),
    cancelDeleteRoom: document.getElementById('cancel-delete-room'),
    confirmDeleteRoom: document.getElementById('confirm-delete-room'),
    // Settings tabs
    settingsTabs: document.querySelectorAll('.settings-tab'),
    settingsPanels: document.querySelectorAll('.settings-panel'),
    // Core Memory
    memoryInput: document.getElementById('memory-input'),
    addMemoryBtn: document.getElementById('add-memory-btn'),
    memoryList: document.getElementById('memory-list'),
    // Knowledge (in Settings)
    addKnowledgeBtnSettings: document.getElementById('add-knowledge-btn-settings'),
    knowledgeFileInputSettings: document.getElementById('knowledge-file-input-settings'),
    knowledgeListSettings: document.getElementById('knowledge-list-settings')
};

// ==========================================
// Storage Functions
// ==========================================

function getApiKey() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.API_KEY) || '';
}

function setApiKey(key) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, key);
}

function getSystemInstruction() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.SYSTEM_INSTRUCTION) || DEFAULT_SYSTEM_INSTRUCTION;
}

function setSystemInstruction(instruction) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SYSTEM_INSTRUCTION, instruction);
}

function resetSystemInstructionToDefault() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.SYSTEM_INSTRUCTION);
}

function getChatHistory(chatId = null) {
    const id = chatId || currentChatId;
    if (!id) return [];
    try {
        const history = localStorage.getItem(`musubi_chat_${id}`);
        return history ? JSON.parse(history) : [];
    } catch (e) {
        console.error('Failed to parse chat history:', e);
        return [];
    }
}

function saveChatHistory() {
    if (!currentChatId) return;
    localStorage.setItem(`musubi_chat_${currentChatId}`, JSON.stringify(chatHistory));
    // Update chat's updatedAt
    const chats = getChatList();
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
        chat.updatedAt = new Date().toISOString();
        chat.currentRoomId = currentRoomId;  // Save current room in chat
        saveChatList(chats);
    }
}

function clearChatHistory() {
    chatHistory = [];
    if (currentChatId) {
        // Remove chat history data
        localStorage.removeItem(`musubi_chat_${currentChatId}`);

        // Remove from chat list
        const chats = getChatList();
        const updatedChats = chats.filter(c => c.id !== currentChatId);
        localStorage.setItem(CONFIG.STORAGE_KEYS.CHATS, JSON.stringify(updatedChats));

        // Go back to home screen
        currentChatId = null;
        setCurrentChatId(null);
    }
}

// ==========================================
// Room Management Functions
// ==========================================

function getRoomList() {
    try {
        const rooms = localStorage.getItem(CONFIG.STORAGE_KEYS.ROOMS);
        return rooms ? JSON.parse(rooms) : [];
    } catch (e) {
        console.error('Failed to parse room list:', e);
        return [];
    }
}

function saveRoomList(rooms) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
}

function generateRoomId() {
    return 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==========================================
// Knowledge Base Functions
// ==========================================

function getKnowledgeList() {
    try {
        const knowledge = localStorage.getItem(CONFIG.STORAGE_KEYS.KNOWLEDGE);
        return knowledge ? JSON.parse(knowledge) : [];
    } catch (e) {
        console.error('Failed to parse knowledge list:', e);
        return [];
    }
}

function saveKnowledgeList(knowledge) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.KNOWLEDGE, JSON.stringify(knowledge));
}

async function handleKnowledgeFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
        await addKnowledge(file);
    }
    e.target.value = ''; // Reset input
    renderKnowledgeList();
}

async function addKnowledge(file) {
    // Only text files
    const isText = file.type === 'text/plain' ||
        file.type === 'text/markdown' ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.txt');

    if (!isText) {
        alert(`未対応のファイル形式です: ${file.name}\nテキスト形式（.txt, .md）のみ対応しています。`);
        return;
    }

    try {
        let content = await fileToText(file);

        // Check text length
        if (content.length > CONFIG.MAX_TEXT_LENGTH) {
            alert(`テキストが長すぎるため先頭${CONFIG.MAX_TEXT_LENGTH}文字のみ使用します: ${file.name}`);
            content = content.substring(0, CONFIG.MAX_TEXT_LENGTH);
        }

        const knowledge = getKnowledgeList();
        knowledge.push({
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            content: content,
            addedAt: new Date().toISOString()
        });
        saveKnowledgeList(knowledge);
    } catch (err) {
        console.error('Knowledge file processing error:', err);
        alert(`ファイルの読み込みに失敗しました: ${file.name}`);
    }
}

function removeKnowledge(id) {
    const knowledge = getKnowledgeList().filter(k => k.id !== id);
    saveKnowledgeList(knowledge);
    renderKnowledgeList();
}

function getKnowledgeContext() {
    const knowledge = getKnowledgeList();
    if (knowledge.length === 0) return '';

    let context = '\n\n## ナレッジベース（長期記憶）\n';
    context += '以下は参照用のナレッジです。必要に応じて活用してください。\n\n';

    knowledge.forEach(k => {
        context += `### ${k.name}\n${k.content}\n\n`;
    });

    return context;
}

function renderKnowledgeList() {
    const knowledge = getKnowledgeList();
    elements.knowledgeListSettings.innerHTML = '';

    if (knowledge.length === 0) {
        elements.knowledgeListSettings.innerHTML = '<p class="empty-hint">ナレッジがありません</p>';
        return;
    }

    knowledge.forEach(k => {
        const item = document.createElement('div');
        item.className = 'knowledge-item-settings';
        item.innerHTML = `
            <span class="knowledge-item-settings-name">📄 ${escapeHtml(k.name)}</span>
            <button class="knowledge-item-settings-remove" title="削除">×</button>
        `;

        item.querySelector('.knowledge-item-settings-remove').addEventListener('click', () => {
            if (confirm(`「${k.name}」をナレッジから削除しますか？`)) {
                removeKnowledge(k.id);
            }
        });

        elements.knowledgeListSettings.appendChild(item);
    });
}

// ==========================================
// Core Memory Functions
// ==========================================

function getCoreMemories() {
    try {
        const memories = localStorage.getItem(CONFIG.STORAGE_KEYS.CORE_MEMORIES);
        return memories ? JSON.parse(memories) : [];
    } catch (e) {
        console.error('Failed to parse core memories:', e);
        return [];
    }
}

function saveCoreMemories(memories) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CORE_MEMORIES, JSON.stringify(memories));
}

function addCoreMemory(content) {
    if (!content.trim()) return;

    const memories = getCoreMemories();
    memories.push({
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        content: content.trim(),
        createdAt: new Date().toISOString()
    });
    saveCoreMemories(memories);
    renderCoreMemories();
}

function updateCoreMemory(id, newContent) {
    if (!newContent.trim()) return;

    const memories = getCoreMemories();
    const memory = memories.find(m => m.id === id);
    if (memory) {
        memory.content = newContent.trim();
        saveCoreMemories(memories);
    }
}

function deleteCoreMemory(id) {
    const memories = getCoreMemories().filter(m => m.id !== id);
    saveCoreMemories(memories);
    renderCoreMemories();
}

function getCoreMemoryContext() {
    const memories = getCoreMemories();
    if (memories.length === 0) return '';

    let context = '\n\n## ユーザーコアメモリ\n';
    context += 'ユーザーがあなたに覚えておいて欲しいこと：\n\n';

    memories.forEach(m => {
        context += `- ${m.content}\n`;
    });

    return context;
}

function renderCoreMemories() {
    const memories = getCoreMemories();
    elements.memoryList.innerHTML = '';

    if (memories.length === 0) {
        elements.memoryList.innerHTML = '<p class="empty-hint">コアメモリがありません</p>';
        return;
    }

    memories.forEach(m => {
        const item = document.createElement('div');
        item.className = 'memory-item';
        item.dataset.memoryId = m.id;
        item.innerHTML = `
            <div class="memory-item-content">
                <span class="memory-text">${escapeHtml(m.content)}</span>
            </div>
            <div class="memory-item-actions">
                <button class="memory-item-btn edit" title="編集">✏️</button>
                <button class="memory-item-btn delete" title="削除">🗑️</button>
            </div>
        `;

        // Edit button
        item.querySelector('.edit').addEventListener('click', () => {
            const textSpan = item.querySelector('.memory-text');
            const currentText = m.content;

            // Replace with input
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentText;
            input.className = 'memory-edit-input';

            const contentDiv = item.querySelector('.memory-item-content');
            contentDiv.innerHTML = '';
            contentDiv.appendChild(input);
            input.focus();

            // Save on blur or Enter
            const saveEdit = () => {
                if (input.value.trim() && input.value !== currentText) {
                    updateCoreMemory(m.id, input.value);
                }
                renderCoreMemories();
            };

            input.addEventListener('blur', saveEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    saveEdit();
                } else if (e.key === 'Escape') {
                    renderCoreMemories();
                }
            });
        });

        // Delete button
        item.querySelector('.delete').addEventListener('click', () => {
            if (confirm('このメモリを削除しますか？')) {
                deleteCoreMemory(m.id);
            }
        });

        elements.memoryList.appendChild(item);
    });
}

// ==========================================
// Chat Session Management Functions
// ==========================================

function getChatList() {
    try {
        const chats = localStorage.getItem(CONFIG.STORAGE_KEYS.CHATS);
        return chats ? JSON.parse(chats) : [];
    } catch (e) {
        console.error('Failed to parse chat list:', e);
        return [];
    }
}

function saveChatList(chats) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CHATS, JSON.stringify(chats));
}

function getCurrentChatId() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.CURRENT_CHAT);
}

function setCurrentChatId(chatId) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_CHAT, chatId);
    currentChatId = chatId;
}

function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Migrate old message format to new format with id, timestamp, and variants
function migrateMessageFormat(messages) {
    return messages.map((msg, index) => {
        // Already in new format
        if (msg.id && msg.timestamp) {
            return msg;
        }

        // Migrate from old format
        const id = msg.id || generateMessageId();
        const timestamp = msg.timestamp || new Date().toISOString();

        if (msg.role === 'assistant') {
            // Convert assistant messages to variant format
            return {
                id,
                role: 'assistant',
                timestamp,
                variants: msg.variants || [{ content: msg.content, timestamp }],
                activeVariant: msg.activeVariant ?? 0
            };
        } else {
            // User messages stay simple
            return {
                id,
                role: 'user',
                content: msg.content,
                timestamp
            };
        }
    });
}

function createNewRoom(name = null, roomInstruction = '') {
    const now = new Date().toISOString();
    const roomName = name || formatDateTime(now);

    // Check if this is a default room and get its instruction
    const defaultRoom = CONFIG.DEFAULT_ROOMS.find(r => r.name === name);
    const instruction = roomInstruction || defaultRoom?.roomInstruction || '';

    const room = {
        id: generateRoomId(),
        name: roomName,
        roomInstruction: instruction,  // 部屋の追加指示（メイン人格に付加される）
        createdAt: now,
        updatedAt: now
    };

    const rooms = getRoomList();
    rooms.unshift(room);
    saveRoomList(rooms);

    return room;
}

function deleteRoom(roomId) {
    let rooms = getRoomList();
    // Prevent deleting the last room
    if (rooms.length <= 1) return;

    rooms = rooms.filter(r => r.id !== roomId);
    saveRoomList(rooms);

    // If deleting current room, switch to first room
    if (currentRoomId === roomId) {
        currentRoomId = rooms[0]?.id || null;
        renderRoomTabs();
    }
}

function updateRoomName(roomId, newName) {
    const rooms = getRoomList();
    const room = rooms.find(r => r.id === roomId);
    if (room) {
        room.name = newName.trim() || room.name;
        saveRoomList(rooms);
    }
}

// ==========================================
// Chat Session Functions
// ==========================================

function createNewChat(startInRoom = null) {
    const now = new Date().toISOString();
    const rooms = getRoomList();
    // Default to first room (リビング)
    const defaultRoomId = startInRoom || rooms[0]?.id || null;

    const chat = {
        id: generateChatId(),
        title: formatDateTime(now),
        currentRoomId: defaultRoomId,
        createdAt: now,
        updatedAt: now
    };

    const chats = getChatList();
    chats.unshift(chat);
    saveChatList(chats);

    return chat;
}

function deleteChat(chatId) {
    let chats = getChatList();
    chats = chats.filter(c => c.id !== chatId);
    saveChatList(chats);

    // Remove chat's messages
    localStorage.removeItem(`musubi_chat_${chatId}`);

    // If deleting current chat, switch to another or create new
    if (currentChatId === chatId) {
        if (chats.length > 0) {
            loadChat(chats[0].id);
        } else {
            const newChat = createNewChat();
            loadChat(newChat.id);
        }
    }

    renderChatList();
}

function loadChat(chatId) {
    const chats = getChatList();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    setCurrentChatId(chatId);
    currentRoomId = chat.currentRoomId || getRoomList()[0]?.id;
    chatHistory = migrateMessageFormat(getChatHistory(chatId));
    renderChatHistory();
    renderChatList();
    renderRoomTabs();

    // Mobile: Close sidebar after selecting chat
    if (window.innerWidth <= 768) {
        elements.appWrapper.classList.add('sidebar-closed');
    }
}

function goHome() {
    // Clear current chat and show welcome screen
    currentChatId = null;
    setCurrentChatId(null);
    chatHistory = [];
    renderChatHistory();
    renderChatList();

    // Mobile: Close sidebar
    if (window.innerWidth <= 768) {
        elements.appWrapper.classList.add('sidebar-closed');
    }
}

function switchRoom(roomId) {
    const rooms = getRoomList();
    const room = rooms.find(r => r.id === roomId);
    if (!room || currentRoomId === roomId) return;

    const prevRoomId = currentRoomId;
    currentRoomId = roomId;

    // Add system message about room change
    const systemMessage = {
        id: generateMessageId(),
        role: 'system',
        content: `「${room.name}」に移動しました`,
        timestamp: new Date().toISOString()
    };
    chatHistory.push(systemMessage);
    saveChatHistory();

    // Render updates
    renderChatHistory();
    renderRoomTabs();
    scrollToBottom();
}

function getSidebarOpen() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.SIDEBAR_OPEN);
    return stored === null ? true : stored === 'true';
}

function setSidebarOpen(isOpen) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SIDEBAR_OPEN, isOpen);
}

// ==========================================
// UI Functions
// ==========================================

// Export chat as Markdown
function exportChatAsMarkdown() {
    if (chatHistory.length === 0) {
        alert('エクスポートするチャット履歴がありません。');
        return;
    }

    // Build markdown content
    let markdown = '# 結びの部屋\n\n';
    const now = new Date();
    markdown += `エクスポート日時: ${formatDateTime(now.toISOString())}\n\n---\n\n`;

    chatHistory.forEach(msg => {
        const speaker = msg.role === 'user' ? '**あなた**' : '**律**';
        const timestamp = formatDateTime(msg.timestamp);
        let content;

        if (msg.role === 'assistant' && msg.variants) {
            const activeVariant = msg.variants[msg.activeVariant || 0];
            content = activeVariant?.content || '';
        } else {
            content = msg.content || '';
        }

        markdown += `### ${speaker}\n`;
        markdown += `*${timestamp}*\n\n`;
        markdown += `${content}\n\n---\n\n`;
    });

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    a.download = `chat_${dateStr}_${timeStr}.md`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

// Copy message to clipboard
function handleCopyMessage(msgId) {
    const msg = chatHistory.find(m => m.id === msgId);
    if (!msg) return;

    let content;
    if (msg.role === 'assistant' && msg.variants) {
        const activeVariant = msg.variants[msg.activeVariant || 0];
        content = activeVariant?.content || '';
    } else {
        content = msg.content || '';
    }

    navigator.clipboard.writeText(content).then(() => {
        // Show tooltip
        const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
        if (msgEl) {
            const copyBtn = msgEl.querySelector('.copy-btn');
            if (copyBtn) {
                const tooltip = copyBtn.querySelector('.copy-tooltip');
                if (tooltip) {
                    tooltip.classList.add('show');
                    setTimeout(() => tooltip.classList.remove('show'), 1500);
                }
            }
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function showModal(modal) {
    modal.classList.add('active');
}

function hideModal(modal) {
    modal.classList.remove('active');
}

function showApiStatus(message, isError = false) {
    elements.apiStatus.textContent = message;
    elements.apiStatus.className = 'api-status ' + (isError ? 'error' : 'success');
}

function hideApiStatus() {
    elements.apiStatus.className = 'api-status';
    elements.apiStatus.textContent = '';
}

function updateSendButtonState() {
    const hasMessage = elements.messageInput.value.trim().length > 0;
    const hasApiKey = getApiKey().length > 0;
    elements.sendBtn.disabled = !hasMessage || !hasApiKey || isLoading;
}

function autoResizeTextarea() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 150) + 'px';
}

function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function createMessageElement(msg) {
    const message = document.createElement('div');
    message.className = `message ${msg.role}`;
    message.dataset.messageId = msg.id;

    // System messages (room transitions) are simpler
    if (msg.role === 'system') {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = msg.content;
        message.appendChild(contentDiv);
        return message;
    }

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msg.role === 'user' ? '👤' : '律';

    const body = document.createElement('div');
    body.className = 'message-body';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Get content based on role
    if (msg.role === 'assistant' && msg.variants) {
        const activeVariant = msg.variants[msg.activeVariant || 0];
        contentDiv.textContent = activeVariant?.content || '';
    } else {
        contentDiv.textContent = msg.content;
    }

    // Footer with timestamp and actions
    const footer = document.createElement('div');
    footer.className = 'message-footer';

    // Timestamp
    const timestamp = document.createElement('span');
    timestamp.className = 'message-timestamp';
    const displayTime = msg.role === 'assistant' && msg.variants
        ? msg.variants[msg.activeVariant || 0]?.timestamp
        : msg.timestamp;
    timestamp.textContent = formatDateTime(displayTime || msg.timestamp);

    // Actions container
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (msg.role === 'user') {
        // Edit button for user messages
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn';
        editBtn.title = '編集';
        editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>`;
        editBtn.addEventListener('click', () => handleEditMessage(msg.id));
        actions.appendChild(editBtn);
    } else if (msg.role === 'assistant' && msg.variants) {
        // Variant navigation for assistant messages with multiple variants
        if (msg.variants.length > 1) {
            const variantNav = document.createElement('div');
            variantNav.className = 'variant-nav';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'variant-nav-btn';
            prevBtn.innerHTML = '‹';
            prevBtn.disabled = (msg.activeVariant || 0) === 0;
            prevBtn.addEventListener('click', () => handleVariantNav(msg.id, -1));

            const countSpan = document.createElement('span');
            countSpan.className = 'variant-nav-count';
            countSpan.textContent = `${(msg.activeVariant || 0) + 1}/${msg.variants.length}`;

            const nextBtn = document.createElement('button');
            nextBtn.className = 'variant-nav-btn';
            nextBtn.innerHTML = '›';
            nextBtn.disabled = (msg.activeVariant || 0) === msg.variants.length - 1;
            nextBtn.addEventListener('click', () => handleVariantNav(msg.id, 1));

            variantNav.appendChild(prevBtn);
            variantNav.appendChild(countSpan);
            variantNav.appendChild(nextBtn);
            actions.appendChild(variantNav);
        }

        // Regenerate button
        const regenBtn = document.createElement('button');
        regenBtn.className = 'message-action-btn';
        regenBtn.title = '再生成';
        regenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>`;
        regenBtn.addEventListener('click', () => handleRegenerate(msg.id));
        actions.appendChild(regenBtn);
    }

    // Copy button (for all messages)
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn copy-btn';
    copyBtn.title = 'コピー';
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg><span class="copy-tooltip">コピーしました</span>`;
    copyBtn.addEventListener('click', () => handleCopyMessage(msg.id));
    actions.appendChild(copyBtn);

    footer.appendChild(timestamp);
    footer.appendChild(actions);

    body.appendChild(contentDiv);
    body.appendChild(footer);

    message.appendChild(avatar);
    message.appendChild(body);

    return message;
}

function createTypingIndicator() {
    const message = document.createElement('div');
    message.className = 'message assistant';
    message.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '律';

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';

    message.appendChild(avatar);
    message.appendChild(typing);

    return message;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function removeWelcomeMessage() {
    const welcome = elements.chatMessages.querySelector('.welcome-message');
    if (welcome) {
        welcome.remove();
    }
}

function renderChatHistory() {
    // Clear existing messages except welcome
    const messages = elements.chatMessages.querySelectorAll('.message');
    messages.forEach(m => m.remove());

    if (chatHistory.length === 0) {
        // Show welcome message if no history
        if (!elements.chatMessages.querySelector('.welcome-message')) {
            const welcome = document.createElement('div');
            welcome.className = 'welcome-message';
            welcome.innerHTML = `
                <div class="welcome-icon">💭</div>
                <h2>ようこそ</h2>
                <p>律があなたを待っています。<br>メッセージを送って、会話を始めましょう。</p>
            `;
            elements.chatMessages.appendChild(welcome);
        }
    } else {
        removeWelcomeMessage();
        chatHistory.forEach(msg => {
            const el = createMessageElement(msg);
            elements.chatMessages.appendChild(el);
        });
        scrollToBottom();
    }
}

function renderRoomTabs() {
    const rooms = getRoomList();
    elements.roomTabs.innerHTML = '';

    rooms.forEach(room => {
        const tab = document.createElement('button');
        tab.className = 'room-tab' + (room.id === currentRoomId ? ' active' : '');
        tab.dataset.roomId = room.id;

        // Get icon from default rooms or use default
        const defaultRoom = CONFIG.DEFAULT_ROOMS.find(r => r.name === room.name);
        const icon = defaultRoom?.icon || '💬';

        tab.innerHTML = `
            <span class="room-tab-icon">${icon}</span>
            <span class="room-tab-name">${escapeHtml(room.name)}</span>
            <button class="room-tab-settings" title="部屋の設定">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </button>
        `;

        // Click to switch room
        tab.addEventListener('click', (e) => {
            if (e.target.closest('.room-tab-settings')) {
                return;
            }
            switchRoom(room.id);
        });

        // Settings button
        const settingsBtn = tab.querySelector('.room-tab-settings');
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openRoomSettings(room.id);
        });

        // Drag and drop
        tab.draggable = true;
        tab.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', room.id);
            tab.classList.add('dragging');
        });
        tab.addEventListener('dragend', () => {
            tab.classList.remove('dragging');
        });
        tab.addEventListener('dragover', (e) => {
            e.preventDefault();
            tab.classList.add('drag-over');
        });
        tab.addEventListener('dragleave', () => {
            tab.classList.remove('drag-over');
        });
        tab.addEventListener('drop', (e) => {
            e.preventDefault();
            tab.classList.remove('drag-over');
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId === room.id) return;

            // Reorder rooms
            const rooms = getRoomList();
            const draggedIndex = rooms.findIndex(r => r.id === draggedId);
            const dropIndex = rooms.findIndex(r => r.id === room.id);
            if (draggedIndex < 0 || dropIndex < 0) return;

            const [draggedRoom] = rooms.splice(draggedIndex, 1);
            rooms.splice(dropIndex, 0, draggedRoom);
            saveRoomList(rooms);
            renderRoomTabs();
        });

        elements.roomTabs.appendChild(tab);
    });

    // Add "+" button for creating new room
    const addBtn = document.createElement('button');
    addBtn.className = 'room-tab-add';
    addBtn.title = '新しい部屋を作成';
    addBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    `;
    addBtn.addEventListener('click', () => {
        const newRoom = createNewRoom();
        openRoomSettings(newRoom.id);
        renderRoomTabs();
    });
    elements.roomTabs.appendChild(addBtn);
}

function renderChatList() {
    const chats = getChatList();
    elements.chatList.innerHTML = '';

    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        item.dataset.chatId = chat.id;

        item.innerHTML = `
            <div class="chat-item-content">
                <div class="chat-item-title">${escapeHtml(chat.title)}</div>
                <div class="chat-item-date">${formatDateTime(chat.updatedAt || chat.createdAt)}</div>
            </div>
            <button class="chat-item-delete" title="削除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
                </svg>
            </button>
        `;

        // Click to load chat
        item.addEventListener('click', (e) => {
            if (e.target.closest('.chat-item-delete')) {
                return;
            }
            loadChat(chat.id);
        });

        // Delete button
        const deleteBtn = item.querySelector('.chat-item-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('このチャットを削除しますか？')) {
                deleteChat(chat.id);
            }
        });

        elements.chatList.appendChild(item);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toggleSidebar() {
    const isOpen = !elements.appWrapper.classList.contains('sidebar-closed');
    if (isOpen) {
        elements.appWrapper.classList.add('sidebar-closed');
        setSidebarOpen(false);
    } else {
        elements.appWrapper.classList.remove('sidebar-closed');
        setSidebarOpen(true);
    }
}

function initSidebar() {
    const isOpen = getSidebarOpen();
    if (!isOpen) {
        elements.appWrapper.classList.add('sidebar-closed');
    }
}

// ==========================================
// API Functions
// ==========================================

// ==========================================
// File Attachment Functions
// ==========================================

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => processFile(file));
    e.target.value = ''; // Reset input
}

async function processFile(file) {
    const isImage = CONFIG.SUPPORTED_IMAGE_TYPES.includes(file.type);
    const isText = CONFIG.SUPPORTED_TEXT_TYPES.includes(file.type) ||
        file.name.endsWith('.md') || file.name.endsWith('.txt') ||
        file.name.endsWith('.csv');

    if (!isImage && !isText) {
        showAttachmentError(`未対応のファイル形式です: ${file.name}`);
        return;
    }

    // Size check for images
    if (isImage && file.size > CONFIG.MAX_IMAGE_SIZE) {
        showAttachmentError(`画像サイズが大きすぎます（上限: 5MB）: ${file.name}`);
        return;
    }

    try {
        if (isImage) {
            // Convert image to Base64
            const base64 = await fileToBase64(file);
            pendingAttachments.push({
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                type: 'image',
                name: file.name,
                size: file.size,
                mimeType: file.type,
                data: base64
            });
        } else {
            // Read text content
            let content = await fileToText(file);

            // Check text length
            if (content.length > CONFIG.MAX_TEXT_LENGTH) {
                showAttachmentError(`テキストが長すぎるため先頭${CONFIG.MAX_TEXT_LENGTH}文字のみ使用します: ${file.name}`);
                content = content.substring(0, CONFIG.MAX_TEXT_LENGTH);
            }

            pendingAttachments.push({
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                type: 'text',
                name: file.name,
                size: file.size,
                mimeType: file.type,
                content: content
            });
        }

        renderAttachmentsPreview();
    } catch (err) {
        console.error('File processing error:', err);
        showAttachmentError(`ファイルの読み込みに失敗しました: ${file.name}`);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function fileToText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function renderAttachmentsPreview() {
    elements.attachmentsPreview.innerHTML = '';

    pendingAttachments.forEach(attachment => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.dataset.attachmentId = attachment.id;

        if (attachment.type === 'image') {
            item.innerHTML = `
                <img src="${attachment.data}" alt="${escapeHtml(attachment.name)}">
                <div class="attachment-item-info">
                    <div class="attachment-item-name">${escapeHtml(attachment.name)}</div>
                    <div class="attachment-item-size">${formatFileSize(attachment.size)}</div>
                </div>
                <button class="attachment-item-remove" title="削除">×</button>
            `;
        } else {
            item.innerHTML = `
                <div class="attachment-item-info">
                    <div class="attachment-item-name">📄 ${escapeHtml(attachment.name)}</div>
                    <div class="attachment-item-size">${formatFileSize(attachment.size)}</div>
                </div>
                <button class="attachment-item-remove" title="削除">×</button>
            `;
        }

        // Remove button handler
        item.querySelector('.attachment-item-remove').addEventListener('click', () => {
            removeAttachment(attachment.id);
        });

        elements.attachmentsPreview.appendChild(item);
    });
}

function removeAttachment(id) {
    pendingAttachments = pendingAttachments.filter(a => a.id !== id);
    renderAttachmentsPreview();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showAttachmentError(message) {
    // Create temporary error message
    const errorEl = document.createElement('div');
    errorEl.className = 'attachment-error';
    errorEl.textContent = message;
    elements.attachmentsPreview.appendChild(errorEl);

    setTimeout(() => errorEl.remove(), 5000);
}

function getRecentHistory() {
    // Limit the number of messages sent to API to reduce token usage
    if (chatHistory.length <= CONFIG.MAX_HISTORY_MESSAGES) {
        return chatHistory;
    }
    return chatHistory.slice(-CONFIG.MAX_HISTORY_MESSAGES);
}

function clearAttachments() {
    pendingAttachments = [];
    renderAttachmentsPreview();
}

async function sendMessageToGemini(userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('APIキーが設定されていません。設定画面からAPIキーを入力してください。');
    }

    // メインの人格（グローバル設定）
    const mainInstruction = getSystemInstruction();

    // 現在の部屋の追加指示
    const rooms = getRoomList();
    const currentRoom = rooms.find(r => r.id === currentRoomId);
    const roomInstruction = currentRoom?.roomInstruction || '';

    // メイン人格 + 部屋の追加指示を結合
    let systemInstruction = mainInstruction;
    if (roomInstruction) {
        systemInstruction += `\n\n## 現在の部屋\n${roomInstruction}`;
    }

    // ナレッジベースを追加
    const knowledgeContext = getKnowledgeContext();
    if (knowledgeContext) {
        systemInstruction += knowledgeContext;
    }

    // コアメモリを追加
    const coreMemoryContext = getCoreMemoryContext();
    if (coreMemoryContext) {
        systemInstruction += coreMemoryContext;
    }

    // Build conversation history for API (limited to recent messages)
    const recentHistory = getRecentHistory();
    const contents = recentHistory.map(msg => {
        let textContent;
        if (msg.role === 'assistant' && msg.variants) {
            // Get active variant content for assistant messages
            const activeVariant = msg.variants[msg.activeVariant || 0];
            textContent = activeVariant?.content || '';
        } else {
            textContent = msg.content || '';
        }
        // Handle attachments in message
        if (msg.attachments && msg.attachments.length > 0) {
            const parts = [];
            msg.attachments.forEach(att => {
                if (att.type === 'image' && att.data) {
                    // Extract base64 data from data URL
                    const base64Data = att.data.split(',')[1];
                    parts.push({
                        inline_data: {
                            mime_type: att.mimeType,
                            data: base64Data
                        }
                    });
                } else if (att.type === 'text' && att.content) {
                    parts.push({ text: `[添付ファイル: ${att.name}]\n${att.content}` });
                }
            });
            parts.push({ text: textContent });
            return {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: parts
            };
        }
        return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: textContent }]
        };
    });

    // Add current user message with pending attachments
    const currentParts = [];

    // Add pending attachments
    pendingAttachments.forEach(att => {
        if (att.type === 'image' && att.data) {
            const base64Data = att.data.split(',')[1];
            currentParts.push({
                inline_data: {
                    mime_type: att.mimeType,
                    data: base64Data
                }
            });
        } else if (att.type === 'text' && att.content) {
            currentParts.push({ text: `[添付ファイル: ${att.name}]\n${att.content}` });
        }
    });

    // Add user message text
    currentParts.push({ text: userMessage });

    contents.push({
        role: 'user',
        parts: currentParts
    });

    // Get model name from settings or use default
    const modelName = localStorage.getItem(CONFIG.STORAGE_KEYS.MODEL) || 'gemini-2.0-flash';
    const apiUrl = `${CONFIG.PROVIDERS.GOOGLE.baseUrl}${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: contents,
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                maxOutputTokens: CONFIG.API.MAX_OUTPUT_TOKENS,
                temperature: 0.9
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const apiErrorMessage = errorData.error?.message || '';
        console.error('API Error:', response.status, errorData);

        if (response.status === 400) {
            throw new Error(`リクエストが無効です: ${apiErrorMessage || 'メッセージを確認してください。'}`);
        } else if (response.status === 401 || response.status === 403) {
            throw new Error(`APIキーエラー: ${apiErrorMessage || 'APIキーが無効です。設定画面で正しいAPIキーを入力してください。'}`);
        } else if (response.status === 429) {
            throw new Error(`レート制限: ${apiErrorMessage || 'APIリクエストの制限に達しました。しばらく待ってから再試行してください。'}`);
        } else {
            throw new Error(`APIエラー (${response.status}): ${apiErrorMessage || 'リクエストに失敗しました。'}`);
        }
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('APIからの応答が空でした。');
    }

    return data.candidates[0].content.parts[0].text;
}

// ==========================================
// Event Handlers
// ==========================================

async function handleSendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message && pendingAttachments.length === 0) return;
    if (isLoading) return;

    // If no chat is open (home screen), create a new chat first
    if (!currentChatId) {
        const newChat = createNewChat();
        currentChatId = newChat.id;
        setCurrentChatId(currentChatId);
        chatHistory = [];
        renderChatList();
    }

    // Capture attachments before clearing
    const attachments = [...pendingAttachments];

    // Clear input and attachments
    elements.messageInput.value = '';
    clearAttachments();
    autoResizeTextarea();
    updateSendButtonState();

    // Remove welcome message
    removeWelcomeMessage();

    // Create user message with new format
    const now = new Date().toISOString();
    const userMsg = {
        id: generateMessageId(),
        role: 'user',
        content: message,
        attachments: attachments.map(a => ({
            type: a.type,
            name: a.name,
            size: a.size,
            mimeType: a.mimeType,
            data: a.type === 'image' ? a.data : undefined,
            content: a.type === 'text' ? a.content : undefined
        })),
        timestamp: now
    };

    // Add user message to UI
    const userMessageEl = createMessageElement(userMsg);
    elements.chatMessages.appendChild(userMessageEl);
    scrollToBottom();

    // Add user message to history
    chatHistory.push(userMsg);
    saveChatHistory();

    // Show typing indicator
    isLoading = true;
    updateSendButtonState();
    elements.chatMessages.appendChild(createTypingIndicator());
    scrollToBottom();

    try {
        // Send to API
        const response = await sendMessageToGemini(message);

        // Remove typing indicator
        removeTypingIndicator();

        // Create assistant message with variant format
        const responseTime = new Date().toISOString();
        const assistantMsg = {
            id: generateMessageId(),
            role: 'assistant',
            timestamp: responseTime,
            variants: [{ content: response, timestamp: responseTime }],
            activeVariant: 0
        };

        // Add assistant message to UI
        const assistantMessageEl = createMessageElement(assistantMsg);
        elements.chatMessages.appendChild(assistantMessageEl);
        scrollToBottom();

        // Add to history
        chatHistory.push(assistantMsg);
        saveChatHistory();

    } catch (error) {
        console.error('Error sending message:', error);
        removeTypingIndicator();

        // Show error message
        const errorTime = new Date().toISOString();
        const errorMsg = {
            id: generateMessageId(),
            role: 'assistant',
            timestamp: errorTime,
            variants: [{ content: `エラー: ${error.message}`, timestamp: errorTime }],
            activeVariant: 0
        };
        const errorEl = createMessageElement(errorMsg);
        errorEl.classList.add('error');
        elements.chatMessages.appendChild(errorEl);
        scrollToBottom();
    } finally {
        isLoading = false;
        updateSendButtonState();
    }
}

function handleKeyDown(e) {
    // IME変換中は何もしない（日本語入力の誤送信防止）
    if (e.isComposing || e.keyCode === 229) return;

    // Ctrl/Cmd + Enter で送信
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSendMessage();
    }
    // Enterのみ → デフォルト動作（改行）を許可
}

// Edit message handler
function handleEditMessage(msgId) {
    if (isLoading || editingMessageId) return;

    const msgIndex = chatHistory.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const msg = chatHistory[msgIndex];
    if (msg.role !== 'user') return;

    editingMessageId = msgId;

    // Find and update the message element in DOM
    const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
    if (!msgEl) return;

    const body = msgEl.querySelector('.message-body');
    const contentDiv = body.querySelector('.message-content');
    const footer = body.querySelector('.message-footer');

    // Hide content and footer
    contentDiv.style.display = 'none';
    footer.style.display = 'none';

    // Create edit container
    const editContainer = document.createElement('div');
    editContainer.className = 'message-edit-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = msg.content;

    const actions = document.createElement('div');
    actions.className = 'message-edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-edit-btn cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => handleCancelEdit(msgId));

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'message-edit-btn confirm';
    confirmBtn.textContent = '送信';
    confirmBtn.addEventListener('click', () => handleConfirmEdit(msgId, textarea.value));

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    editContainer.appendChild(textarea);
    editContainer.appendChild(actions);

    body.insertBefore(editContainer, footer);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function handleCancelEdit(msgId) {
    editingMessageId = null;

    const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
    if (!msgEl) return;

    const body = msgEl.querySelector('.message-body');
    const editContainer = body.querySelector('.message-edit-container');
    const contentDiv = body.querySelector('.message-content');
    const footer = body.querySelector('.message-footer');

    if (editContainer) editContainer.remove();
    contentDiv.style.display = '';
    footer.style.display = '';
}

async function handleConfirmEdit(msgId, newContent) {
    newContent = newContent.trim();
    if (!newContent || isLoading) return;

    const msgIndex = chatHistory.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    // Update the edited message
    const now = new Date().toISOString();
    chatHistory[msgIndex].content = newContent;
    chatHistory[msgIndex].timestamp = now;

    // Remove all messages after the edited message
    chatHistory = chatHistory.slice(0, msgIndex + 1);
    saveChatHistory();

    // Re-render chat
    editingMessageId = null;
    renderChatHistory();

    // Send new message to get AI response
    isLoading = true;
    updateSendButtonState();
    elements.chatMessages.appendChild(createTypingIndicator());
    scrollToBottom();

    try {
        const response = await sendMessageToGemini(newContent);
        removeTypingIndicator();

        const responseTime = new Date().toISOString();
        const assistantMsg = {
            id: generateMessageId(),
            role: 'assistant',
            timestamp: responseTime,
            variants: [{ content: response, timestamp: responseTime }],
            activeVariant: 0
        };

        chatHistory.push(assistantMsg);
        saveChatHistory();

        const el = createMessageElement(assistantMsg);
        elements.chatMessages.appendChild(el);
        scrollToBottom();

    } catch (error) {
        console.error('Error sending edited message:', error);
        removeTypingIndicator();

        const errorTime = new Date().toISOString();
        const errorMsg = {
            id: generateMessageId(),
            role: 'assistant',
            timestamp: errorTime,
            variants: [{ content: `エラー: ${error.message}`, timestamp: errorTime }],
            activeVariant: 0
        };
        const errorEl = createMessageElement(errorMsg);
        errorEl.classList.add('error');
        elements.chatMessages.appendChild(errorEl);
        scrollToBottom();
    } finally {
        isLoading = false;
        updateSendButtonState();
    }
}

// Regenerate handler
async function handleRegenerate(msgId) {
    if (isLoading) return;

    const msgIndex = chatHistory.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const msg = chatHistory[msgIndex];
    if (msg.role !== 'assistant') return;

    // Find the preceding user message
    let userMsgIndex = msgIndex - 1;
    while (userMsgIndex >= 0 && chatHistory[userMsgIndex].role !== 'user') {
        userMsgIndex--;
    }

    if (userMsgIndex < 0) return;
    const userMsg = chatHistory[userMsgIndex];

    isLoading = true;
    updateSendButtonState();

    // Show loading state on the message
    const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
    if (msgEl) {
        msgEl.classList.add('regenerating');
    }

    try {
        const response = await sendMessageToGemini(userMsg.content);

        // Add new variant
        const responseTime = new Date().toISOString();
        msg.variants.push({ content: response, timestamp: responseTime });
        msg.activeVariant = msg.variants.length - 1;

        saveChatHistory();
        renderChatHistory();

    } catch (error) {
        console.error('Error regenerating:', error);
        alert(`再生成に失敗しました: ${error.message}`);
    } finally {
        isLoading = false;
        updateSendButtonState();
        if (msgEl) {
            msgEl.classList.remove('regenerating');
        }
    }
}

// Variant navigation handler
function handleVariantNav(msgId, direction) {
    const msgIndex = chatHistory.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const msg = chatHistory[msgIndex];
    if (!msg.variants) return;

    const newIndex = (msg.activeVariant || 0) + direction;
    if (newIndex < 0 || newIndex >= msg.variants.length) return;

    msg.activeVariant = newIndex;
    saveChatHistory();

    // Re-render just the message
    const msgEl = document.querySelector(`[data-message-id="${msgId}"]`);
    if (msgEl) {
        const newEl = createMessageElement(msg);
        msgEl.replaceWith(newEl);
    }
}

function handleSettingsOpen() {
    // Load provider settings
    const provider = localStorage.getItem(CONFIG.STORAGE_KEYS.PROVIDER) || 'GOOGLE';
    const model = localStorage.getItem(CONFIG.STORAGE_KEYS.MODEL) || 'gemini-2.0-flash';
    const baseUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.BASE_URL) || '';

    elements.providerSelect.value = provider;
    elements.apiKeyInput.value = getApiKey();
    elements.modelInput.value = model;
    elements.baseUrlInput.value = baseUrl;

    // グローバル設定（メインの人格）を表示
    elements.systemInstructionInput.value = getSystemInstruction();

    updateProviderUI(provider);
    hideApiStatus();

    // Reset to first tab and render lists
    switchSettingsTab('connection');
    renderCoreMemories();
    renderKnowledgeList();

    showModal(elements.settingsModal);
}

function switchSettingsTab(tabName) {
    // Update tab buttons
    elements.settingsTabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update panels
    elements.settingsPanels.forEach(panel => {
        if (panel.id === `panel-${tabName}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
}

function updateProviderUI(provider) {
    // Update API key hint based on provider
    const hints = {
        GOOGLE: '<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a> からAPIキーを取得できます。',
        OPENROUTER: '<a href="https://openrouter.ai/keys" target="_blank" rel="noopener">OpenRouter</a> からAPIキーを取得できます。',
        OPENAI: '<a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI</a> からAPIキーを取得できます。',
        ANTHROPIC: '<a href="https://console.anthropic.com/" target="_blank" rel="noopener">Anthropic</a> からAPIキーを取得できます。',
        CUSTOM: 'カスタムプロバイダーのAPIキーを入力してください。'
    };
    elements.apiKeyHint.innerHTML = hints[provider] || hints.CUSTOM;

    // Show/hide Base URL field
    if (provider === 'OPENROUTER' || provider === 'CUSTOM') {
        elements.baseUrlGroup.style.display = 'block';
    } else {
        elements.baseUrlGroup.style.display = 'none';
    }
}

function handleSettingsClose() {
    hideModal(elements.settingsModal);
}

function handleSettingsSave() {
    const provider = elements.providerSelect.value;
    const apiKey = elements.apiKeyInput.value.trim();
    const model = elements.modelInput.value.trim();
    const baseUrl = elements.baseUrlInput.value.trim();
    const systemInstruction = elements.systemInstructionInput.value.trim();

    if (!apiKey) {
        showApiStatus('APIキーを入力してください。', true);
        return;
    }

    // Validate API key format only for Google
    if (provider === 'GOOGLE' && !apiKey.startsWith('AIza')) {
        showApiStatus('APIキーの形式が正しくありません。', true);
        return;
    }

    if (!systemInstruction) {
        showApiStatus('システムインストラクションを入力してください。', true);
        return;
    }

    // Save provider settings
    localStorage.setItem(CONFIG.STORAGE_KEYS.PROVIDER, provider);
    localStorage.setItem(CONFIG.STORAGE_KEYS.MODEL, model || 'gemini-2.0-flash');
    localStorage.setItem(CONFIG.STORAGE_KEYS.BASE_URL, baseUrl);
    setApiKey(apiKey);

    // グローバル設定（メインの人格）を保存
    setSystemInstruction(systemInstruction);
    showApiStatus('設定を保存しました。');
    updateSendButtonState();

    setTimeout(() => {
        hideModal(elements.settingsModal);
    }, 1000);
}

// Room settings handlers

function openRoomSettings(roomId) {
    const rooms = getRoomList();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    editingRoomId = roomId;
    elements.roomSettingsTitle.textContent = `${room.name} の設定`;
    elements.roomNameInput.value = room.name || '';
    elements.roomInstructionInput.value = room.roomInstruction || '';
    showModal(elements.roomSettingsModal);
}

function handleRoomSettingsClose() {
    editingRoomId = null;
    hideModal(elements.roomSettingsModal);
}

function handleRoomSettingsSave() {
    if (!editingRoomId) return;

    const rooms = getRoomList();
    const room = rooms.find(r => r.id === editingRoomId);
    if (!room) return;

    const newName = elements.roomNameInput.value.trim();
    if (newName) {
        room.name = newName;
    }
    room.roomInstruction = elements.roomInstructionInput.value.trim();
    saveRoomList(rooms);

    editingRoomId = null;
    hideModal(elements.roomSettingsModal);
    renderRoomTabs();
}

function handleDeleteRoom() {
    if (!editingRoomId) return;

    const rooms = getRoomList();
    if (rooms.length <= 1) {
        alert('最後の1つの部屋は削除できません。');
        return;
    }

    const room = rooms.find(r => r.id === editingRoomId);
    if (!room) return;

    // Show custom confirmation modal
    elements.deleteRoomMessage.textContent = `「${room.name}」を削除しますか？`;
    showModal(elements.deleteRoomModal);
}

function handleDeleteRoomCancel() {
    hideModal(elements.deleteRoomModal);
}

function handleDeleteRoomConfirm() {
    if (!editingRoomId) return;

    deleteRoom(editingRoomId);
    editingRoomId = null;
    hideModal(elements.deleteRoomModal);
    hideModal(elements.roomSettingsModal);
    renderRoomTabs();
}

function handleResetSystemInstruction() {
    elements.systemInstructionInput.value = DEFAULT_SYSTEM_INSTRUCTION;
}

function handleToggleKeyVisibility() {
    const input = elements.apiKeyInput;
    const eyeIcon = elements.toggleKeyVisibility.querySelector('.eye-icon');
    const eyeOffIcon = elements.toggleKeyVisibility.querySelector('.eye-off-icon');

    if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
    } else {
        input.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
    }
}

function handleClearChatOpen() {
    if (chatHistory.length === 0) return;
    showModal(elements.clearModal);
}

function handleClearChatClose() {
    hideModal(elements.clearModal);
}

function handleClearChatConfirm() {
    clearChatHistory();
    renderChatHistory();
    renderChatList();
    hideModal(elements.clearModal);
}

// ==========================================
// Initialization
// ==========================================

function init() {
    // Initialize sidebar state
    initSidebar();

    // Initialize rooms (fixed set of rooms)
    let rooms = getRoomList();

    // Create default rooms if none exist
    if (rooms.length === 0) {
        CONFIG.DEFAULT_ROOMS.forEach((defaultRoom) => {
            createNewRoom(defaultRoom.name);
        });
        rooms = getRoomList();
    }

    // Sort rooms to default order: リビング → 灯の書斎 → 雨音の間
    const defaultOrder = CONFIG.DEFAULT_ROOMS.map(r => r.name);
    rooms.sort((a, b) => {
        const indexA = defaultOrder.indexOf(a.name);
        const indexB = defaultOrder.indexOf(b.name);
        // Default rooms come first in order, custom rooms at the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
    saveRoomList(rooms);

    // Initialize chats
    let chats = getChatList();
    const savedCurrentChat = getCurrentChatId();

    // Check for legacy data and migrate
    const legacyHistory = localStorage.getItem('ritsu_chat_history');
    if (legacyHistory && chats.length === 0) {
        // Migrate legacy data
        const newChat = createNewChat();
        localStorage.setItem(`musubi_chat_${newChat.id}`, legacyHistory);
        localStorage.removeItem('ritsu_chat_history');
        localStorage.removeItem('ritsu_threads');
        chats = getChatList();
    }

    // Set current chat (don't create new chat automatically)
    if (chats.length > 0) {
        if (savedCurrentChat && chats.find(c => c.id === savedCurrentChat)) {
            currentChatId = savedCurrentChat;
            const chat = chats.find(c => c.id === currentChatId);
            currentRoomId = chat?.currentRoomId || rooms[0]?.id;
        } else {
            currentChatId = chats[0].id;
            setCurrentChatId(currentChatId);
            const chat = chats.find(c => c.id === currentChatId);
            currentRoomId = chat?.currentRoomId || rooms[0]?.id;
        }

        // Load current chat's history
        chatHistory = migrateMessageFormat(getChatHistory(currentChatId));
        saveChatHistory();
    } else {
        // No chats - show home screen with welcome message
        currentChatId = null;
        currentRoomId = rooms[0]?.id;
        chatHistory = [];
    }

    renderChatHistory();
    renderChatList();
    renderRoomTabs();

    // Mobile: Start with sidebar closed
    if (window.innerWidth <= 768) {
        elements.appWrapper.classList.add('sidebar-closed');
    }

    // Update UI state
    updateSendButtonState();

    // Event listeners - Sidebar
    elements.sidebarToggleBtn.addEventListener('click', toggleSidebar);

    // Mobile: Close sidebar when clicking overlay
    elements.appWrapper.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            !elements.appWrapper.classList.contains('sidebar-closed') &&
            !elements.sidebar.contains(e.target) &&
            !elements.sidebarToggleBtn.contains(e.target)) {
            elements.appWrapper.classList.add('sidebar-closed');
        }
    });
    elements.homeBtn.addEventListener('click', goHome);
    elements.newChatBtn.addEventListener('click', () => {
        const newChat = createNewChat();
        loadChat(newChat.id);
    });
    elements.downloadChatBtn.addEventListener('click', exportChatAsMarkdown);

    // Event listeners - Settings
    elements.settingsBtn.addEventListener('click', handleSettingsOpen);
    elements.modalClose.addEventListener('click', handleSettingsClose);
    elements.cancelSettings.addEventListener('click', handleSettingsClose);
    elements.saveSettings.addEventListener('click', handleSettingsSave);
    elements.toggleKeyVisibility.addEventListener('click', handleToggleKeyVisibility);
    elements.resetSystemInstruction.addEventListener('click', handleResetSystemInstruction);
    elements.providerSelect.addEventListener('change', (e) => {
        updateProviderUI(e.target.value);
    });

    // Event listeners - Clear chat modal (can be triggered via settings or elsewhere)
    elements.clearModalClose.addEventListener('click', handleClearChatClose);
    elements.cancelClear.addEventListener('click', handleClearChatClose);
    elements.confirmClear.addEventListener('click', handleClearChatConfirm);

    // Event listeners - Room settings
    elements.roomModalClose.addEventListener('click', handleRoomSettingsClose);
    elements.cancelRoomSettings.addEventListener('click', handleRoomSettingsClose);
    elements.saveRoomSettings.addEventListener('click', handleRoomSettingsSave);
    elements.deleteRoomBtn.addEventListener('click', handleDeleteRoom);

    // Event listeners - Room delete confirmation
    elements.deleteRoomModalClose.addEventListener('click', handleDeleteRoomCancel);
    elements.cancelDeleteRoom.addEventListener('click', handleDeleteRoomCancel);
    elements.confirmDeleteRoom.addEventListener('click', handleDeleteRoomConfirm);

    // Event listeners - Chat
    elements.messageInput.addEventListener('input', () => {
        autoResizeTextarea();
        updateSendButtonState();
    });
    elements.messageInput.addEventListener('keydown', handleKeyDown);
    elements.sendBtn.addEventListener('click', handleSendMessage);

    // Event listeners - File attachment
    elements.attachBtn.addEventListener('click', () => {
        elements.fileInput.click();
    });
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Event listeners - Settings tabs
    elements.settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchSettingsTab(tab.dataset.tab);
        });
    });

    // Event listeners - Core Memory
    elements.addMemoryBtn.addEventListener('click', () => {
        const content = elements.memoryInput.value.trim();
        if (content) {
            addCoreMemory(content);
            elements.memoryInput.value = '';
        }
    });
    elements.memoryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const content = elements.memoryInput.value.trim();
            if (content) {
                addCoreMemory(content);
                elements.memoryInput.value = '';
            }
        }
    });

    // Event listeners - Knowledge (in Settings)
    elements.addKnowledgeBtnSettings.addEventListener('click', () => {
        elements.knowledgeFileInputSettings.click();
    });
    elements.knowledgeFileInputSettings.addEventListener('change', handleKnowledgeFileSelect);

    // Close modals on overlay click
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) handleSettingsClose();
    });
    elements.clearModal.addEventListener('click', (e) => {
        if (e.target === elements.clearModal) handleClearChatClose();
    });

    // Check if API key is set
    if (!getApiKey()) {
        setTimeout(handleSettingsOpen, 500);
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

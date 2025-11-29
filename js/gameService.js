// js/gameService.js
import { BASE_URL } from './config.js';
import * as auth from './auth.js';
import * as ui from './uiManager.js';

// --- DEFINITIONS FOR SVG GRADIENTS ---
const SVG_DEFS = `
    <defs>
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FCD34D;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#F59E0B;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#B45309;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="rainbowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:red" />
            <stop offset="20%" style="stop-color:orange" />
            <stop offset="40%" style="stop-color:yellow" />
            <stop offset="60%" style="stop-color:green" />
            <stop offset="80%" style="stop-color:blue" />
            <stop offset="100%" style="stop-color:purple" />
        </linearGradient>
    </defs>
`;


let currentGameData = {
    coins: 0,
    avatar: { skin: '#e0ac69', shirt: '#3b82f6' } // Removed hairIndex/hairColor
};

// --- API CALLS ---
async function fetchGameProfile() {
    if (!auth.isLoggedIn()) return null;
    try {
        const response = await fetch(`${BASE_URL}/api/game/profile`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        if (response.ok) {
            currentGameData = await response.json();
            updateGameUI();
            return currentGameData;
        }
    } catch (e) { console.error('Failed to fetch profile', e); }
}

async function saveAvatarConfig(newConfig) {
    if (!auth.isLoggedIn()) return;
    try {
        const response = await fetch(`${BASE_URL}/api/game/avatar`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newConfig)
        });
        if (response.ok) {
            currentGameData = await response.json();
            updateGameUI();
            ui.showSuccessAlert('บันทึกสำเร็จ', 'อัปเดตตัวละครเรียบร้อย');
        }
    } catch (e) { ui.showErrorAlert('บันทึกไม่สำเร็จ'); }
}

export async function claimDailyReward() {
    if (!auth.isLoggedIn()) return ui.showModal('login-modal');
    const btn = document.getElementById('daily-reward-btn');
    if(btn) btn.disabled = true;
    try {
        const response = await fetch(`${BASE_URL}/api/game/daily-reward`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const result = await response.json();
        if (response.ok) {
            ui.showSuccessAlert('รับรางวัลสำเร็จ!', result.message);
            currentGameData.coins = result.newBalance;
            updateGameUI();
        } else { ui.showInfoAlert('แจ้งเตือน', result.message); }
    } catch (e) { ui.showErrorAlert('Error'); } finally { if(btn) btn.disabled = false; }
}

// --- NEW: SIGN API CALLS ---
export async function postSign(data) {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${BASE_URL}/api/signs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
    });
    return await response.json();
}

export async function voteSign(signId, optionIndex) {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${BASE_URL}/api/signs/${signId}/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optionIndex })
    });
    return await response.json();
}

// Get Sign Details (for Avatars/Privacy)
export async function getSignDetails(signId, skip = 0, limit = 10) {
    const response = await fetch(`${BASE_URL}/api/signs/${signId}/details?commentSkip=${skip}&commentLimit=${limit}`);
    return await response.json();
}

// NEW: Add Option to Poll
export async function addSignOption(signId, newOption) {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${BASE_URL}/api/signs/${signId}/options`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newOption })
    });
    return await response.json();
}

export async function postComment(signId, text) {
    if (!auth.isLoggedIn()) return ui.showModal('login-modal');
    try {
        const response = await fetch(`${BASE_URL}/api/signs/${signId}/comments`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });
        return await response.json();
    } catch (e) { console.error(e); }
}

// --- VISUAL LOGIC ---
export function generateAvatarSVG(config) {
    const skin = config?.skin || '#e0ac69';
    const shirt = config?.shirt || '#3b82f6';
    
    // Check for Premium Effects (e.g., Alien Glow)
    let filters = '';
    if(skin === '#84cc16') filters = 'filter: drop-shadow(0 0 5px #84cc16);'; // Alien Glow
    if(skin === '#ef4444') filters = 'filter: drop-shadow(0 0 3px #ef4444);'; // Demon Glow

    return `
        <svg viewBox="0 0 100 100" class="w-full h-full drop-shadow-sm" style="${filters}">
            ${SVG_DEFS}
            <!-- Body -->
            <path d="M20,100 Q20,70 50,70 Q80,70 80,100 Z" fill="${shirt}" />
            <!-- Head -->
            <circle cx="50" cy="45" r="28" fill="${skin}" />
            <!-- Eyes -->
            <circle cx="40" cy="42" r="3" fill="#1a1a1a" />
            <circle cx="60" cy="42" r="3" fill="#1a1a1a" />
            <!-- Smile -->
            <path d="M42,55 Q50,60 58,55" stroke="#8b5a2b" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
    `;
}

function updateGameUI() {
    const topAvatar = document.getElementById('top-avatar-display');
    if (topAvatar) topAvatar.innerHTML = generateAvatarSVG(currentGameData.avatar);
    
    // Update Profile Name if logged in
    const authUser = JSON.parse(localStorage.getItem('currentUser'));
    if(authUser) {
        const nameDisplay = document.getElementById('user-info-display-top');
        if(nameDisplay) nameDisplay.textContent = authUser.username;
    }

    const coinDisplays = document.querySelectorAll('.coin-balance-display');
    coinDisplays.forEach(el => el.innerText = currentGameData.coins.toLocaleString());

    const editorPreview = document.getElementById('avatar-editor-preview');
    if (editorPreview) editorPreview.innerHTML = generateAvatarSVG(currentGameData.avatar);
}

// --- EDITOR LOGIC ---
let tempAvatarConfig = { ...currentGameData.avatar };

export function openAvatarEditor() {
    if (!auth.isLoggedIn()) return ui.showModal('login-modal');
    tempAvatarConfig = { ...currentGameData.avatar };
    injectPremiumOptions();
    renderEditorPreview();
    ui.showModal('modal-avatar-editor');
}

function injectPremiumOptions() {
    // 1. Fetch owned items locally (assuming we loaded them at start, or fetch api)
    // For simplicity, we call the shop API quickly to get inventory, or store inventory in currentGameData
    fetch(`${BASE_URL}/api/shop`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } })
    .then(res => res.json())
    .then(data => {
        const ownedIds = data.owned;
        const allItems = data.items; // Need to expose SHOP_ITEMS or get from API
        
        // Filter Owned Items
        const mySkins = allItems.filter(i => i.type === 'skin' && ownedIds.includes(i.id));
        const myShirts = allItems.filter(i => i.type === 'shirt' && ownedIds.includes(i.id));

        // Append to UI
        const skinContainer = document.getElementById('editor-skin-options');
        // Clear existing premium buttons (keeping basics) - Simplified: just append
        // Ideally add a separator or special class
        
        mySkins.forEach(skin => {
            if(!document.getElementById(`btn-skin-${skin.id}`)) {
                const bg = skin.value.startsWith('url') ? (skin.id === 'skin_gold' ? 'linear-gradient(45deg, #FCD34D, #B45309)' : '#ccc') : skin.value;
                const btn = document.createElement('button');
                btn.id = `btn-skin-${skin.id}`;
                btn.className = "w-8 h-8 rounded-full border-2 border-yellow-400 shadow-md hover:scale-110 transition ring-2 ring-yellow-100 relative";
                btn.style.background = bg;
                btn.onclick = () => window.gameService.setAvatarProp('skin', skin.value);
                btn.innerHTML = '<span class="absolute -top-1 -right-1 text-[8px]">✨</span>';
                skinContainer.appendChild(btn);
            }
        });

        const shirtContainer = document.getElementById('editor-shirt-options');
        myShirts.forEach(shirt => {
            if(!document.getElementById(`btn-shirt-${shirt.id}`)) {
                const bg = shirt.value.startsWith('url') ? 'linear-gradient(to right, red, purple)' : shirt.value;
                const btn = document.createElement('button');
                btn.id = `btn-shirt-${shirt.id}`;
                btn.className = "w-8 h-8 rounded-full border-2 border-yellow-400 shadow-md hover:scale-110 transition ring-2 ring-yellow-100 relative";
                btn.style.background = bg;
                btn.onclick = () => window.gameService.setAvatarProp('shirt', shirt.value);
                btn.innerHTML = '<span class="absolute -top-1 -right-1 text-[8px]">✨</span>';
                shirtContainer.appendChild(btn);
            }
        });
    });
}
// Function to update the descriptive text
export function updateCoinRateText(secondsPerCoin) {
    const textEl = document.getElementById('coin-rate-text');
    if (!textEl || !secondsPerCoin) return;

    // ถ้าใช้เวลาน้อยกว่าหรือเท่ากับ 60 วิ ต่อ 1 เหรียญ (เช่น 12 วิ)
    if (secondsPerCoin <= 60) {
        // คำนวณ: 60 / 12 = 5 เหรียญต่อนาที
        const coinsPerMinute = Math.floor(60 / secondsPerCoin);
        textEl.innerText = `ออนไลน์ 1 นาที รับฟรี ${coinsPerMinute} เหรียญ!`;
        textEl.classList.add('text-green-600', 'font-bold'); // เพิ่มสีเขียวให้น่าสนใจ
    } 
    // ถ้าใช้เวลานานกว่า 1 นาที (เช่น 180 วิ = 3 นาที)
    else {
        const minutes = Math.ceil(secondsPerCoin / 60);
        textEl.innerText = `ออนไลน์ครบ ${minutes} นาที รับฟรี 1 เหรียญ!`;
    }
}

// UPDATE: Handle the response data in logUserTimeSpent (via api.js calling this or directly here)
// Actually, since api.js handles the response, we need a way to pass this data.
// Let's assume api.js calls updateCoinBalance. We can add a new method or update that one.

export function handleTimeLogResponse(data) {
    if (data.newBalance !== undefined) {
        updateCoinBalance(data.newBalance);
    }
    if (data.coinsEarned > 0) {
        triggerCoinEffect(data.coinsEarned);
    }
    // ส่งค่า secondsPerCoin ไปคำนวณข้อความ
    if (data.secondsPerCoin) {
        updateCoinRateText(data.secondsPerCoin);
    }
}

function renderEditorPreview() {
    const preview = document.getElementById('avatar-editor-preview');
    if (preview) preview.innerHTML = generateAvatarSVG(tempAvatarConfig);
}

export function setAvatarProp(prop, value) {
    tempAvatarConfig[prop] = value;
    renderEditorPreview();
}

export function saveAvatarChanges() {
    saveAvatarConfig(tempAvatarConfig);
    ui.hideModal('modal-avatar-editor');
}

export function initGameService() {
    if (auth.isLoggedIn()) fetchGameProfile();
}

// --- SHOP LOGIC ---
export async function openShopModal() {
    if (!auth.isLoggedIn()) return ui.showModal('login-modal');

    try {
        // Fetch Items
        const response = await fetch(`${BASE_URL}/api/shop`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await response.json();
        
        renderShopItems(data.items, data.owned);
        ui.showModal('shop-modal');
    } catch (e) {
        console.error(e);
        ui.showErrorAlert('ไม่สามารถโหลดร้านค้าได้');
    }
}

function renderShopItems(items, ownedIds) {
    const container = document.getElementById('shop-items-grid');
    
    // Helper to check if currently equipped
    const currentSkin = currentGameData.avatar.skin;
    const currentShirt = currentGameData.avatar.shirt;

    container.innerHTML = items.map(item => {
        const isOwned = ownedIds.includes(item.id);
        const isEquipped = (item.type === 'skin' && item.value === currentSkin) || 
                           (item.type === 'shirt' && item.value === currentShirt);

        let btnClass, btnText, action;

        if (isEquipped) {
            btnClass = 'bg-green-500 text-white cursor-default';
            btnText = 'ใส่อยู่';
            action = '';
        } else if (isOwned) {
            btnClass = 'bg-blue-500 text-white hover:bg-blue-600 shadow-md active:scale-95';
            btnText = 'สวมใส่';
            // New Action: Equip
            action = `onclick="window.gameService.equipItem('${item.id}', '${item.type}', '${item.value}')"`;
        } else {
            btnClass = 'bg-yellow-400 text-white hover:bg-yellow-500 shadow-md active:scale-95';
            btnText = `${item.price} 💰`;
            // Buy Action
            action = `onclick="window.gameService.buyItem('${item.id}')"`;
        }

        // Preview Circle (Handle Gradients)
        const bgStyle = item.value.startsWith('url') ? `background: ${item.value === 'url(#goldGradient)' ? 'linear-gradient(45deg, #FCD34D, #B45309)' : 'linear-gradient(to right, red, purple)'}` : `background-color: ${item.value}`;
        
        return `
            <div class="bg-white p-3 rounded-xl border ${isEquipped ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-100'} shadow-sm flex flex-col items-center text-center relative overflow-hidden group transition-all">
                <div class="w-10 h-10 rounded-full border-2 border-white shadow-sm mb-2" style="${bgStyle}"></div>
                
                <h4 class="font-bold text-gray-800 text-xs mb-0.5 truncate w-full">${item.name}</h4>
                <p class="text-[9px] text-gray-400 mb-2 truncate w-full">${item.description}</p>
                
                <button ${action} class="w-full py-1.5 rounded-lg text-[10px] font-bold transition-all ${btnClass}">
                    ${btnText}
                </button>
                
                ${item.isPremium ? '<div class="absolute top-1 left-1 text-xs">✨</div>' : ''}
            </div>
        `;
    }).join('');
    
    if(window.lucide) lucide.createIcons();
}

// Equip Item without buying
export async function equipItem(itemId, type, value) {
    // Optimistic UI Update
    const oldVal = currentGameData.avatar[type];
    currentGameData.avatar[type] = value;
    updateGameUI();
    
    // Save to Server
    try {
        await saveAvatarConfig(currentGameData.avatar);
        // Refresh Shop UI to show "Equipped" status
        openShopModal(); 
    } catch(e) {
        // Revert on error
        currentGameData.avatar[type] = oldVal;
        updateGameUI();
        ui.showErrorAlert('บันทึกไม่สำเร็จ');
    }
}

// FILE: js/gameService.js

export async function buyItem(itemId) {
    const buyBtn = document.getElementById(`buy-btn-${itemId}`);
    const originalText = buyBtn ? buyBtn.innerHTML : '';
    
    if (buyBtn) {
        buyBtn.innerHTML = '<div class="animate-spin w-4 h-4 border-2 border-yellow-900 border-t-transparent rounded-full mx-auto"></div>';
        buyBtn.disabled = true;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${BASE_URL}/api/shop/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ itemId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 1. FIX: Update Local State (Use currentGameData, not state)
            currentGameData.coins = result.newBalance;
            currentGameData.avatar = result.avatar;
            
            // Sync to localStorage for other parts of the app
            localStorage.setItem('userGameData_temp', JSON.stringify(currentGameData));

            // 2. FIX: Update Global UI (Use updateGameUI, not updateUI)
            updateGameUI(); 
            
            // 3. Update Shop UI - Coin Balance
            document.querySelectorAll('.coin-balance-display').forEach(el => el.innerText = result.newBalance.toLocaleString());
            
            // 4. Update Shop UI - Button State (Instant Feedback)
            if (buyBtn) {
                buyBtn.outerHTML = `
                    <button disabled class="w-full py-2 rounded-lg text-xs font-bold bg-gray-100 text-green-600 border border-gray-200 cursor-default flex justify-center items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        มีแล้ว
                    </button>
                `;
            }

            // 5. Update Equipped Button (If auto-equipped)
            // If the item bought was a skin/shirt, we need to refresh the list to show "Equipped" or "Wear"
            // For simplicity, we just reload the shop modal content silently or let the user click 'Wear' next time.
            // But since the API returns the new avatar, it might be auto-equipped.
            // Let's refresh the shop items grid to be safe and accurate.
            const shopResponse = await fetch(`${BASE_URL}/api/shop`, { headers: { 'Authorization': `Bearer ${token}` } });
            const shopData = await shopResponse.json();
            renderShopItems(shopData.items, shopData.owned);

            // 6. Success Alert
            Swal.fire({
                icon: 'success',
                title: 'เรียบร้อย!',
                text: result.message,
                timer: 1500,
                showConfirmButton: false,
                backdrop: `rgba(0,0,0,0.4)`
            });

        } else {
            // Failed
            Swal.fire({ 
                icon: 'error', 
                title: 'ไม่สำเร็จ', 
                text: result.message,
                confirmButtonColor: '#d33'
            });
            // Reset Button
            if (buyBtn) {
                buyBtn.innerHTML = originalText;
                buyBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error("Buy Error:", error);
        if (buyBtn) {
            buyBtn.innerHTML = originalText;
            buyBtn.disabled = false;
        }
    }
}


export function updateCoinBalance(newBalance) {
    currentGameData.coins = newBalance;
    const displays = document.querySelectorAll('.coin-balance-display');
    displays.forEach(el => el.innerText = newBalance.toLocaleString());
}

export function triggerCoinEffect(amount) {
    // 1. Play Sound (Optional)
    // const audio = new Audio('coin-sound.mp3'); audio.play().catch(()=>{});

    // 2. Toast Notification
    const Toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: false,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    });

    Toast.fire({
        icon: 'success',
        title: `+${amount} เหรียญ!`,
        text: 'รางวัลจากการออนไลน์ครบ 5 นาที'
    });

    // 3. UI Pulse Animation (Top Bar)
    const coinContainer = document.querySelector('.coin-balance-container'); // ต้องแก้ class ใน html ให้ตรง
    if(coinContainer) {
        coinContainer.classList.add('coin-pulse');
        setTimeout(() => coinContainer.classList.remove('coin-pulse'), 1000);
    }
}
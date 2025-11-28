// js/mapManager.js

import * as L from 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';

import * as api from './api.js';
import * as auth from './auth.js';
import * as guest from './guestManager.js';
import * as ui from './uiManager.js';
import { BASE_URL } from './config.js';

import { resetAndSyncCurrentTime } from './timeTracker.js';

let userScalePreference = parseFloat(localStorage.getItem('userMarkerScale')) || 1.0; // Load saved pref

// --- MODULE STATE ---
let map;
let userLocation = null;
let treasureMarkers = [];
let selectedPosition = null;
let selectedTreasure = null;
let currentRole = 'placer'; // default role

let signMarkers = [];

// --- CONFIGURATION ---
const defaultCenter = [19.02759179537163, 99.926775097847];
const BASE_TREASURE_ICON_SIZE = 18;
const BASE_USER_ICON_SIZE = 18;
const BASE_ZOOM = 14;
const ZOOM_SCALE_FACTOR_PER_LEVEL = 0.15;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

// --- INITIALIZATION ---
export function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false });

    map.setView(defaultCenter, 13); // Using a wider zoom level like 13 for the initial load.

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    map.on('zoomend', updateMarkerIconContentScaling);

    // Now, these functions will run against a valid map object.
    setupGeolocation(); // This will later update the view to the user's precise location.
    setupMapClickHandler();
    loadSigns();
}

// --- CORE MAP FUNCTIONS ---
function setupGeolocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, {
            enableHighAccuracy: true, timeout: 8000
        });
    } else {
        alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง");
        handleGeolocationError();
    }
}

async function handleGeolocationSuccess(position) {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    updateUserLocationOnMap(userLocation);
    ui.hideLoadingMessage();
    await loadTreasures();
    updateMarkerIconContentScaling();
}

async function handleGeolocationError(error) {
    if (error) console.warn("ข้อผิดพลาดการระบุตำแหน่ง:", error.message);
    map.setView(defaultCenter, 16);
    ui.hideLoadingMessage();
    await loadTreasures();
    updateMarkerIconContentScaling();
}

function updateUserLocationOnMap(location) {
    if (window.userMarker) map.removeLayer(window.userMarker);
    
    // Get Avatar SVG (or default)
    let avatarSvg = '<div class="w-full h-full bg-blue-500 rounded-full"></div>';
    if(window.gameService && window.gameService.generateAvatarSVG) {
        // Get current profile
        const gameData = JSON.parse(localStorage.getItem('userGameData_temp')) || { avatar: { skin: '#e0ac69', shirt: '#3b82f6' } }; 
        // Note: Ideally pass the actual gameData here, but falling back to default is safe
        avatarSvg = window.gameService.generateAvatarSVG(gameData.avatar);
    }

    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
            className: 'user-location-marker',
            html: `
                <div class="relative w-14 h-14">
                    <!-- Pulse Effect -->
                    <div class="absolute inset-0 bg-blue-500/30 rounded-full animate-ping"></div>
                    <!-- Main Body -->
                    <div class="absolute inset-1 bg-white rounded-full border-4 border-blue-500 shadow-lg overflow-hidden flex items-center justify-center">
                        ${avatarSvg}
                    </div>
                    <!-- Label -->
                    <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow border border-white">
                        YOU
                    </div>
                </div>
            `,
            iconSize: [56, 56], // Slightly larger for "YOU"
            iconAnchor: [28, 28]
        }),
        zIndexOffset: 1000, // Always on top
        interactive: false
    }).addTo(map);
    
    // Only center once on load
    if(!window.initialZoomDone) {
        map.setView([location.lat, location.lng], 16);
        window.initialZoomDone = true;
    }
}

// --- EXPORT NEW FUNCTION ---
export function setUserMarkerScale(value) {
    userScalePreference = parseFloat(value);
    localStorage.setItem('userMarkerScale', userScalePreference);
    updateMarkerIconContentScaling(); // Apply immediately
}

export function getUserMarkerScale() {
    return userScalePreference;
}

function updateMarkerIconContentScaling() {
    if(!map) return;
    const currentZoom = map.getZoom();
    const zoomDifference = currentZoom - BASE_ZOOM; // BASE_ZOOM is 14
    
    // 1. Calculate Base Zoom Scale
    let zoomScale = 1.0 + (zoomDifference * ZOOM_SCALE_FACTOR_PER_LEVEL);
    
    // 2. Apply User Preference Multiplier
    let finalScale = zoomScale * userScalePreference;

    // 3. Enforce Hard Limits (Global Safety)
    // Prevents it from disappearing (0) or covering the whole screen
    const ABSOLUTE_MIN = 0.2; 
    const ABSOLUTE_MAX = 4.0;
    finalScale = Math.max(ABSOLUTE_MIN, Math.min(ABSOLUTE_MAX, finalScale));

    // 4. Update CSS Variable
    document.documentElement.style.setProperty('--current-icon-scale', finalScale);

    // 5. Apply to all marker contents
    document.querySelectorAll('.treasure-icon-content, .current-location-icon-content, .custom-sign-marker > div').forEach(el => {
        el.style.transform = `scale(${finalScale})`;
    });
}

// --- TREASURE MANAGEMENT ---
export async function loadTreasures() {
    try {
        clearTreasureMarkers();
        const treasures = await api.getTreasures(); // This call doesn't change

        const uniqueTreasuresMap = new Map();
        treasures.forEach(t => {
            if (t.lat != null && t.lng != null) {
                const key = `${t.lat},${t.lng}`;
                if (!uniqueTreasuresMap.has(key)) uniqueTreasuresMap.set(key, t);
            }
        });

        const filteredTreasures = Array.from(uniqueTreasuresMap.values()).filter(t => t.remainingBoxes > 0);
        createTreasureMarkers(filteredTreasures);
        updateMarkerIconContentScaling();
    } catch (error) {
        console.error("Error loading treasures:", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลคูปอง: " + error.message);
    }
}

function createTreasureMarkers(treasures) {
    treasures.forEach(treasure => {
        // Use HTML Marker for consistent sizing with Signs
        const icon = L.divIcon({
            className: 'custom-treasure-marker',
            html: `
                <div class="relative w-12 h-12 hover:scale-110 transition-transform duration-200">
                    <div class="absolute inset-0 bg-gradient-to-br from-gold-400 to-yellow-600 rounded-full border-2 border-white shadow-md flex items-center justify-center animate-float">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a10 10 0 1 0-10 10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                    </div>
                    <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur text-white text-[9px] px-1.5 rounded-full border border-white/20 shadow-sm whitespace-nowrap">
                        ${treasure.discount ? treasure.discount + '%' : '฿'}
                    </div>
                </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });

        const marker = L.marker([treasure.lat, treasure.lng], { icon }).addTo(map);

        marker.on('click', () => {
            if (currentRole === 'hunter') {
                selectedTreasure = treasure;
                displayTreasureInfo(treasure);
                ui.showModal('view-treasure-modal');
            }
        });
        treasureMarkers.push(marker);
    });
}

function clearTreasureMarkers() {
    treasureMarkers.forEach(marker => map.removeLayer(marker));
    treasureMarkers = [];
}

function displayTreasureInfo(treasure) {
    let discountText = treasure.discount ? `${treasure.discount}%` : `${treasure.discountBaht} บาท`;
    const infoHTML = `
        <p><strong>ชื่อร้าน:</strong> ${treasure.name || 'ไม่ระบุ'}</p>
        <p><strong>ภารกิจ:</strong> ${treasure.mission || 'ไม่ระบุ'}</p>
        <p><strong>รางวัล:</strong> ${discountText}</p>
        <p><strong>จำนวนคงเหลือ:</strong> ${treasure.remainingBoxes || 0} / ${treasure.totalBoxes || 1}</p>
    `;
    document.getElementById('treasure-info').innerHTML = infoHTML;
}

// --- EVENT HANDLERS & ACTIONS ---
function setupMapClickHandler() {
    map.on('click', (event) => {
        window.selectedPositionMapClick = event.latlng; // Store global for Place Sign
        if (currentRole === 'placer') {
            selectedPosition = event.latlng;
            ui.showModal('place-treasure-modal');
        }
    });
}

async function saveTreasure() {
    // Check Auth / Guest Limit with Premium Dialog
    if (!auth.isLoggedIn() && !guest.canGuestPerformAction('place')) {
        const confirm = await ui.showConfirmLogin('คุณใช้วางคูปองฟรีครบโควต้าวันนี้แล้ว (1 ครั้ง/วัน)\nกรุณาเข้าสู่ระบบเพื่อใช้งานต่อไม่จำกัด');
        if (confirm) ui.showModal('login-modal');
        return;
    }

    const treasureData = {
        lat: selectedPosition?.lat,
        lng: selectedPosition?.lng,
        name: document.getElementById('name').value.trim(),
        ig: document.getElementById('ig').value.trim(),
        face: document.getElementById('face').value.trim(),
        mission: document.getElementById('mission').value.trim(),
        discount: document.getElementById('discount').value || null,
        discountBaht: document.getElementById('discount-baht').value || null,
        totalBoxes: parseInt(document.getElementById('total-boxes').value, 10) || 1
    };

    if (!treasureData.lat || !treasureData.name || !treasureData.mission) {
        return ui.showInfoAlert('ข้อมูลไม่ครบ', 'กรุณาเลือกตำแหน่งบนแผนที่ และกรอกชื่อร้านกับภารกิจ');
    }

    treasureData.remainingBoxes = treasureData.totalBoxes;
    const saveButton = document.getElementById('save-treasure');
    saveButton.disabled = true;

    try {
        await api.createTreasure(treasureData);
        if (!auth.isLoggedIn()) guest.recordGuestAction('place');

        // Premium Success Alert
        ui.showSuccessAlert('เรียบร้อย!', 'คูปองของคุณถูกวางลงบนแผนที่แล้ว');
        
        await loadTreasures();
        ui.resetTreasureForm();
        ui.hideModal('place-treasure-modal');
    } catch (error) {
        console.error("Error saving treasure:", error);
        ui.showErrorAlert(error.message);
    } finally {
        saveButton.disabled = false;
    }
}

export async function loadSigns() {
    try {
        const response = await fetch(`${BASE_URL}/api/signs`);
        const signs = await response.json();
        
        // Clear old markers
        signMarkers.forEach(m => map.removeLayer(m));
        signMarkers = [];

        signs.forEach(sign => {
            // Generate Avatar HTML for the icon
            const avatarSvg = window.gameService.generateAvatarSVG(sign.avatar);
            
            const icon = L.divIcon({
                className: 'custom-sign-marker',
                html: `
                    <div class="relative w-12 h-12">
                        <div class="absolute inset-0 bg-white rounded-full border-2 border-white shadow-md overflow-hidden">
                            ${avatarSvg}
                        </div>
                        <div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-gray-200 shadow-sm text-[10px]">
                            💬
                        </div>
                        <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-2 py-0.5 rounded shadow text-[10px] font-bold whitespace-nowrap border border-gray-100">
                            ${sign.message}
                        </div>
                    </div>
                `,
                iconSize: [48, 48],
                iconAnchor: [24, 24]
            });

            const marker = L.marker([sign.lat, sign.lng], { icon }).addTo(map);
            marker.on('click', () => openSignModal(sign));
            signMarkers.push(marker);
        });
    } catch (error) {
        console.error("Load Signs Error", error);
    }
}

function openSignModal(sign) {
    const container = document.getElementById('view-sign-content');

    // 1. Setup Static Layout (Header + Comment List Container)
    container.innerHTML = `
        <div class="flex items-start gap-3 mb-4 p-4 bg-yellow-50/50 rounded-2xl border border-yellow-100 relative overflow-hidden">
            <div class="absolute top-0 right-0 w-16 h-16 bg-yellow-400/10 rounded-full blur-xl -mr-4 -mt-4"></div>
            <div class="w-12 h-12 rounded-full bg-white border-2 border-white shadow-md overflow-hidden flex-shrink-0 z-10">
                ${window.gameService.generateAvatarSVG(sign.avatar)}
            </div>
            <div class="z-10 w-full overflow-hidden">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-bold bg-yellow-400 text-white px-2 py-0.5 rounded-full shadow-sm">ประกาศ</span>
                    <span class="text-xs text-gray-400 font-bold uppercase tracking-wide truncate">${sign.username || 'Guest'}</span>
                </div>
                <div class="text-lg font-bold text-gray-800 leading-tight break-words">"${sign.message}"</div>
            </div>
        </div>
        
        <div class="flex justify-between items-end mb-2 ml-1">
            <div class="text-xs text-gray-400 font-bold uppercase tracking-wider">ความคิดเห็น</div>
            <div class="text-[10px] text-gray-300" id="comment-count-display">${sign.comments.length} คอมเมนต์</div>
        </div>

        <!-- Scrollable Area Targeted by ID -->
        <div id="sign-comments-list" class="max-h-60 overflow-y-auto custom-scrollbar pr-1 pb-2 space-y-2">
            <!-- Comments injected here -->
        </div>
    `;

    // 2. Helper Function to Render Comments
    const renderComments = (commentsArray) => {
        const listContainer = document.getElementById('sign-comments-list');
        const countDisplay = document.getElementById('comment-count-display');
        
        if(countDisplay) countDisplay.innerText = `${commentsArray.length} คอมเมนต์`;

        if (!commentsArray || commentsArray.length === 0) {
            listContainer.innerHTML = '<div class="flex flex-col items-center justify-center py-8 text-gray-400 opacity-50"><i data-lucide="message-circle" class="w-8 h-8 mb-2"></i><p class="text-xs">ยังไม่มีคอมเมนต์ เป็นคนแรกสิ!</p></div>';
            if(window.lucide) lucide.createIcons();
            return;
        }

        const html = commentsArray.map((c, index) => {
            const isLong = c.text.length > 80;
            const contentHtml = isLong 
                ? `
                    <div id="comment-text-${index}" class="text-gray-600 text-sm transition-all duration-300 max-h-[42px] overflow-hidden relative break-words whitespace-normal w-full">
                        ${c.text}
                        <div id="fade-${index}" class="absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none"></div>
                    </div>
                    <button onclick="document.getElementById('comment-text-${index}').classList.remove('max-h-[42px]', 'overflow-hidden'); document.getElementById('fade-${index}').style.display='none'; this.style.display='none';" 
                            class="text-[10px] text-blue-500 font-bold mt-1 hover:underline cursor-pointer">
                        ดูเพิ่มเติม...
                    </button>
                  ` 
                : `<p class="text-gray-600 text-sm break-words whitespace-normal w-full">${c.text}</p>`;

            return `
                <div class="bg-gray-50 p-3 rounded-xl border border-gray-100 w-full animate-fadeIn">
                    <span class="font-bold text-gray-800 text-xs block mb-1">${c.username}</span>
                    ${contentHtml}
                </div>
            `;
        }).join('');

        listContainer.innerHTML = html;
        // Auto scroll to bottom
        listContainer.scrollTop = listContainer.scrollHeight;
        if(window.lucide) lucide.createIcons();
    };

    // Initial Render
    renderComments(sign.comments);

    // 3. Setup "Send" Button Logic (Smooth Update)
    const btn = document.getElementById('send-comment-btn');
    const newBtn = btn.cloneNode(true); // Remove old listeners
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async () => {
        const input = document.getElementById('comment-input');
        const text = input.value.trim();
        if(!text) return;
        
        // Loading State
        newBtn.disabled = true;
        newBtn.innerHTML = '<div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>';
        
        try {
            const res = await window.gameService.postComment(sign._id, text);
            
            if(res && res.success) {
                input.value = ''; // Clear input
                
                // SMOOTH UPDATE: Use the returned comments array to re-render immediately
                renderComments(res.comments);
                
                // Silent background refresh of map markers (optional, to keep data in sync)
                loadSigns(); 
            }
        } catch (error) {
            console.error(error);
        } finally {
            // Reset Button
            newBtn.disabled = false;
            newBtn.innerHTML = '<i data-lucide="send" class="w-4 h-4 ml-0.5"></i>';
            if(window.lucide) lucide.createIcons();
        }
    });

    // Show Modal
    ui.showModal('view-sign-modal');
}

export async function placeSign() {
    const message = document.getElementById('sign-message').value.trim();
    if(!message) return ui.showInfoAlert('ระบุข้อความ', 'กรุณาใส่ข้อความสั้นๆ');

    // Assuming selectedPosition is globally available in mapManager scope (it is in previous code)
    // If not, make sure selectedPosition is updated on map click
    if (!window.selectedPositionMapClick) return ui.showInfoAlert('เลือกจุด', 'แตะบนแผนที่ก่อนครับ');

    try {
        const res = await window.gameService.postSign({
            lat: window.selectedPositionMapClick.lat,
            lng: window.selectedPositionMapClick.lng,
            message: message
        });
        
        if(res.success) {
            ui.showSuccessAlert('สำเร็จ', res.message);
            ui.hideModal('place-treasure-modal');
            loadSigns();
        }
    } catch(e) {
        ui.showErrorAlert(e.message);
    }
}

/**
 * Handles the logic when the "Submit Proof" button is clicked.
 */
async function submitProof() {
    // 1. Check Guest Limits
    if (!auth.isLoggedIn() && !guest.canGuestPerformAction('open')) {
        const confirm = await ui.showConfirmLogin('คุณใช้สิทธิ์เปิดคูปองฟรีครบโควต้าวันนี้แล้ว (1 ครั้ง/วัน)\nกรุณาเข้าสู่ระบบเพื่อล่าสมบัติแบบ Unlimited!');
        if (confirm) ui.showModal('login-modal');
        return;
    }

    // 2. Validate Inputs
    if (!selectedTreasure || !document.getElementById('proof-image').files.length) {
        return ui.showInfoAlert('หลักฐานไม่ครบ', 'กรุณาอัปโหลดรูปภาพเพื่อยืนยันภารกิจ');
    }

    const submitButton = document.getElementById('submit-proof');
    
    // 3. Set Loading State
    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = 'กำลังส่ง...';

    try {
        // 4. Call API
        await api.claimTreasure(selectedTreasure._id);
        
        if (!auth.isLoggedIn()) guest.recordGuestAction('open');

        // 5. Success: Show Discount Code
        displayDiscountCode();
        
        // 6. Refresh Data
        await loadTreasures(); // Reload map to remove claimed treasure
        ui.resetProofForm();
        
    } catch (error) {
        console.error("Error submitting proof:", error);
        
        // Handle 404 specific error (Treasure already gone)
        if (error.message && (error.message.includes('ไม่พบ') || error.message.includes('404'))) {
            ui.showErrorAlert('ไม่สำเร็จ', 'คูปองนี้ถูกผู้อื่นล่าไปแล้ว หรือหมดอายุครับ');
            // Force refresh map to remove the ghost marker
            await loadTreasures();
            ui.hideModal('submit-proof-modal');
        } else {
            ui.showErrorAlert(error.message || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
        }
    } finally {
        // 7. Reset Button State
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

/**
 * Update the Discount Modal with data from the selected treasure.
 * SAFE VERSION: Checks if elements exist before setting text.
 */
function displayDiscountCode() {
    // Generate a random code (or use one from backend if available)
    const code = ui.generateDiscountCode();
    
    // 1. Update Discount Code
    const codeEl = document.getElementById('discount-code-display');
    if (codeEl) codeEl.textContent = code;

    // 2. Update Shop Name
    const nameEl = document.getElementById('shop-name-display');
    if (nameEl) nameEl.textContent = selectedTreasure.name || 'Unknown Shop';

    // 3. Update Mission (Optional - might not exist in new UI)
    const missionEl = document.getElementById('mission-display');
    if (missionEl) {
        missionEl.textContent = selectedTreasure.mission || '-';
    }

    // 4. Update Discount Amount
    const discountEl = document.getElementById('discount-display');
    if (discountEl) {
        const discountText = selectedTreasure.discount 
            ? `${selectedTreasure.discount}%` 
            : `${selectedTreasure.discountBaht} บาท`;
        discountEl.textContent = discountText;
    }

    // 5. Handle Image Display
    const file = document.getElementById('proof-image').files[0];
    if (file) {
        const proofImageElement = document.getElementById('proof-image-display');
        if (proofImageElement) {
            const reader = new FileReader();
            reader.onload = e => {
                proofImageElement.src = e.target.result;
                proofImageElement.style.display = 'block';
                proofImageElement.parentElement.classList.remove('hidden'); // Ensure container is visible
            };
            reader.readAsDataURL(file);
        }
    }

    // 6. Switch Modals
    ui.hideModal('submit-proof-modal');
    ui.showModal('discount-code-modal');
}

export function setupActionHandlers() {
    document.getElementById('placer-btn').addEventListener('click', () => {
        currentRole = 'placer';
        ui.switchRole(currentRole);
    });
    document.getElementById('hunter-btn').addEventListener('click', () => {
        currentRole = 'hunter';
        ui.switchRole(currentRole);
    });
    document.getElementById('refresh-btn').addEventListener('click', async () => {
        ui.showLoadingMessage(); // Show loading overlay
        
        try {
            // Optional: reset time tracker if you have that imported
            // await resetAndSyncCurrentTime(); 
            
            // RELOAD BOTH TREASURES AND SIGNS
            await Promise.all([
                loadTreasures(), 
                loadSigns()
            ]);
            
            console.log("Map and Profiles refreshed");
        } catch (error) {
            console.error("Error during refresh process:", error);
        } finally {
            ui.hideLoadingMessage(); // Hide loading overlay
        }
    });
    document.getElementById('location-btn').addEventListener('click', () => {
        if (userLocation) map.setView([userLocation.lat, userLocation.lng], 18);
        else setupGeolocation();
    });

    document.getElementById('save-treasure').addEventListener('click', saveTreasure);
    document.getElementById('submit-proof').addEventListener('click', submitProof);
}
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

let currentCommentSort = 'newest';
let currentSignData = null; // Store current sign data to allow re-sorting without API call

// GLOBAL VARIABLES FOR PAGINATION
let currentSignId = null;
let currentComments = [];
let currentSkip = 0;
let totalCommentsCount = 0;
const COMMENT_LIMIT = 10;

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
    map.on('load', updateMarkerIconContentScaling);

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
    
    let avatarSvg = '<div class="w-full h-full bg-blue-500 rounded-full"></div>';
    if(window.gameService && window.gameService.generateAvatarSVG) {
        const gameData = JSON.parse(localStorage.getItem('userGameData_temp')) || { avatar: { skin: '#e0ac69', shirt: '#3b82f6' } }; 
        avatarSvg = window.gameService.generateAvatarSVG(gameData.avatar);
    }

    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
            className: 'user-location-marker',
            // ADDED: marker-scalable wrapper
            html: `
                <div class="marker-scalable">
                    <div class="relative w-14 h-14">
                        <div class="absolute inset-0 bg-blue-500/30 rounded-full animate-ping"></div>
                        <div class="absolute inset-1 bg-white rounded-full border-4 border-blue-500 shadow-lg overflow-hidden flex items-center justify-center">
                            ${avatarSvg}
                        </div>
                        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow border border-white">
                            YOU
                        </div>
                    </div>
                </div>
            `,
            iconSize: [56, 56], 
            iconAnchor: [28, 28]
        }),
        zIndexOffset: 1000,
        interactive: false
    }).addTo(map);
    
    if(!window.initialZoomDone) {
        map.setView([location.lat, location.lng], 16);
        window.initialZoomDone = true;
    }
}

// --- EXPORT NEW FUNCTION ---
export function setUserMarkerScale(value) {
    localStorage.setItem('gt_map_scale', value);
    updateMarkerIconContentScaling();
}

export function getUserMarkerScale() {
    return parseFloat(localStorage.getItem('gt_map_scale') || "1.0");
}

// function so main.js can call it when slider moves
export function updateMarkerIconContentScaling() {
    if (!map) return;

    const currentZoom = map.getZoom();
    // Logic: Zoom 12 = 0.6x, Zoom 18 = 1.5x
    let zoomScale = (currentZoom - 12) * 0.15; 
    zoomScale = Math.max(0.6, Math.min(1.5, zoomScale)); 

    // Get User Preference
    const userSetting = parseFloat(localStorage.getItem('gt_map_scale') || "1.0");

    // Calculate Final Scale
    const finalScale = zoomScale * userSetting;

    // Apply to CSS Variable (Global control)
    document.documentElement.style.setProperty('--current-icon-scale', finalScale);

    // FIX: Target the new common class 'marker-scalable'
    const targets = document.querySelectorAll('.marker-scalable');
    targets.forEach(el => {
        el.style.transform = `scale(${finalScale})`;
        el.style.transition = 'transform 0.2s ease-out'; // Ensure smooth scaling
        el.style.transformOrigin = 'center center'; // Scale from center
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
            // ADDED: marker-scalable wrapper
            html: `
                <div class="marker-scalable" style="transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94); will-change: transform;">
                    <div class="relative w-12 h-12 hover:scale-110 transition-transform duration-200">
                        <div class="absolute inset-0 bg-gradient-to-br from-gold-400 to-yellow-600 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a10 10 0 1 0-10 10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
                        </div>
                        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur text-white text-[9px] px-1.5 rounded-full border border-white/20 shadow-sm whitespace-nowrap">
                            ${treasure.discount ? treasure.discount + '%' : '฿'}
                        </div>
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
        
        signMarkers.forEach(m => map.removeLayer(m));
        signMarkers = [];

        signs.forEach(sign => {
            const avatarSvg = window.gameService.generateAvatarSVG(sign.avatar);
            
            // --- FIX: เลือกข้อความที่จะแสดงตามประเภท ---
            let labelText = sign.message; // สำหรับ Normal
            if (sign.type === 'vote' || sign.type === 'poll') {
                labelText = sign.pollTitle; // สำหรับ Vote/Poll
            }
            // ป้องกัน undefined กรณีข้อมูลผิดพลาด
            if (!labelText) labelText = '...';

            // กำหนดไอคอนแสดงประเภทเล็กๆ (Emoji)
            let typeIcon = '💬';
            if (sign.type === 'vote') typeIcon = '🗳️';
            if (sign.type === 'poll') typeIcon = '📊';

            const icon = L.divIcon({
                className: 'custom-sign-marker',
                html: `
                    <div class="marker-scalable" style="transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94); will-change: transform;">
                        <div class="relative w-12 h-12">
                            <div class="absolute inset-0 bg-white rounded-full border-2 border-white shadow-md overflow-hidden">
                                ${avatarSvg}
                            </div>
                            <div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-gray-200 shadow-sm text-[10px] w-5 h-5 flex items-center justify-center">
                                ${typeIcon}
                            </div>
                            <!-- FIX: ใช้ labelText แทน sign.message และจำกัดความยาว -->
                            <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-2 py-0.5 rounded shadow text-[10px] font-bold whitespace-nowrap border border-gray-100 max-w-[120px] overflow-hidden text-ellipsis">
                                ${labelText}
                            </div>
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
        
        // อัปเดตขนาดไอคอนหลังจากโหลดเสร็จ
        updateMarkerIconContentScaling();
    } catch (error) {
        console.error("Load Signs Error", error);
    }
}

// FILE: js/mapManager.js

// FILE: js/mapManager.js


async function openSignModal(basicSignData) {
    ui.showLoadingMessage();
    
    // Reset State
    currentSignId = basicSignData._id;
    currentComments = [];
    currentSkip = 0;
    
    let sign;
    try {
        // Initial Fetch
        sign = await window.gameService.getSignDetails(currentSignId, 0, COMMENT_LIMIT);
        currentComments = sign.comments || [];
        totalCommentsCount = sign.totalComments || (sign.comments ? sign.comments.length : 0);
        currentSkip = sign.comments ? sign.comments.length : 0;
    } catch (e) {
        console.error(e);
        sign = basicSignData;
        sign.comments = []; 
    }
    ui.hideLoadingMessage();

    // TARGET ONLY THE CONTENT AREA (Do not touch Footer)
    const container = document.getElementById('view-sign-content');
    if (!container) return;

    const expiryDate = sign.expiresAt ? new Date(sign.expiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' }) : '-';

    // 1. GENERATE MAIN CONTENT
    let contentHtml = '';
    if (sign.type === 'normal') {
        contentHtml = `<div class="text-lg font-bold text-gray-800 leading-tight break-words">"${sign.message}"</div>`;
    } else {
        const pollOptions = sign.pollOptions || [];
        const totalVotes = pollOptions.reduce((sum, opt) => sum + (opt.count !== undefined ? opt.count : opt.voters.length), 0);
        const currentUserId = window.gameService.getCurrentUserId ? window.gameService.getCurrentUserId() : null;

        const optionsHtml = pollOptions.map((opt, idx) => {
            const count = opt.count !== undefined ? opt.count : opt.voters.length;
            const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
            
            let isVoted = false;
            if (sign.type === 'poll' && currentUserId) {
                isVoted = opt.voters.some(v => v.id === currentUserId);
            }
            
            const activeClass = isVoted ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:bg-gray-50';
            const barColor = isVoted ? 'bg-blue-500' : 'bg-gray-200';
            const textColor = isVoted ? 'text-blue-700' : 'text-gray-800';

            let avatarsHtml = '';
            if (sign.type === 'poll') {
                const maxShow = 5;
                avatarsHtml = opt.voters.slice(0, maxShow).map(v => `
                    <div class="w-5 h-5 rounded-full border border-white shadow-sm -ml-2 first:ml-0 bg-gray-200 overflow-hidden" title="Voter">
                        ${window.gameService.generateAvatarSVG(v.avatar)}
                    </div>
                `).join('');
                if (opt.voters.length > maxShow) avatarsHtml += `<span class="text-[9px] text-gray-400 ml-1 font-bold">+${opt.voters.length - maxShow}</span>`;
            }

            return `
                <div onclick="window.handleVoteClick('${sign._id}', ${idx})" class="relative cursor-pointer border rounded-lg p-2.5 mb-2 transition-all overflow-hidden ${activeClass}">
                    <div class="absolute top-0 left-0 h-full ${barColor} opacity-20 rounded-r-lg transition-all duration-500 ease-out" style="width: ${percent}%"></div>
                    <div class="relative z-10">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm font-bold ${textColor}">${opt.text}</span>
                            <div class="text-xs font-bold text-gray-500 flex items-center gap-1">
                                ${isVoted ? '<i data-lucide="check-circle" class="w-3.5 h-3.5 text-blue-600"></i>' : ''}
                                <span>${percent}%</span>
                                <span class="font-normal opacity-60 text-[10px]">(${count})</span>
                            </div>
                        </div>
                        <div class="flex items-center pl-1 h-4 min-h-[16px]"><div class="flex items-center">${avatarsHtml}</div></div>
                    </div>
                </div>
            `;
        }).join('');

        let addOptionHtml = '';
        if (sign.type === 'poll' && sign.pollOptions.length < 10) {
            addOptionHtml = `
                <div class="mt-3 flex gap-2 pt-2 border-t border-dashed border-gray-200">
                    <input type="text" id="new-poll-option" placeholder="เพิ่มตัวเลือก..." class="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 transition-all">
                    <button onclick="window.handleAddOption('${sign._id}')" class="bg-purple-100 text-purple-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-200 transition-colors">+ เพิ่ม</button>
                </div>
            `;
        }

        contentHtml = `
            <div class="mb-4">
                <div class="text-lg font-bold text-gray-800 leading-tight mb-1">${sign.pollTitle}</div>
                ${sign.pollDescription ? `<div class="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100 mb-3">${sign.pollDescription}</div>` : ''}
                <div class="space-y-1">${optionsHtml}</div>
                ${addOptionHtml}
                <div class="flex justify-between items-center text-[10px] text-gray-400 px-1 mt-3"><span>โหวตทั้งหมด: ${totalVotes} คน</span><span>หมดอายุ: ${expiryDate}</span></div>
            </div>
        `;
    }

    // 2. SETUP CONTENT LAYOUT
    let badge = sign.type === 'normal' ? 'bg-yellow-400' : (sign.type === 'vote' ? 'bg-green-500' : 'bg-purple-500');
    let badgeName = sign.type === 'normal' ? 'ประกาศ' : (sign.type === 'vote' ? 'โหวตลับ' : 'โพล');
    let bgHeader = sign.type === 'normal' ? 'bg-yellow-50/50 border-yellow-100' : (sign.type === 'vote' ? 'bg-green-50/50 border-green-100' : 'bg-purple-50/50 border-purple-100');

    container.innerHTML = `
        <div class="flex items-start gap-3 p-4 ${bgHeader} rounded-2xl border relative overflow-hidden mb-4">
            <div class="absolute top-0 right-0 w-20 h-20 ${badge.replace('bg-', 'bg-')}/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
            <div class="w-12 h-12 rounded-full bg-white border-2 border-white shadow-md overflow-hidden flex-shrink-0 z-10">${window.gameService.generateAvatarSVG(sign.avatar)}</div>
            <div class="z-10 w-full overflow-hidden">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[10px] font-bold ${badge} text-white px-2 py-0.5 rounded-full shadow-sm tracking-wide">${badgeName}</span>
                    <span class="text-xs text-gray-400 font-bold uppercase truncate">${sign.username || 'Guest'}</span>
                </div>
                ${contentHtml}
            </div>
        </div>
        
        <!-- Comment Header -->
        <div class="flex justify-between items-end mb-2 pt-2 border-t border-gray-100">
            <div class="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1"><i data-lucide="message-square" class="w-3 h-3"></i> ความคิดเห็น</div>
            <div class="flex items-center gap-2">
                <select id="comment-filter" onchange="window.handleCommentFilterChange()" class="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400 cursor-pointer">
                    <option value="newest" ${currentCommentSort === 'newest' ? 'selected' : ''}>ใหม่ที่สุด ▾</option>
                    <option value="oldest" ${currentCommentSort === 'oldest' ? 'selected' : ''}>เก่าที่สุด ▴</option>
                </select>
                <div class="text-[10px] text-gray-300" id="comment-count-display">${totalCommentsCount}</div>
            </div>
        </div>

        <!-- Comments List Container -->
        <div id="sign-comments-list" class="space-y-2 pb-2"></div>
        
        <!-- Load More Button -->
        <div id="load-more-container" class="text-center pt-2 pb-4 hidden">
            <button onclick="window.loadMoreComments()" class="text-xs font-bold text-gray-500 hover:text-blue-500 hover:underline transition-all">ดูความเห็นเพิ่มเติม...</button>
        </div>
    `;

    // 3. RENDER COMMENTS FUNCTION
    const renderCommentsList = (comments, append = false) => {
        const listContainer = document.getElementById('sign-comments-list');
        const loadMoreBtn = document.getElementById('load-more-container');

        if (!listContainer) return;
        if (!append) listContainer.innerHTML = ''; 

        if ((!comments || comments.length === 0) && !append) {
            listContainer.innerHTML = '<div class="flex flex-col items-center justify-center py-6 text-gray-300 opacity-60"><i data-lucide="message-circle" class="w-8 h-8 mb-2"></i><p class="text-xs">ยังไม่มีคอมเมนต์ เป็นคนแรกสิ!</p></div>';
            if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
            if(window.lucide) lucide.createIcons();
            return;
        }

        // Apply Sort
        if (currentCommentSort === 'newest') {
            comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else {
            comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        const html = comments.map((c) => {
            const avatarSvg = c.avatar ? window.gameService.generateAvatarSVG(c.avatar) : `<div class="w-full h-full bg-gray-200 flex items-center justify-center text-[8px]">?</div>`;
            const timeAgo = getTimeAgo(c.createdAt);
            return `
                <div class="flex gap-2 animate-fadeIn mb-3">
                    <div class="w-8 h-8 rounded-full border border-white shadow-sm overflow-hidden flex-shrink-0 bg-gray-100">${avatarSvg}</div>
                    <div class="bg-gray-50 p-2.5 rounded-2xl rounded-tl-none border border-gray-100 min-w-[120px] max-w-[85%]">
                        <div class="flex justify-between items-baseline mb-0.5">
                            <span class="font-bold text-gray-800 text-xs">${c.username}</span>
                            <span class="text-[9px] text-gray-400 font-light">${timeAgo}</span>
                        </div>
                        <p class="text-gray-600 text-sm break-words whitespace-normal leading-snug">${c.text}</p>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.insertAdjacentHTML('beforeend', html);

        // Load More Visibility Logic
        if (loadMoreBtn) {
            if (currentSkip < totalCommentsCount) loadMoreBtn.classList.remove('hidden');
            else loadMoreBtn.classList.add('hidden');
        }
        
        if(window.lucide) lucide.createIcons();
    };

    renderCommentsList(currentComments);

    // 4. LOAD MORE HANDLER
    window.loadMoreComments = async () => {
        const btn = document.querySelector('#load-more-container button');
        if(btn) { btn.innerText = 'กำลังโหลด...'; btn.disabled = true; }
        try {
            const nextBatch = await window.gameService.getSignDetails(currentSignId, currentSkip, COMMENT_LIMIT);
            if (nextBatch.comments.length > 0) {
                currentComments = [...currentComments, ...nextBatch.comments];
                currentSkip += nextBatch.comments.length;
                renderCommentsList(nextBatch.comments, true); 
            }
        } catch (e) { console.error(e); }
        finally { if(btn) { btn.innerText = 'ดูความเห็นเพิ่มเติม...'; btn.disabled = false; } }
    };

    // 5. SORT HANDLER
    window.handleCommentFilterChange = () => {
        const select = document.getElementById('comment-filter');
        currentCommentSort = select ? select.value : 'newest';
        renderCommentsList(currentComments, false); 
    };

    // 6. ATTACH HANDLERS
    // Button Logic: Get button from FOOTER (which is outside this container)
    const btn = document.getElementById('send-comment-btn');
    if (btn) {
        const newBtn = btn.cloneNode(true); 
        if(btn.parentNode) btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', async () => {
            if (!auth.isLoggedIn()) {
                const confirm = await ui.showConfirmLogin('กรุณาเข้าสู่ระบบเพื่อคอมเมนต์');
                if (confirm) ui.showModal('login-modal');
                return;
            }

            const input = document.getElementById('comment-input');
            const text = input ? input.value.trim() : '';
            if(!text) return;
            
            newBtn.disabled = true;
            try {
                const res = await window.gameService.postComment(currentSignId, text);
                if(res && res.success) {
                    if(input) input.value = ''; 
                    openSignModal({ _id: currentSignId }); // Reload
                }
            } catch (error) { console.error(error); } 
            finally { newBtn.disabled = false; }
        });
    }

    // Add Option Handler
    window.handleAddOption = async (signId) => {
        if (!auth.isLoggedIn()) {
            const confirm = await ui.showConfirmLogin('กรุณาเข้าสู่ระบบเพื่อเพิ่มตัวเลือก');
            if (confirm) ui.showModal('login-modal');
            return;
        }
        const input = document.getElementById('new-poll-option');
        const val = input ? input.value.trim() : '';
        if(!val) {
            if(input) { input.classList.add('border-red-500'); setTimeout(() => input.classList.remove('border-red-500'), 1000); }
            return;
        }
        try {
            const btn = input.nextElementSibling;
            const originalText = btn.innerText;
            btn.innerText = '...'; btn.disabled = true;
            const res = await window.gameService.addSignOption(signId, val);
            if(res.success) { openSignModal({ _id: signId }); } 
            else { alert(res.message); btn.innerText = originalText; btn.disabled = false; }
        } catch(e) { console.error(e); }
    };

    // Vote Handler
    window.handleVoteClick = async (signId, idx) => {
        if (!auth.isLoggedIn()) {
            const confirm = await ui.showConfirmLogin('กรุณาเข้าสู่ระบบเพื่อร่วมโหวต');
            if (confirm) ui.showModal('login-modal');
            return;
        }
        try {
            const res = await window.gameService.voteSign(signId, idx);
            if (res.success) { await loadSigns(); openSignModal({ _id: signId }); }
        } catch (e) { console.error(e); }
    };

    if(window.lucide) lucide.createIcons();
    ui.showModal('view-sign-modal');
}

// Helper: Time Ago
function getTimeAgo(dateString) {
    const diff = (new Date() - new Date(dateString)) / 1000;
    if (diff < 60) return 'เมื่อสักครู่';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาที`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.`;
    return `${Math.floor(diff / 86400)} วัน`;
}


export async function placeSign() {
    // --- 1. AUTH CHECK ---
    if (!auth.isLoggedIn()) {
        const confirm = await ui.showConfirmLogin('กรุณาเข้าสู่ระบบเพื่อปักป้ายประกาศ');
        if (confirm) ui.showModal('login-modal');
        return;
    }

    if (!window.selectedPositionMapClick) return ui.showInfoAlert('เลือกจุด', 'แตะบนแผนที่ก่อนครับ');
    
    // Get Selected Type & Duration
    const modal = document.getElementById('place-treasure-modal');
    const type = modal.dataset.signType || 'normal';
    const durationHours = parseInt(document.getElementById('sign-duration').value) || 24;

    let payload = {
        lat: window.selectedPositionMapClick.lat,
        lng: window.selectedPositionMapClick.lng,
        type: type,
        durationHours: durationHours
    };

    // Validation based on Type
    if (type === 'normal') {
        const msg = document.getElementById('sign-message').value.trim();
        if (!msg) return ui.showInfoAlert('ระบุข้อความ', 'กรุณาใส่ข้อความสั้นๆ');
        payload.message = msg;
    
    } else if (type === 'vote' || type === 'poll') {
        const titleId = type === 'vote' ? 'vote-title' : 'poll-title';
        const descId = type === 'vote' ? 'vote-desc' : null; 
        const optClass = type === 'vote' ? '.vote-opt' : '.poll-opt';

        const title = document.getElementById(titleId).value.trim();
        if (!title) return ui.showInfoAlert('ข้อมูลไม่ครบ', 'กรุณาระบุหัวข้อ');

        // CLEANUP: Collect only non-empty strings
        const rawOptions = [];
        document.querySelectorAll(optClass).forEach(input => {
            const val = input.value.trim();
            if(val !== "") rawOptions.push(val);
        });

        // Validate Count
        if (type === 'vote') {
            if (rawOptions.length < 2) return ui.showInfoAlert('ตัวเลือกน้อยไป', 'โหวตต้องมีอย่างน้อย 2 ตัวเลือก');
            if (rawOptions.length > 3) return ui.showInfoAlert('ตัวเลือกมากไป', 'โหวตได้สูงสุด 3 ตัวเลือก');
        }
        if (type === 'poll') {
            if (rawOptions.length < 2) return ui.showInfoAlert('ตัวเลือกน้อยไป', 'โพลต้องมีอย่างน้อย 2 ตัวเลือก');
        }

        payload.pollTitle = title;
        if(descId) payload.pollDescription = document.getElementById(descId).value.trim();
        payload.pollOptions = rawOptions;
    }

    try {
        const res = await window.gameService.postSign(payload);
        
        if(res.success) {
            ui.showSuccessAlert('สำเร็จ', res.message);
            ui.hideModal('place-treasure-modal');
            loadSigns();
            
            // Clear inputs
            document.getElementById('sign-message').value = '';
            document.getElementById('vote-title').value = '';
            if(document.getElementById('vote-desc')) document.getElementById('vote-desc').value = '';
            document.getElementById('poll-title').value = '';
            document.querySelectorAll('.vote-opt').forEach(el => el.value = '');
            
            // Reset poll options
            const pollContainer = document.getElementById('poll-options-container');
            if(pollContainer) {
                 pollContainer.innerHTML = `
                    <input type="text" class="poll-opt w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="ตัวเลือก 1">
                    <input type="text" class="poll-opt w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="ตัวเลือก 2">
                 `;
            }
        }
    } catch(e) {
        ui.showErrorAlert(e.message || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
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
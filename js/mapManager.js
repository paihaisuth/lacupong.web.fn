// js/mapManager.js

import * as L from 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';

import * as api from './api.js';
import * as auth from './auth.js';
import * as guest from './guestManager.js';
import * as ui from './uiManager.js';

import { resetAndSyncCurrentTime } from './timeTracker.js';

// --- MODULE STATE ---
let map;
let userLocation = null;
let treasureMarkers = [];
let selectedPosition = null;
let selectedTreasure = null;
let currentRole = 'placer'; // default role

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
    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
            className: 'user-location-divicon',
            html: '<div class="current-location-icon-content"></div>',
            iconSize: [BASE_USER_ICON_SIZE, BASE_USER_ICON_SIZE],
            iconAnchor: [BASE_USER_ICON_SIZE / 2, BASE_USER_ICON_SIZE]
        }),
        interactive: false
    }).addTo(map);
    map.setView([location.lat, location.lng], 18);
}

function updateMarkerIconContentScaling() {
    const currentZoom = map.getZoom();
    const zoomDifference = currentZoom - BASE_ZOOM;
    const scale = 1.0 + (zoomDifference * ZOOM_SCALE_FACTOR_PER_LEVEL);
    const finalScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    document.documentElement.style.setProperty('--current-icon-scale', finalScale);

    // Counter-scale the content inside the icons
    document.querySelectorAll('.treasure-icon-content, .current-location-icon-content').forEach(contentElement => {
        contentElement.style.transform = `scale(${finalScale})`;
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
        const marker = L.marker([treasure.lat, treasure.lng], {
            icon: L.divIcon({
                className: 'treasure-divicon',
                html: `<div class="treasure-icon-content">💰</div>`,
                iconSize: [BASE_TREASURE_ICON_SIZE, BASE_TREASURE_ICON_SIZE],
                iconAnchor: [BASE_TREASURE_ICON_SIZE / 2, BASE_TREASURE_ICON_SIZE / 2]
            })
        }).addTo(map);

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
        ui.showLoadingMessage(); // Show loading indicator
        
        try {
            await resetAndSyncCurrentTime(); 
            await loadTreasures(); 
        } catch (error) {
            console.error("Error during refresh process:", error);
            // Optionally show an error message to the user
        } finally {
            ui.hideLoadingMessage(); // Hide loading indicator regardless of success or failure
        }
    });
    document.getElementById('location-btn').addEventListener('click', () => {
        if (userLocation) map.setView([userLocation.lat, userLocation.lng], 18);
        else setupGeolocation();
    });

    document.getElementById('save-treasure').addEventListener('click', saveTreasure);
    document.getElementById('submit-proof').addEventListener('click', submitProof);
}
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
const BASE_TREASURE_ICON_SIZE = 24;
const BASE_USER_ICON_SIZE = 24;
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
            html: '<div class="current-location-icon-content">📍</div>',
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
    if (!auth.isLoggedIn() && !guest.canGuestPerformAction('place')) {
        return alert("คุณสามารถวางคูปองได้วันละ 1 ครั้งเท่านั้น (สำหรับผู้ใช้ทั่วไป)");
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
        return alert('กรุณาเลือกตำแหน่งบนแผนที่ และกรอกชื่อร้านกับภารกิจ');
    }

    treasureData.remainingBoxes = treasureData.totalBoxes;
    const saveButton = document.getElementById('save-treasure');
    saveButton.disabled = true;

    try {
        await api.createTreasure(treasureData);
        if (!auth.isLoggedIn()) guest.recordGuestAction('place');

        alert('วางคูปองสำเร็จ!');
        await loadTreasures();
        ui.resetTreasureForm();
        ui.hideModal('place-treasure-modal');
    } catch (error) {
        console.error("Error saving treasure:", error);
        alert("เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    } finally {
        saveButton.disabled = false;
    }
}

async function submitProof() {
    if (!auth.isLoggedIn() && !guest.canGuestPerformAction('open')) {
        return alert("คุณสามารถเปิดคูปองได้วันละ 1 ครั้งเท่านั้น (สำหรับผู้ใช้ทั่วไป)");
    }
    if (!selectedTreasure || !document.getElementById('proof-image').files.length) {
        return alert('กรุณาเลือกคูปองและอัปโหลดหลักฐาน');
    }
    const submitButton = document.getElementById('submit-proof');
    submitButton.disabled = true;

    try {
        await api.claimTreasure(selectedTreasure._id);
        if (!auth.isLoggedIn()) guest.recordGuestAction('open');

        displayDiscountCode();
        await loadTreasures();
        ui.resetProofForm();
    } catch (error) {
        console.error("Error submitting proof:", error);
        alert("เกิดข้อผิดพลาดในการส่งหลักฐาน: " + error.message);
    } finally {
        submitButton.disabled = false;
    }
}

function displayDiscountCode() {
    document.getElementById('discount-code-display').textContent = ui.generateDiscountCode();
    document.getElementById('shop-name-display').textContent = selectedTreasure.name || 'ไม่ระบุ';
    document.getElementById('mission-display').textContent = selectedTreasure.mission || 'ไม่ระบุ';
    document.getElementById('discount-display').textContent = selectedTreasure.discount ? `${selectedTreasure.discount}%` : `${selectedTreasure.discountBaht} บาท`;

    const file = document.getElementById('proof-image').files[0];
    if (file) {
        const proofImageElement = document.getElementById('proof-image-display');
        const reader = new FileReader();
        reader.onload = e => {
            proofImageElement.src = e.target.result;
            proofImageElement.style.display = 'block'; // Set image to visible
        };
        reader.readAsDataURL(file);
    }

    ui.hideModal('submit-proof-modal');
    ui.showModal('discount-code-modal');

    // Screenshot logic can stay as is
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
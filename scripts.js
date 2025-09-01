// ======================
// การตั้งค่าพื้นฐาน (Configuration)
// ======================
const BASE_URL = 'https://goldticket.up.railway.app';

// ======================
// ตัวแปรระดับโลก (Global Variables)
// ======================
let map;
let treasureMarkers = [];
let currentRole = 'placer';
let selectedPosition = null;
let selectedMarker = null;
let selectedTreasure = null;
let userLocation = null;
// Adjusted: Temporarily set defaultCenter to the problematic coupon's location for debugging
const defaultCenter = [19.02759179537163, 99.926775097847]; 


// ========================================================
// NEW: Icon Scaling Configuration (ปรับค่าให้เหมาะสม)
// ========================================================
// These define the *base size* of the L.divIcon container.
// The content inside will be scaled.
const BASE_TREASURE_ICON_SIZE = 24; // ขนาดกล่องคอนเทนเนอร์สำหรับไอคอนคูปอง
const BASE_USER_ICON_SIZE = 24;     // ขนาดกล่องสำหรับตำแหน่งผู้ใช้
const BASE_ZOOM = 14;               // Zoom level where icon content scale is 1.0 (no scaling)
const ZOOM_SCALE_FACTOR_PER_LEVEL = 0.15; // How much scale changes per zoom level difference
const MIN_SCALE = 0.25;             // Minimum allowed icon content scale
const MAX_SCALE = 2.5;              // Maximum allowed icon content scale


// ========================================================
//                    INITIALIZATION
// ========================================================

document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setupEventListeners();
    switchRole(currentRole, true); 
});

function initMap() {
    initializeMap();
    setupGeolocation(); // This will handle the initial view setting
    setupMapClickHandler();
}

// ========================================================
//                      MAP FUNCTIONS
// ========================================================

function initializeMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    // NEW: Add zoomend event listener after map is initialized
    map.on('zoomend', updateMarkerIconContentScaling);
}

function setupGeolocation() {
    if (!navigator.geolocation) {
        alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง");
        handleGeolocationError(); 
        return;
    }
    navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, { 
        enableHighAccuracy: true,
        timeout: 8000 
    });
}

function handleGeolocationSuccess(position) {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    updateUserLocationOnMap(userLocation); 
    hideLoadingMessage();
    loadTreasures().then(() => { 
        updateMarkerIconContentScaling(); // Call to set initial scale for all marker content
    });
}

function handleGeolocationError(error) {
    if (error) {
        console.warn("ข้อผิดพลาดการระบุตำแหน่ง:", error.message);
        alert("ไม่สามารถระบุตำแหน่งของคุณได้ จะแสดงแผนที่เริ่มต้นที่กรุงเทพฯ");
    }
    
    map.setView(defaultCenter, 16); 

    hideLoadingMessage();
    loadTreasures().then(() => { 
        updateMarkerIconContentScaling(); // Call to set initial scale for all marker content
    });
}


function updateUserLocationOnMap(location) {
    if (window.userMarker) map.removeLayer(window.userMarker);
    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({ 
            className: 'user-location-divicon', // Specific class for the outer divIcon
            html: '<div class="current-location-icon-content">📍</div>', // Inner content div
            iconSize: [BASE_USER_ICON_SIZE, BASE_USER_ICON_SIZE], // Make pin's container square
            iconAnchor: [BASE_USER_ICON_SIZE / 2, BASE_USER_ICON_SIZE] // Anchor at the bottom center of the container
        }),
        interactive: false
    }).addTo(map);
    map.setView([location.lat, location.lng], 18);
    updateMarkerIconContentScaling(); 
}

function setupMapClickHandler() {
    map.on('click', (event) => {
        if (currentRole === 'placer') {
            selectedPosition = event.latlng;
            showModal('place-treasure-modal');
        }
    });
}

// ========================================================
// NEW: ICON CONTENT SCALING FUNCTION
// ========================================================
function updateMarkerIconContentScaling() {
    const currentZoom = map.getZoom();
    const zoomDifference = currentZoom - BASE_ZOOM;
    let scale = 1.0 + (zoomDifference * ZOOM_SCALE_FACTOR_PER_LEVEL);

    const finalScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale)); 

    document.documentElement.style.setProperty('--current-icon-scale', finalScale);

    document.querySelectorAll('.treasure-icon-content, .current-location-icon-content').forEach(contentElement => {
        contentElement.style.transform = `scale(${finalScale})`;
    });
}


// ========================================================
//                  TREASURE/COUPON FUNCTIONS
// ========================================================

async function loadTreasures() {
    try {
        clearTreasureMarkers();
        console.log("Fetching treasures from:", `${BASE_URL}/api/treasures`);
        const response = await fetch(`${BASE_URL}/api/treasures`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        let treasures = await response.json();
        console.log("All treasures received from API (before frontend deduplication):", JSON.parse(JSON.stringify(treasures)));
        
        // NEW: Frontend Deduplication Step - Ensure each unique lat/lng has only one representation
        // (This addresses the scenario where backend sends multiple identical coupons for the same spot)
        const uniqueTreasuresMap = new Map();
        treasures.forEach(treasure => {
            // Ensure coordinates are valid before processing
            if (treasure.lat !== undefined && treasure.lng !== undefined && 
                typeof treasure.lat === 'number' && typeof treasure.lng === 'number' && 
                !isNaN(treasure.lat) && !isNaN(treasure.lng)) {
                
                const locationKey = `${treasure.lat},${treasure.lng}`;
                
                // If there's no treasure stored for this location key yet, add this one.
                // This means if multiple identical treasures come from backend for same lat/lng,
                // only the first one encountered will be used.
                if (!uniqueTreasuresMap.has(locationKey)) {
                    uniqueTreasuresMap.set(locationKey, treasure);
                }
                // If a treasure already exists for this location key, we keep the first one encountered.
                // We could also add logic here to aggregate `remainingBoxes` or `totalBoxes` if needed,
                // but for now, we just pick the first unique one.

            } else {
                console.warn("Skipping treasure from API response due to invalid or missing coordinates:", JSON.parse(JSON.stringify(treasure)));
            }
        });
        // Convert the Map back to an array of unique treasures
        let deduplicatedTreasures = Array.from(uniqueTreasuresMap.values());
        console.log("Treasures after frontend deduplication:", JSON.parse(JSON.stringify(deduplicatedTreasures)));


        // Filter treasures that still have remaining boxes greater than 0
        const filteredTreasures = deduplicatedTreasures.filter(t => t.remainingBoxes > 0); 
        console.log("Treasures after filtering for remainingBoxes > 0:", JSON.parse(JSON.stringify(filteredTreasures)));

        // groupTreasuresByLocation will now receive already deduplicated data,
        // so each locationKey should ideally have an Array(1) if there's only one coupon type per spot,
        // or Array(N) if there are N *different* coupons at the same precise lat/lng.
        const locationGroups = groupTreasuresByLocation(filteredTreasures); 
        console.log("Treasures grouped by location (after deduplication and filtering):", JSON.parse(JSON.stringify(locationGroups)));

        createTreasureMarkers(locationGroups);
        updateMarkerIconContentScaling();
    } catch (error) {
        console.error("Error loading treasures:", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลคูปอง: " + error.message);
    }
}

function clearTreasureMarkers() {
    treasureMarkers.forEach(marker => map.removeLayer(marker));
    treasureMarkers = [];
    console.log("Cleared existing treasure markers.");
}

function groupTreasuresByLocation(treasures) {
    const locationGroups = {};
    treasures.forEach(treasure => {
        const locationKey = `${treasure.lat},${treasure.lng}`;
        // Coordinate validation is done during deduplication, but a final check is good practice
        if (treasure.lat !== undefined && treasure.lng !== undefined && 
            typeof treasure.lat === 'number' && typeof treasure.lng === 'number' && 
            !isNaN(treasure.lat) && !isNaN(treasure.lng)) { 
            locationGroups[locationKey] = locationGroups[locationKey] || [];
            locationGroups[locationKey].push(treasure);
        } else {
            // This log should ideally not be hit if deduplication handled it correctly
            console.warn("Skipping treasure in groupTreasuresByLocation due to invalid or missing coordinates:", JSON.parse(JSON.stringify(treasure))); 
        }
    });
    return locationGroups;
}

function createTreasureMarkers(locationGroups) {
    let markersCreatedCount = 0;
    Object.values(locationGroups).forEach(treasureGroup => {
        const { lat, lng } = treasureGroup[0];
        
        // Final coordinate validation before marker creation
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
            console.warn("Skipping marker creation for group due to invalid coordinates (final check):", JSON.parse(JSON.stringify(treasureGroup[0])));
            return; 
        }

        console.log("Attempting to create marker for location:", { lat, lng }, "with", treasureGroup.length, "unique treasures. First treasure in group:", JSON.parse(JSON.stringify(treasureGroup[0])));
        const marker = L.marker([lat, lng], { icon: createTreasureIcon() }).addTo(map); 
        marker.on('click', () => {
            if (currentRole === 'hunter') {
                selectedMarker = marker;
                // If there are multiple *different* coupons at the same unique location (after deduplication),
                // we'll still pick the first one from the group to display details.
                selectedTreasure = treasureGroup[0]; 
                displayTreasureInfo(selectedTreasure);
                showModal('view-treasure-modal');
            }
        });
        treasureMarkers.push(marker);
        markersCreatedCount++;
    });
    console.log(`Total ${markersCreatedCount} markers created on map from ${Object.keys(locationGroups).length} location groups.`);
}

function createTreasureIcon() { 
    return L.divIcon({
        className: 'treasure-divicon', 
        html: `<div class="treasure-icon-content">💰</div>`, 
        iconSize: [BASE_TREASURE_ICON_SIZE, BASE_TREASURE_ICON_SIZE], 
        iconAnchor: [BASE_TREASURE_ICON_SIZE / 2, BASE_TREASURE_ICON_SIZE / 2] // Anchor at the center of the container
    });
}

function displayTreasureInfo(treasure) {
    if (!treasure) return;
    let discountText = treasure.discount ? `${treasure.discount}%` : `${treasure.discountBaht} บาท`;
    const infoHTML = `
        <p><strong>ชื่อร้าน:</strong> ${treasure.name || 'ไม่ระบุ'}</p>
        ${treasure.ig ? `<p><strong>IG:</strong> ${treasure.ig}</p>` : ''}
        ${treasure.face ? `<p><strong>Facebook:</strong> ${treasure.face}</p>` : ''}
        <hr>
        <p><strong>ภารกิจ:</strong> ${treasure.mission || 'ไม่ระบุ'}</p>
        <p><strong>รางวัล:</strong> ${discountText}</p>
        <hr>
        <p><strong>จำนวนคงเหลือ:</strong> ${treasure.remainingBoxes || 0} / ${treasure.totalBoxes || 1}</p>
    `;
    document.getElementById('treasure-info').innerHTML = infoHTML;
}

// ========================================================
//                   EVENT LISTENERS & UI
// ========================================================

function setupEventListeners() {
    document.getElementById('placer-btn').addEventListener('click', () => switchRole('placer'));
    document.getElementById('hunter-btn').addEventListener('click', () => switchRole('hunter'));
    document.getElementById('refresh-btn').addEventListener('click', loadTreasures);
    document.getElementById('location-btn').addEventListener('click', () => {
        if (userLocation) map.setView([userLocation.lat, userLocation.lng], 18);
        else setupGeolocation();
    });
    setupModalEventListeners();
    setupFormEventListeners();
    setupDiscountInputs();
}

function switchRole(role, isInitial = false) {
    if (!isInitial && currentRole === role) return;
    currentRole = role;
    document.querySelectorAll('.role-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });
    document.getElementById('switch-slider').style.left = role === 'placer' ? '2px' : '112px';
}

function setupModalEventListeners() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('close-btn') || e.target.classList.contains('btn-secondary')) {
                if (e.target.closest('#submit-proof-modal') && e.target.classList.contains('btn-secondary')) return;
                hideModal(modal.id);
            }
        });
    });
    document.getElementById('save-treasure').addEventListener('click', saveTreasure);
    document.getElementById('next-step').addEventListener('click', () => {
        hideModal('view-treasure-modal');
        showModal('submit-proof-modal');
    });
    document.querySelector('#submit-proof-modal .btn-secondary').addEventListener('click', () => {
        hideModal('submit-proof-modal');
        showModal('view-treasure-modal');
    });
    document.getElementById('submit-proof').addEventListener('click', submitProof);
    document.getElementById('close-code').addEventListener('click', () => hideModal('discount-code-modal'));
}

function setupFormEventListeners() {
    const uploadBox = document.getElementById('image-upload-box');
    const proofImageInput = document.getElementById('proof-image');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const preview = document.getElementById('proof-preview');
    uploadBox.addEventListener('click', () => { proofImageInput.click(); });
    proofImageInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                preview.src = event.target.result;
                preview.style.display = 'block';
                uploadPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
}

function setupDiscountInputs() {
    const discountPercent = document.getElementById('discount');
    const discountBaht = document.getElementById('discount-baht');
    discountPercent.addEventListener('input', () => { if (discountPercent.value) discountBaht.value = ''; });
    discountBaht.addEventListener('input', () => { if (discountBaht.value) discountPercent.value = ''; });
}

// ========================================================
//                MODAL & FORM ACTIONS
// ========================================================

function showModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show'); 
}

function hideModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

async function saveTreasure() {
    if (!selectedPosition) return alert('กรุณาเลือกตำแหน่งบนแผนที่');
    const name = document.getElementById('name').value.trim();
    const mission = document.getElementById('mission').value.trim();
    if (!name || !mission) return alert('กรุณากรอกชื่อร้านและภารกิจ');
    const discount = document.getElementById('discount').value;
    const discountBaht = document.getElementById('discount-baht').value;
    if (!discount && !discountBaht) return alert('กรุณากรอกส่วนลดอย่างน้อยหนึ่งช่อง');
    const totalBoxes = parseInt(document.getElementById('total-boxes').value) || 1;
    
    const saveButton = document.getElementById('save-treasure');
    saveButton.disabled = true; // Disable button immediately

    const treasureData = {
        lat: selectedPosition.lat, lng: selectedPosition.lng,
        placementDate: new Date().toISOString().split('T')[0],
        name, mission,
        ig: document.getElementById('ig').value.trim(),
        face: document.getElementById('face').value.trim(),
        discount: discount || null, discountBaht: discountBaht || null,
        totalBoxes: totalBoxes, remainingBoxes: totalBoxes,
    };
    
    try {
        const response = await fetch(`${BASE_URL}/api/treasures`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(treasureData)
        });
        if (!response.ok) throw new Error('Failed to save treasure');
        await loadTreasures();
        resetTreasureForm();
        hideModal('place-treasure-modal');
    } catch (error) {
        console.error("Error saving treasure:", error);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
        saveButton.disabled = false; // Re-enable button
    }
}

async function submitProof() {
    if (!selectedTreasure) return alert('ไม่พบคูปองที่เลือก');
    if (!document.getElementById('proof-image').files.length) return alert('กรุณาอัปโหลดรูปภาพหลักฐาน');
    
    const submitButton = document.getElementById('submit-proof');
    submitButton.disabled = true; // Disable button immediately

    try {
        await updateTreasureStatus();
        displayDiscountCode();
        await loadTreasures();
        resetProofForm();
    } catch (error) {
        console.error("Error submitting proof:", error);
        alert("เกิดข้อผิดพลาดในการส่งหลักฐาน");
    } finally {
        submitButton.disabled = false; // Re-enable button
    }
}

async function updateTreasureStatus() {
    const response = await fetch(`${BASE_URL}/api/treasures/${selectedTreasure._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $inc: { remainingBoxes: -1 } })
    });
    if (!response.ok) throw new Error('Failed to update treasure status');
}

function displayDiscountCode() {
    document.getElementById('discount-code-display').textContent = generateDiscountCode();
    document.getElementById('shop-name-display').textContent = selectedTreasure.name || 'ไม่ระบุ';
    document.getElementById('mission-display').textContent = selectedTreasure.mission || 'ไม่ระระบุ';
    document.getElementById('discount-display').textContent = selectedTreasure.discount ? `${selectedTreasure.discount}%` : `${selectedTreasure.discountBaht} บาท`;
    const file = document.getElementById('proof-image').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const finalImage = document.getElementById('proof-image-display');
            finalImage.src = event.target.result;
            finalImage.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    hideModal('submit-proof-modal');
    showModal('discount-code-modal');
    setTimeout(() => {
        const modalContent = document.querySelector('#discount-code-modal .modal-content');
        html2canvas(modalContent, { backgroundColor: getComputedStyle(modalContent).backgroundColor }).then(canvas => {
            const link = document.createElement('a');
            link.href = canvas.toDataURL("image/png");
            link.download = `คูปอง-${selectedTreasure.name}.png`;
            link.click();
        }).catch(err => console.error("เกิดข้อผิดพลาดในการแคปหน้าจอ:", err));
    }, 500);
}

// ========================================================
//                      HELPER FUNCTIONS
// ========================================================//

function hideLoadingMessage() { 
    const msg = document.getElementById('loading-message');
    if(msg) msg.style.display = 'none'; 
}

function resetTreasureForm() {
    ['name', 'ig', 'face', 'mission', 'discount', 'discount-baht'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('total-boxes').value = '1';
}

function resetProofForm() {
    document.getElementById('proof-image').value = '';
    const preview = document.getElementById('proof-preview');
    const placeholder = document.getElementById('upload-placeholder');
    preview.src = '';
    preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
}

function generateDiscountCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}
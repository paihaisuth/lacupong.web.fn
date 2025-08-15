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
const defaultCenter = [13.7563, 100.5018]; // Default to Bangkok

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
    // CHANGED: Initialize the map WITHOUT setting the view yet.
    // The view will be set after geolocation is attempted.
    map = L.map('map', { zoomControl: false, attributionControl: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);
}

function setupGeolocation() {
    if (!navigator.geolocation) {
        alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง");
        handleGeolocationError(); // Go to error handling to set default view
        return;
    }
    // Set a timeout to prevent waiting forever
    navigator.geolocation.getCurrentPosition(handleGeolocationSuccess, handleGeolocationError, { 
        enableHighAccuracy: true,
        timeout: 8000 // 8 seconds timeout
    });
}

function handleGeolocationSuccess(position) {
    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    updateUserLocationOnMap(userLocation); // This function sets the view to the user's location
    hideLoadingMessage();
    loadTreasures();
}

function handleGeolocationError(error) {
    if (error) {
        console.warn("ข้อผิดพลาดการระบุตำแหน่ง:", error.message);
        alert("ไม่สามารถระบุตำแหน่งของคุณได้ จะแสดงแผนที่เริ่มต้นที่กรุงเทพฯ");
    }
    
    // CHANGED: This is now the fallback for setting the initial view
    map.setView(defaultCenter, 16); // Set the default zoomed-in view HERE.

    hideLoadingMessage();
    loadTreasures();
}


function updateUserLocationOnMap(location) {
    if (window.userMarker) map.removeLayer(window.userMarker);
    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({ className: 'current-location-icon', html: '📍', iconSize: [24, 24], iconAnchor: [12, 24] }),
        interactive: false
    }).addTo(map);
    // This is the primary function to set the view when location is found
    map.setView([location.lat, location.lng], 18);
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
//                  TREASURE/COUPON FUNCTIONS
// ========================================================

async function loadTreasures() {
    try {
        clearTreasureMarkers();
        const response = await fetch(`${BASE_URL}/api/treasures`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        let treasures = await response.json();
        treasures = treasures.filter(t => t.remainingBoxes > 0);
        const locationGroups = groupTreasuresByLocation(treasures);
        createTreasureMarkers(locationGroups);
    } catch (error) {
        console.error("Error loading treasures:", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลคูปอง");
    }
}

function clearTreasureMarkers() {
    treasureMarkers.forEach(marker => map.removeLayer(marker));
    treasureMarkers = [];
}

function groupTreasuresByLocation(treasures) {
    const locationGroups = {};
    treasures.forEach(treasure => {
        const locationKey = `${treasure.lat},${treasure.lng}`;
        locationGroups[locationKey] = locationGroups[locationKey] || [];
        locationGroups[locationKey].push(treasure);
    });
    return locationGroups;
}

function createTreasureMarkers(locationGroups) {
    Object.values(locationGroups).forEach(treasureGroup => {
        const remainingBoxes = treasureGroup.reduce((sum, t) => sum + (t.remainingBoxes || 0), 0);
        if (remainingBoxes <= 0) return;
        const { lat, lng } = treasureGroup[0];
        const marker = L.marker([lat, lng], { icon: createTreasureIcon(remainingBoxes) }).addTo(map);
        marker.on('click', () => {
            if (currentRole === 'hunter') {
                selectedMarker = marker;
                selectedTreasure = treasureGroup.find(t => !t.claimed) || treasureGroup[0];
                displayTreasureInfo(selectedTreasure);
                showModal('view-treasure-modal');
            }
        });
        treasureMarkers.push(marker);
    });
}

function createTreasureIcon(count) {
    return L.divIcon({
        className: 'treasure-icon',
        html: `💰<span class="treasure-count">${count}</span>`,
        iconSize: [24, 24], iconAnchor: [12, 12]
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
    const treasureData = {
        lat: selectedPosition.lat, lng: selectedPosition.lng,
        placementDate: new Date().toISOString().split('T')[0],
        name, mission,
        ig: document.getElementById('ig').value.trim(),
        face: document.getElementById('face').value.trim(),
        discount: discount || null, discountBaht: discountBaht || null,
        totalBoxes: totalBoxes, remainingBoxes: totalBoxes,
    };
    const saveButton = document.getElementById('save-treasure');
    saveButton.disabled = true;
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
        saveButton.disabled = false;
    }
}

async function submitProof() {
    if (!selectedTreasure) return alert('ไม่พบคูปองที่เลือก');
    if (!document.getElementById('proof-image').files.length) return alert('กรุณาอัปโหลดรูปภาพหลักฐาน');
    const submitButton = document.getElementById('submit-proof');
    submitButton.disabled = true;
    try {
        await updateTreasureStatus();
        displayDiscountCode();
        await loadTreasures();
        resetProofForm();
    } catch (error) {
        console.error("Error submitting proof:", error);
        alert("เกิดข้อผิดพลาดในการส่งหลักฐาน");
    } finally {
        submitButton.disabled = false;
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
    document.getElementById('mission-display').textContent = selectedTreasure.mission || 'ไม่ระบุ';
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
// ========================================================

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
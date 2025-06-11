const BASE_URL = 'https://goldticket.up.railway.app';


// ======================
// ตัวแปรระดับโลก (Global Variables)
// ======================
let map; // ตัวแปรเก็บออบเจ็กต์แผนที่ Leaflet
let treasureMarkers = []; // อาร์เรย์เก็บ Marker ของสมบัติทั้งหมดบนแผนที่
let currentRole = 'placer'; // บทบาทปัจจุบัน ('placer' หรือ 'hunter')
let selectedPosition = null; // ตำแหน่งที่ผู้ใช้เลือกบนแผนที่ (ใช้ในโหมด placer)
let selectedMarker = null; // Marker ของสมบัติที่เลือก (ใช้ในโหมด hunter)
let selectedTreasure = null; // ข้อมูลสมบัติที่เลือก
let treasures = []; // อาร์เรย์เก็บข้อมูลสมบัติทั้งหมด
let userLocation = null; // ตำแหน่งปัจจุบันของผู้ใช้

// ======================
// ฟังก์ชันหลักสำหรับการเริ่มต้นแผนที่ (Main Map Initialization)
// ======================
function initMap() {
    initializeMap(); // ตั้งค่าแผนที่พื้นฐาน
    loadTreasuresFromStorage(); // โหลดข้อมูลสมบัติจาก localStorage
    setupGeolocation(); // ตั้งค่าการระบุตำแหน่ง
    setupMapClickHandler(); // ตั้งค่าการจัดการคลิกบนแผนที่
}

//เเสดงเเผนที่
function initializeMap() {
    // ตั้งค่าตำแหน่งกลางแผนที่ (พิกัดประเทศไทย)
    const defaultCenter = [15.8700, 100.9925];
    
    // สร้างแผนที่และตั้งค่ามุมมองเริ่มต้น
    map = L.map('map').setView(defaultCenter, 6);
    
    // เพิ่มแผ่นแผนที่จาก OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
}

//เเสดงคูปอง
function loadTreasuresFromStorage() {
    try {
        const storedTreasures = localStorage.getItem('treasures');
        if (storedTreasures) {
            treasures = JSON.parse(storedTreasures);
            
            // กรองข้อมูลสมบัติที่ไม่มีตำแหน่งหรือถูกเคลมแล้ว
            treasures = treasures.filter(t => 
                t && 
                typeof t.lat === 'number' && 
                typeof t.lng === 'number' &&
                !isNaN(t.lat) && 
                !isNaN(t.lng) &&
                (t.claimed === undefined || t.claimed === false)
            );
        }
    } catch (e) {
        console.error("เกิดข้อผิดพลาดในการโหลดสมบัติ:", e);
        treasures = [];
    }
}

/**
 * 3. ฟังก์ชันตั้งค่าการระบุตำแหน่ง
 * ใช้ Geolocation API เพื่อขอตำแหน่งปัจจุบันของผู้ใช้
 */
function setupGeolocation() {
    if (!navigator.geolocation) {
        alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง กำลังใช้ตำแหน่งเริ่มต้น");
        document.getElementById('loading-message').style.display = 'none';
        loadTreasures();
        return;
    }

    // ขอตำแหน่งปัจจุบัน (ใช้ความแม่นยำสูง, timeout 10 วินาที)
    navigator.geolocation.getCurrentPosition(
        handleGeolocationSuccess,
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

/**
 * 3.1 ฟังก์ชันจัดการเมื่อระบุตำแหน่งสำเร็จ
 * @param {Position} position - ตำแหน่งที่ได้จาก Geolocation API
 */
function handleGeolocationSuccess(position) {
    userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    
    updateUserLocationOnMap(userLocation);
    hideLoadingMessage();
    loadTreasures();
}

/**
 * 3.2 ฟังก์ชันจัดการเมื่อระบุตำแหน่งผิดพลาด
 * @param {GeolocationPositionError} error - ข้อผิดพลาดจากการระบุตำแหน่ง
 */
function handleGeolocationError(error) {
    console.warn("ข้อผิดพลาดการระบุตำแหน่ง:", error);
    alert("ไม่สามารถระบุตำแหน่งของคุณได้ กำลังใช้ตำแหน่งเริ่มต้น");
    hideLoadingMessage();
    loadTreasures();
}

/**
 * 4. ฟังก์ชันอัปเดตตำแหน่งผู้ใช้บนแผนที่
 * @param {Object} location - ตำแหน่งปัจจุบัน {lat, lng}
 */
function updateUserLocationOnMap(location) {
    // ลบ Marker เก่าถ้ามี
    if (window.userMarker) {
        map.removeLayer(window.userMarker);
    }
    
    // สร้าง Marker ใหม่สำหรับตำแหน่งปัจจุบัน (ไม่ให้คลิกได้)
    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
            className: 'current-location-icon',
            html: '📍', // ใช้อิโมจิเป็นไอคอน
            iconSize: [50, 50]
        }),
        interactive: false  // <<== ปิดการคลิก/โต้ตอบ
    }).addTo(map);

    // ย้ายมุมมองแผนที่ไปที่ตำแหน่งปัจจุบัน (ซูมระดับ 20)
    map.setView([location.lat, location.lng], 20);
}


/**
 * 5. ฟังก์ชันตั้งค่าการคลิกบนแผนที่
 * ตั้งค่าการจัดการเหตุการณ์เมื่อผู้ใช้คลิกบนแผนที่
 */
function setupMapClickHandler() {
    map.on('click', (event) => {
        if (currentRole === 'placer') {
            handleMapClickForPlacer(event);
        }
    });
}

/**
 * 5.1 ฟังก์ชันจัดการการคลิกสำหรับผู้วางสมบัติ
 * @param {LeafletEvent} event - เหตุการณ์คลิกบนแผนที่
 */
function handleMapClickForPlacer(event) {
    selectedPosition = event.latlng; // บันทึกตำแหน่งที่เลือก
    setCurrentDate(); // ตั้งค่าวันที่ปัจจุบันในฟอร์ม
    showPlaceTreasureModal(); // แสดงโมดอลสำหรับวางสมบัติ
}


//เเสดงคูปอง
async function loadTreasures() {
    try {
        clearTreasureMarkers(); // ลบเครื่องหมายสมบัติบนแผนที่ก่อน

        const response = await fetch(`${BASE_URL}/api/treasures`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        let treasures = await response.json();
        
        // กรองเฉพาะสมบัติที่มี remainingBoxes > 0
        treasures = treasures.filter(t => t.remainingBoxes > 0);
        
        const locationGroups = groupTreasuresByLocation(treasures); // กลุ่มข้อมูลสมบัติที่ตำแหน่งเดียวกัน
        createTreasureMarkers(locationGroups); // สร้างเครื่องหมายสมบัติบนแผนที่
    } catch (error) {
        console.error("Error loading treasures:", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลสมบัติ");
    }
}





/**
 * 6.1 ล้างเครื่องหมายสมบัติเก่า
 * ลบ Marker สมบัติทั้งหมดออกจากแผนที่
 */
function clearTreasureMarkers() {
    treasureMarkers.forEach(marker => map.removeLayer(marker));
    treasureMarkers = [];
}

/**
 * 6.2 จัดกลุ่มสมบัติตามตำแหน่ง
 * @param {Array} treasures - อาร์เรย์ของสมบัติทั้งหมด
 * @returns {Object} กลุ่มสมบัติที่ตำแหน่งเดียวกัน
 */
function groupTreasuresByLocation(treasures) {
    const locationGroups = {};
    
    treasures.forEach(treasure => {
        const locationKey = `${treasure.lat},${treasure.lng}`;
        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = [];
        }
        locationGroups[locationKey].push(treasure);
    });
    
    return locationGroups;
}

/**
 * สร้างเครื่องหมายสมบัติบนแผนที่
 * @param {Object} locationGroups - กลุ่มสมบัติที่ตำแหน่งเดียวกัน
 */
function createTreasureMarkers(locationGroups) {
    const usedPositions = new Set(); // ใช้เก็บตำแหน่งที่ใช้แล้ว เพื่อป้องกันซ้ำ

    Object.values(locationGroups).forEach(treasureGroup => {
        const remainingBoxes = treasureGroup.reduce((sum, t) => sum + (t.remainingBoxes || 0), 0);
        if (remainingBoxes <= 0) return;

        let lat = treasureGroup[0].lat;
        let lng = treasureGroup[0].lng;

        let key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;

        // ถ้าตำแหน่งถูกใช้แล้ว → ขยับตำแหน่งเล็กน้อยจนกว่าจะไม่ซ้ำ
        const maxAttempts = 10;
        let attempts = 0;
        while (usedPositions.has(key) && attempts < maxAttempts) {
            const offset = 0.0001;
            const randomLatOffset = (Math.random() - 0.5) * offset;
            const randomLngOffset = (Math.random() - 0.5) * offset;
            lat += randomLatOffset;
            lng += randomLngOffset;
            key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
            attempts++;
        }

        usedPositions.add(key); // บันทึกตำแหน่งที่ใช้แล้ว

        const marker = L.marker([lat, lng], {
            icon: createStackedIcon(remainingBoxes)
        }).addTo(map);

        marker.treasuresAtLocation = treasureGroup;

        marker.on('click', () => {
            if (currentRole === 'hunter') {
                handleTreasureMarkerClick(marker, treasureGroup);
            }
        });

        treasureMarkers.push(marker);
    });
}

/**
 * 6.4 จัดการเมื่อคลิกที่เครื่องหมายสมบัติ
 * @param {LeafletMarker} marker - Marker ที่ถูกคลิก
 * @param {Array} treasureGroup - กลุ่มสมบัติที่ตำแหน่งนี้
 */
function handleTreasureMarkerClick(marker, treasureGroup) {
    selectedMarker = marker;
    
    // หาสมบัติที่ยังไม่ถูกเคลม หรือใช้ตัวแรกเป็นค่าเริ่มต้น
    selectedTreasure = treasureGroup.find(t => !t.claimed) || treasureGroup[0];
    
    displayTreasureInfo(selectedTreasure);
    document.getElementById('view-treasure-modal').style.display = 'flex';
}


/**
 * เเสดงข้อมูลคูปอง
 * @param {Object} treasure - ข้อมูลสมบัติที่จะแสดง
 */
function displayTreasureInfo(treasure) {
    if (!treasure) return;
    
    let infoHTML = `
        <p><strong>วันที่วาง:</strong> ${treasure.placementDate || 'ไม่ระบุ'}</p>
        <p><strong>ชื่อร้าน:</strong> ${treasure.name || 'ไม่ระบุ'}</p>
    `;
    
    if (treasure.ig) infoHTML += `<p><strong>ไอจีร้าน:</strong> ${treasure.ig}</p>`;
    if (treasure.face) infoHTML += `<p><strong>เฟสร้าน:</strong> ${treasure.face}</p>`;
    
    // แสดงส่วนลด (ถ้ามี % ก็ใช้ %, ถ้าไม่มีให้แสดงเป็น บาท)
    let discountText = 'ไม่ระบุ';
    if (treasure.discount) {
        discountText = `${treasure.discount}%`;
    } else if (treasure.discountBaht) {
        discountText = `${treasure.discountBaht} บาท`;
    }

    infoHTML += `
        <p><strong>ภารกิจ:</strong> ${treasure.mission || 'ไม่ระบุ'}</p>
        <p><strong>ส่วนลด:</strong> ${discountText}</p>
        <p><strong>จำนวนคูปองที่เหลือ:</strong> ${treasure.remainingBoxes || 0}/${treasure.totalBoxes || 1}</p>
    `;
    
    document.getElementById('treasure-info').innerHTML = infoHTML;
}


/**
 * 8. สร้างไอคอนกล่องสมบัติ
 * @param {Number} count - จำนวนสมบัติที่ตำแหน่งนี้
 * @returns {L.DivIcon} ไอคอนสำหรับ Marker
 */
function createStackedIcon(count) {
    return L.divIcon({
        className: 'treasure-icon',
        html: `💰`, // ใช้อิโมจิเงินเป็นไอคอน
        iconSize: [20, 20]
    });
}

/**
 * 10. ฟังก์ชันย่อยช่วยเหลือ
 */
function hideLoadingMessage() {
    document.getElementById('loading-message').style.display = 'none';
}

function setCurrentDate() {
    document.getElementById('placement-date').valueAsDate = new Date();
}

function showPlaceTreasureModal() {
    document.getElementById('place-treasure-modal').style.display = 'flex';
}

// ======================
// การทำงานเมื่อหน้าเว็บโหลดเสร็จ (DOM Content Loaded)
// ======================
document.addEventListener('DOMContentLoaded', function() {
    initMap(); // เริ่มต้นแผนที่
    setupEventListeners(); // ตั้งค่าการจัดการเหตุการณ์
});

/**
 * ตั้งค่าการจัดการเหตุการณ์ต่างๆ
 */
function setupEventListeners() {
    // องค์ประกอบ DOM
    const placerBtn = document.getElementById('placer-btn');
    const hunterBtn = document.getElementById('hunter-btn');
    
    // การเปลี่ยนบทบาท
    placerBtn.addEventListener('click', () => switchRole('placer'));
    hunterBtn.addEventListener('click', () => switchRole('hunter'));
    
    // ตั้งค่าอีเวนต์สำหรับโมดอลต่างๆ
    setupModalEventListeners();
    setupFormEventListeners();
}

/**
 * สลับบทบาทระหว่างผู้วางและผู้ตามหาสมบัติ
 * @param {String} role - บทบาทใหม่ ('placer' หรือ 'hunter')
 */
function switchRole(role) {
    currentRole = role;
    
    // อัปเดต UI ตามบทบาท
    document.getElementById('placer-btn').classList.toggle('active', role === 'placer');
    document.getElementById('hunter-btn').classList.toggle('active', role === 'hunter');
}

/**
 * ตั้งค่าการจัดการเหตุการณ์สำหรับโมดอลทั้งหมด
 */
function setupModalEventListeners() {
    // ปุ่มปิดโมดอล
    document.getElementById('close-place-modal').addEventListener('click', () => hideModal('place-treasure-modal'));
    document.getElementById('close-view-modal').addEventListener('click', () => hideModal('view-treasure-modal'));
    document.getElementById('close-proof-modal').addEventListener('click', () => hideModal('submit-proof-modal'));
    document.getElementById('close-code-modal').addEventListener('click', () => hideModal('discount-code-modal'));
    
    // ปุ่มยกเลิก
    document.getElementById('cancel-place').addEventListener('click', () => hideModal('place-treasure-modal'));
    document.getElementById('cancel-view').addEventListener('click', () => hideModal('view-treasure-modal'));
    document.getElementById('cancel-proof').addEventListener('click', () => {
        hideModal('submit-proof-modal');
        showModal('view-treasure-modal');
    });
    document.getElementById('close-code').addEventListener('click', () => hideModal('discount-code-modal'));
    
    // ปุ่มดำเนินการ
    document.getElementById('save-treasure').addEventListener('click', saveTreasure);
    document.getElementById('next-step').addEventListener('click', () => {
        hideModal('view-treasure-modal');
        showModal('submit-proof-modal');
    });
    document.getElementById('submit-proof').addEventListener('click', submitProof);
}

/**
 * ตั้งค่าการจัดการเหตุการณ์สำหรับฟอร์ม
 */
function setupFormEventListeners() {
    // แสดงตัวอย่างรูปภาพหลักฐานเมื่อเลือกไฟล์
    document.getElementById('proof-image').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                document.getElementById('proof-preview').src = event.target.result;
                document.getElementById('proof-preview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

/**
 * ซ่อนโมดอล
 * @param {String} modalId - ID ของโมดอลที่จะซ่อน
 */
function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

/**
 * แสดงโมดอล
 * @param {String} modalId - ID ของโมดอลที่จะแสดง
 */
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}



//จัดการส่วนลด
function setupDiscountInputs() {
  const discountPercent = document.getElementById('discount');
  const discountBaht = document.getElementById('discount-baht');

  function validateInput(e) {
    let value = e.target.value;

    if (value < 0) {
      e.target.value = '';
      return;
    }

    if (value.includes('.')) {
      e.target.value = Math.floor(parseFloat(value));
    }
  }

  discountPercent.addEventListener('input', () => {
    if (discountPercent.value !== '') {
      discountBaht.value = '';
    }
    validateInput({ target: discountPercent });
  });

  discountBaht.addEventListener('input', () => {
    if (discountBaht.value !== '') {
      discountPercent.value = '';
    }
    validateInput({ target: discountBaht });
  });
}

//เรีกยกใช้จัดการส่วนลด
window.addEventListener('DOMContentLoaded', () => {
  setupDiscountInputs();
});


// วางคูปอง
async function saveTreasure() {
    const saveButton = document.getElementById('save-treasure');
    saveButton.disabled = true; // ปิดปุ่มชั่วคราว

    if (!selectedPosition) {
        alert('กรุณาเลือกตำแหน่งบนแผนที่ก่อน');
        saveButton.disabled = false;
        return;
    }

    // ดึงค่า discount ทั้งสองช่อง
    const discountPercentValue = document.getElementById('discount').value.trim();
    const discountBahtValue = document.getElementById('discount-baht').value.trim();

    console.log('Discount %:', discountPercentValue);
    console.log('Discount Baht:', discountBahtValue);

    const formData = {
        lat: selectedPosition.lat,
        lng: selectedPosition.lng,
        boxCount: parseInt(document.getElementById('total-boxes').value) || 1,
        name: document.getElementById('name').value.trim(),
        ig: document.getElementById('ig').value.trim(),
        face: document.getElementById('face').value.trim(),
        mission: document.getElementById('mission').value.trim(),
        discount: discountPercentValue,    // ส่วนลดเป็น %
        discountBaht: discountBahtValue,   // ส่วนลดเป็น บาท
        placementDate: document.getElementById('placement-date').value
    };

    console.log('Form Data:', formData);

    // ตรวจสอบฟอร์ม: ให้กรอกอย่างน้อย 1 ช่องส่วนลด (discount หรือ discountBaht)
    if (!(formData.name && formData.mission && formData.placementDate && (formData.discount || formData.discountBaht))) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงใส่ส่วนลดอย่างน้อยหนึ่งช่อง');
        saveButton.disabled = false;
        return;
    }

    // ป้องกันสแปม (ส่งซ้ำภายใน 1 วินาที)
    const currentTime = Date.now();
    if (saveTreasure.lastSubmitTime && currentTime - saveTreasure.lastSubmitTime < 1000) {
        saveButton.disabled = false;
        return;
    }
    saveTreasure.lastSubmitTime = currentTime;

    // ตรวจสอบข้อมูลพื้นฐานอีกครั้ง
    if (!formData.lat || !formData.lng || !formData.placementDate || !formData.name || !formData.mission) {
        saveButton.disabled = false;
        return;
    }

    // เตรียมข้อมูลสำหรับส่ง
    const treasureData = {
        lat: formData.lat,
        lng: formData.lng,
        placementDate: formData.placementDate,
        name: formData.name,
        ig: formData.ig,
        face: formData.face,
        mission: formData.mission,
        discount: formData.discount,       // ส่งทั้งสองช่องไปเลย
        discountBaht: formData.discountBaht,
        totalBoxes: formData.boxCount,
        remainingBoxes: formData.boxCount
    };

    console.log('Data to send:', treasureData);

    try {
        const response = await fetch(`${BASE_URL}/api/treasures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(treasureData)
        });

        console.log('Response status:', response.status);

        if (!response.ok) throw new Error('Failed to save treasure');

        // โหลดข้อมูลใหม่
        await loadTreasures();

        // รีเซ็ตฟอร์ม
        resetTreasureForm();

        // ปิด Modal
        hideModal('place-treasure-modal');

    } catch (error) {
        console.error("Error saving treasure:", error);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
        saveButton.disabled = false; // เปิดปุ่มอีกครั้ง
    }
}



/**
 * ปิด Modal หรือฟอร์มที่เปิดอยู่
 */
function closePlaceTreasureModal() {
    const modal = document.getElementById('place-treasure-modal');
    if (modal) {
        modal.style.display = 'none'; // ซ่อน Modal หรือฟอร์ม
    }
    
    // รีเซ็ตฟอร์ม (หากต้องการให้ฟอร์มกลับไปสู่ค่าเริ่มต้น)
    const form = modal.querySelector('form');
    if (form) {
        form.reset();
    }
}


/**
 * รีเซ็ตฟอร์มวางคูปอง
 */
function resetTreasureForm() {
    document.getElementById('name').value = '';
    document.getElementById('ig').value = '';
    document.getElementById('face').value = '';
    document.getElementById('mission').value = '';
    document.getElementById('discount').value = '';
    document.getElementById('discount-baht').value = '';
    document.getElementById('total-boxes').value = '1';
}

//ส่งหลักฐานภาพหลักฐาน
async function submitProof() {
    const submitButton = document.getElementById('submit-proof');
    submitButton.disabled = true; // ปิดปุ่มชั่วคราว

    if (!selectedTreasure) {
        alert('เกิดข้อผิดพลาด: ไม่พบสมบัติที่เลือก');
        submitButton.disabled = false; // เปิดปุ่มอีกครั้ง
        return;
    }

    if (!document.getElementById('proof-image').files?.[0]) {
        alert('กรุณาอัปโหลดรูปภาพหลักฐาน');
        submitButton.disabled = false; // เปิดปุ่มอีกครั้ง
        return;
    }

    try {
        await updateTreasureStatus();
        await loadTreasures();
        displayDiscountCode();
        resetProofForm();
    } catch (error) {
        console.error("Error submitting proof:", error);
        alert("เกิดข้อผิดพลาดในการส่งหลักฐาน");
    } finally {
        submitButton.disabled = false; // เปิดปุ่มอีกครั้งไม่ว่าจะสำเร็จหรือผิดพลาด
    }
}

//ใช้คูปอง
async function updateTreasureStatus() {
    try {
        const response = await fetch(`${BASE_URL}/api/treasures/${selectedTreasure._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                $inc: { remainingBoxes: -1 }
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update treasure status');
        }
        
        // อัปเดตข้อมูลในหน้าเว็บ
        selectedTreasure.remainingBoxes -= 1;
        
        // อัปเดตข้อมูลในอาร์เรย์ treasures
        const treasureIndex = treasures.findIndex(t => t._id === selectedTreasure._id);
        if (treasureIndex !== -1) {
            treasures[treasureIndex].remainingBoxes -= 1;
        }
        
        // ถ้าไม่มีกล่องเหลือแล้ว
        if (selectedTreasure.remainingBoxes <= 0) {
            // ลบ marker ออกจากแผนที่
            map.removeLayer(selectedMarker);
            
            // ลบออกจากอาร์เรย์ markers
            treasureMarkers = treasureMarkers.filter(m => m !== selectedMarker);
            
            // ลบออกจากอาร์เรย์ treasures
            treasures = treasures.filter(t => t._id !== selectedTreasure._id);
        }
    } catch (error) {
        console.error("Error updating treasure:", error);
        throw error;
    }
}

/**
 * 9. สร้างรหัสส่วนลดแบบสุ่ม
 * @returns {String} รหัสส่วนลด 8 ตัวอักษร
 */
function generateDiscountCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัวอักษรและตัวเลขที่ใช้
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}


//ส่งหลักฐานรหัสคูปองที่ได้รับ
function displayDiscountCode() {
    const discountCode = generateDiscountCode(); // 🔐 สร้างรหัสสุ่ม

    // แสดงข้อมูลร้าน
    document.getElementById('shop-name-display').textContent = selectedTreasure.name || 'ไม่ระบุ';
    document.getElementById('mission-display').textContent = selectedTreasure.mission || 'ไม่ระบุ';

    // ✅ ปรับให้แสดงส่วนลด % หรือ บาท ตามที่มีข้อมูล
    let discountText = 'ไม่ระบุ';
    if (selectedTreasure.discount) {
        discountText = `${selectedTreasure.discount}%`;
    } else if (selectedTreasure.discountBaht) {
        discountText = `${selectedTreasure.discountBaht} บาท`;
    }
    document.getElementById('discount-display').textContent = discountText;

    // 🆕 แสดงรหัสส่วนลด
    const discountCodeElement = document.getElementById('discount-code-display');
    if (discountCodeElement) {
        discountCodeElement.textContent = discountCode;
    } else {
        console.warn('ไม่พบ element สำหรับแสดงรหัสส่วนลด');
    }

    // แสดงรูปภาพหลักฐาน
    const file = document.getElementById('proof-image').files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        document.getElementById('proof-image-display').src = event.target.result;
        document.getElementById('proof-image-display').style.display = 'block';
    };
    reader.readAsDataURL(file);

    hideModal('submit-proof-modal');
    showModal('discount-code-modal');

    // ⏬ รอให้ modal เปิดแล้วค่อย capture
    setTimeout(() => {
        const targetElement = document.getElementById('discount-code-modal'); // หรือ container ที่ต้องการแคป

        html2canvas(targetElement).then(canvas => {
            // แปลง canvas เป็นรูป
            const image = canvas.toDataURL("image/png");

            // สร้างลิงก์ดาวน์โหลดอัตโนมัติ
            const downloadLink = document.createElement('a');
            downloadLink.href = image;
            downloadLink.download = 'รหัสคูปอง.png';
            downloadLink.click();
        }).catch(err => {
            console.error("เกิดข้อผิดพลาดในการแคปหน้าจอ:", err);
        });
    }, 1000); // รอ modal แสดงผล 1 วิ ก่อน capture
}


/**
 * รีเซ็ตฟอร์มส่งหลักฐาน
 */
function resetProofForm() {
    document.getElementById('proof-image').value = '';
    document.getElementById('proof-preview').style.display = 'none';
    document.getElementById('proof-preview').src = '';
}
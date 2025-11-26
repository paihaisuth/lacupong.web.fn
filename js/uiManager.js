export function showModal(modalId) {
    hideAllModals();
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        // Add subtle backdrop animation if needed
        const backdrop = modal.querySelector('div[class*="backdrop"]');
        if(backdrop) backdrop.style.opacity = '1';
    }
}

export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        const backdrop = modal.querySelector('div[class*="backdrop"]');
        if(backdrop) backdrop.style.opacity = '0';
    }
}

export function hideAllModals() {
    document.querySelectorAll('.modal.show').forEach(modal => {
        modal.classList.remove('show');
        const backdrop = modal.querySelector('div[class*="backdrop"]');
        if(backdrop) backdrop.style.opacity = '0';
    });
}


/**
 * Switch Role Function (Works with CSS Animation)
 * @param {string} role - 'placer' or 'hunter'
 */
export function switchRole(role) {
    // Get Elements
    const overlay = document.getElementById('role-loading-overlay');
    const loadingText = document.getElementById('role-loading-text');
    
    // --- 1. SHOW ANIMATION ---
    if (overlay) {
        // Force display flex
        overlay.style.display = 'flex';
        
        // Update Text (Thai)
        if (loadingText) {
            loadingText.textContent = role === 'hunter' 
                ? 'กำลังเข้าสู่โหมด "นักล่าสมบัติ"...' 
                : 'กำลังเข้าสู่โหมด "วางคูปอง"...';
        }

        // Re-initialize Icons (Important for the new Sparkle icon)
        if (window.lucide) {
            window.lucide.createIcons();
        }

        // Trigger Fade In
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
    }

    // --- 2. WAIT (1.5 Seconds) ---
    setTimeout(() => {
        
        // --- 3. PERFORM UI UPDATES ---
        const slider = document.getElementById('switch-slider');
        const placerBtn = document.getElementById('placer-btn');
        const hunterBtn = document.getElementById('hunter-btn');

        placerBtn.classList.remove('text-white');
        placerBtn.classList.add('text-gray-500'); 
        hunterBtn.classList.remove('text-white');
        hunterBtn.classList.add('text-gray-500'); 

        if (role === 'placer') {
            slider.style.transform = 'translateX(0)';
            placerBtn.classList.add('text-white');
            placerBtn.classList.remove('text-gray-500');
        } else {
            slider.style.transform = 'translateX(100%)'; 
            hunterBtn.classList.add('text-white');
            hunterBtn.classList.remove('text-gray-500');
        }

        // --- 4. HIDE ANIMATION ---
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300);
        }

    }, 1500);
}

export function hideLoadingMessage() {
    const msg = document.getElementById('loading-message');
    if(msg) msg.style.display = 'none';
}

export function showLoadingMessage() {
    const msg = document.getElementById('loading-message');
    if(msg) msg.style.display = 'flex';
}

export function resetTreasureForm() {
    ['name', 'ig', 'face', 'mission', 'discount', 'discount-baht'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('total-boxes').value = '1';
}

export function resetProofForm() {
    const proofImageInput = document.getElementById('proof-image');
    if (proofImageInput) proofImageInput.value = '';

    const preview = document.getElementById('proof-preview');
    const placeholder = document.getElementById('upload-placeholder');
    if(preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';
}

export function generateDiscountCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

/** 
 * HELPER: SweetAlert2 Custom Theme 
 * เพื่อให้ Popup ดูแพง เข้ากับ Tailwind + Gold Theme
 */
const swalCustom = Swal.mixin({
    customClass: {
        popup: 'rounded-3xl shadow-2xl border border-gray-100 font-sans',
        title: 'text-gray-800 text-xl font-bold',
        htmlContainer: 'text-gray-600',
        confirmButton: 'px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-600 text-white rounded-xl font-semibold shadow-lg shadow-gold-400/30 hover:shadow-gold-400/50 transition-all transform active:scale-95 mx-2',
        cancelButton: 'px-6 py-3 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-xl font-medium transition-colors mx-2',
        actions: 'mt-4 gap-2'
    },
    buttonsStyling: false, // ปิด Style เดิมของ SweetAlert เพื่อใช้ Tailwind เต็มที่
    reverseButtons: true   // เอาปุ่มยืนยันไว้ขวา (UX สมัยใหม่)
});

export function showSuccessAlert(title, text) {
    return swalCustom.fire({
        icon: 'success',
        title: title,
        text: text,
        timer: 2000, // ปิดเองใน 2 วิ
        showConfirmButton: false,
        timerProgressBar: true
    });
}

export function showErrorAlert(text) {
    return swalCustom.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: text,
        confirmButtonText: 'ตกลง'
    });
}

export function showInfoAlert(title, text) {
    return swalCustom.fire({
        icon: 'info',
        title: title,
        text: text,
        confirmButtonText: 'รับทราบ'
    });
}

// ใช้สำหรับกรณี Guest Limit แล้วชวนให้ Login
export async function showConfirmLogin(text) {
    const result = await swalCustom.fire({
        icon: 'warning',
        title: 'จำกัดสิทธิ์การใช้งาน',
        text: text,
        showCancelButton: true,
        confirmButtonText: 'เข้าสู่ระบบ',
        cancelButtonText: 'ไว้ทีหลัง'
    });
    return result.isConfirmed;
}
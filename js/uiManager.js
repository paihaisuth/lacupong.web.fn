export function showModal(modalId) { 
    hideAllModals(); // Ensure no other modals are open
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show'); 
}

export function hideModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

export function hideAllModals() {
    document.querySelectorAll('.modal.show').forEach(modal => {
        modal.classList.remove('show');
    });
}

export function switchRole(role) {
    document.querySelectorAll('.role-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });
    document.getElementById('switch-slider').style.left = role === 'placer' ? '2px' : '112px';
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
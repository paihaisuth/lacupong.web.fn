// js/apiInterceptor.js

import { showModal, hideAllModals } from './uiManager.js';

// เก็บ state เพื่อป้องกันการแสดง modal ซ้ำซ้อน
let isModalVisible = false;

/**
 * ตั้งค่าการดักจับ (interceptor) สำหรับทุก request ของ jQuery AJAX
 */
export function setupApiInterceptor() {
    $(document).ajaxError((event, jqXHR, ajaxSettings, thrownError) => {
        // ตรวจสอบ status code ที่บ่งชี้ว่า Token ไม่ถูกต้อง/หมดอายุ
        if ((jqXHR.status === 401 || jqXHR.status === 400) && !isModalVisible) {
            
            const responseText = jqXHR.responseText || '';
            if (responseText.includes('token') || responseText.includes('Access denied')) {
                
                console.warn('API Interceptor: Detected invalid/expired token. Status:', jqXHR.status);
                isModalVisible = true;
                
                hideAllModals(); 
                showModal('session-expired-modal'); 

                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');

                const reloginBtn = document.getElementById('relogin-btn');
                if (reloginBtn && !reloginBtn.dataset.listenerAttached) {
                    reloginBtn.addEventListener('click', () => {
                        localStorage.setItem('showLoginModalOnLoad', 'true');
                        
                        // Reload the page to reset the app state
                        window.location.reload(); 
                    });
                    reloginBtn.dataset.listenerAttached = 'true';
                }
            }
        }
    });
}
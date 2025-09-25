// js/timeTracker.js

import { logUserTimeSpent, logVisitorTimeSpent } from './api.js';
import { isLoggedIn } from './auth.js';

const STORAGE_KEY = 'unsentTimeSpent'; // Key สำหรับเก็บข้อมูลใน localStorage
const SAVE_INTERVAL = 1000; // บันทึกเวลาลง localStorage ทุกๆ 1 วินาที (1000ms)
const MIN_TIME_TO_LOG = 3; // จะส่ง API ก็ต่อเมื่อมีเวลาสะสมอย่างน้อย 3 วินาที

let startTime = null;       // เวลาที่เริ่มจับเวลา (เมื่อ tab active)
let accumulatedTime = 0;    // เวลาที่สะสมไว้แล้ว (ms) จากช่วงก่อนหน้า
let intervalId = null;      // ID ของ setInterval เพื่อใช้ยกเลิก

/**
 * เริ่มนับเวลาเมื่อ tab กลับมา focus
 */
function startTracking() {
    // ถ้ากำลังนับอยู่แล้ว ไม่ต้องทำอะไร
    if (startTime) return;

    //console.log('Time tracking started (tab is active).');
    startTime = Date.now();

    // ตั้ง interval ให้บันทึกเวลาลง localStorage เป็นระยะ
    intervalId = setInterval(saveTimeToStorage, SAVE_INTERVAL);
}

/**
 * หยุดนับเวลาเมื่อ tab ไม่ได้ focus
 */
function stopTracking() {
    // ถ้าไม่ได้นับอยู่ ไม่ต้องทำอะไร
    if (!startTime) return;

    //console.log('Time tracking paused (tab is hidden).');
    const elapsed = Date.now() - startTime;
    accumulatedTime += elapsed;
    startTime = null;

    // ยกเลิก interval และบันทึกเวลาล่าสุด
    clearInterval(intervalId);
    intervalId = null;
    saveTimeToStorage(); // บันทึกครั้งสุดท้ายเมื่อ-tab-ถูกซ่อน
}

/**
 * บันทึกเวลาที่สะสมทั้งหมดลงใน localStorage
 */
function saveTimeToStorage() {
    let totalTime = accumulatedTime;
    if (startTime) {
        // ถ้านับเวลาอยู่ ให้รวมเวลาปัจจุบันเข้าไปด้วย
        totalTime += (Date.now() - startTime);
    }
    localStorage.setItem(STORAGE_KEY, Math.round(totalTime));
    // //console.log(`Time saved to storage: ${Math.round(totalTime / 1000)}s`);
}

/**
 * ตรวจสอบและส่งข้อมูลเวลาที่ค้างอยู่ใน localStorage จาก session ที่แล้ว
 */
async function syncUnsentTime() {
    const unsentTimeMs = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    const durationSeconds = Math.round(unsentTimeMs / 1000);

    if (durationSeconds < MIN_TIME_TO_LOG) {
        // ถ้าน้อยเกินไป ให้ลบทิ้งเลย ไม่ต้องส่ง
        localStorage.removeItem(STORAGE_KEY);
        return;
    }

    //console.log(`Found ${durationSeconds}s of unsent time from previous session. Syncing...`);

    try {
        // เลือก API endpoint ตามสถานะ login
        if (isLoggedIn()) {
            await logUserTimeSpent(durationSeconds);
        } else {
            await logVisitorTimeSpent(durationSeconds);
        }

        //console.log(`Successfully synced ${durationSeconds}s.`);
        // เมื่อส่งสำเร็จ ให้ลบข้อมูลออกจาก localStorage
        localStorage.removeItem(STORAGE_KEY);

    } catch (error) {
        console.error("Failed to sync time. Will retry on next page load.", error);
        // หากส่งไม่สำเร็จ ข้อมูลจะยังคงอยู่ใน localStorage เพื่อลองใหม่ครั้งหน้า
    }
}

/**
 * หยุดจับเวลาปัจจุบัน, ส่งข้อมูลที่สะสม (ถ้าเกิน 3 วินาที), รีเซ็ตตัวนับ, และเริ่มจับเวลาใหม่
 * เหมาะสำหรับใช้เมื่อมีการกระทำที่ต้องการจบ session การนับเวลาปัจจุบันและเริ่มใหม่ (เช่น กด Refresh)
 */
export async function resetAndSyncCurrentTime() {
    // 1. หยุดการจับเวลาปัจจุบัน (คำนวณเวลาที่ใช้ไป, เพิ่มเข้า accumulatedTime, และบันทึกลง localStorage)
    stopTracking(); 

    // 2. พยายามส่งข้อมูลเวลาที่ค้างอยู่ใน localStorage ไปยัง API
    //    ฟังก์ชันนี้จะตรวจสอบ MIN_TIME_TO_LOG และลบข้อมูลออกจาก localStorage หากส่งสำเร็จ
    await syncUnsentTime();

    // 3. รีเซ็ตเวลาที่สะสมสำหรับ session ใหม่ให้เป็นศูนย์
    accumulatedTime = 0;

    // 4. เริ่มจับเวลาอีกครั้งทันที ถ้าหน้าเว็บกำลัง focus อยู่
    if (!document.hidden) {
        startTracking();
    }
}


/**
 * ฟังก์ชันหลักสำหรับเริ่มต้นการทำงานของ Time Tracker
 */
export async function initTimeTracker() {
    // 1. ส่งข้อมูลเก่าที่ค้างอยู่ (ถ้ามี)
    await syncUnsentTime();

    // 2. รีเซ็ตค่าสำหรับ session ปัจจุบัน
    accumulatedTime = 0;

    // 3. เพิ่ม event listener เพื่อตรวจจับการ focus/unfocus tab
    window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTracking();
        } else {
            startTracking();
        }
    });
    
    // 4. เพิ่ม event listener `pagehide` เป็นอีกหนึ่งตัวช่วยก่อนปิดหน้า
    // ทำงานได้ดีกว่า 'beforeunload' ในหลายกรณี
    window.addEventListener('pagehide', () => {
        stopTracking();
    });

    // 5. เริ่มนับเวลาทันทีถ้าหน้าเว็บโหลดมาแบบ focus อยู่แล้ว
    if (!document.hidden) {
        startTracking();
    }
}
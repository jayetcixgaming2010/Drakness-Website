// key.js
const API_URL = "https://drakness.netlify.app/.netlify/functions/api";
const hwid = localStorage.getItem("hwid");

// =============================
//     FETCH KEY FROM API
//==============================
async function fetchKeyInfo() {
    if (!hwid) {
        showNotification("Not Have HWID");
        return;
    }

    // Lấy tên key từ URL hoặc dùng mặc định "drakness"
    const urlParams = new URLSearchParams(window.location.search);
    const keyName = urlParams.get("name") || "drakness";

    const url = `${API_URL}/key/${keyName}?hwid=${encodeURIComponent(hwid)}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
            document.getElementById("keyDisplay").textContent = data.error || "Key not found or expired";
            document.getElementById("countdown").textContent = "";
            return;
        }

        document.getElementById("keyDisplay").textContent = data.key;

        if (data.expiresAt) {
            const expiry = new Date(data.expiresAt).getTime();
            const now = new Date().getTime();
            const secondsLeft = Math.max(0, Math.floor((expiry - now) / 1000));
            startCountdown(secondsLeft);
        }

        showNotification("Thank you for getting the key :>, please wait 30-50s for the key to work!");
    } catch (error) {
        console.error("Fetch error:", error);
        document.getElementById("keyDisplay").textContent = "Lỗi kết nối";
        showNotification("Lỗi kết nối đến server. Vui lòng thử lại sau.");
    }
}

// =============================
//         COUNTDOWN
// =============================
function startCountdown(secondsLeft) {
    const el = document.getElementById("countdown");

    function update() {
        if (secondsLeft <= 0) {
            el.textContent = "Key expired";
            clearInterval(interval);
            return;
        }

        const h = Math.floor(secondsLeft / 3600);
        const m = Math.floor((secondsLeft % 3600) / 60);
        const s = secondsLeft % 60;

        el.textContent = `Remaining Time: ${
            h.toString().padStart(2, "0")
        }:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

        secondsLeft--;
    }

    update();
    const interval = setInterval(update, 1000);
}

// =============================
//       COPY KEY BUTTON
// =============================
function copyKey() {
    const keyText = document.getElementById("keyDisplay").textContent;
    if (keyText && keyText !== "Don't have key" && keyText !== "Lỗi kết nối") {
        navigator.clipboard.writeText(keyText)
            .then(() => alert("Key has been copied!"))
            .catch(err => console.error("Error copying key:", err));
    } else {
        alert("Không có key để copy!");
    }
}

// =============================
//        NOTIFICATION
// =============================
function showNotification(message) {
    const notification = document.getElementById("notification");
    document.getElementById("notification-content").textContent = message;
    notification.style.display = "block";

    setTimeout(() => {
        notification.style.display = "none";
    }, 5000);
}

function closeNotification() {
    document.getElementById("notification").style.display = "none";
}

// =============================
//      AUTO LOAD ON START
// =============================
if (!hwid) {
    showNotification("Không tìm thấy HWID. Vui lòng truy cập đúng URL.");
} else {
    fetchKeyInfo();
}
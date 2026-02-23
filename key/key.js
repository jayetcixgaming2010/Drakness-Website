const API_URL = "https://api.ntt-hub.xyz"; 
const hwid = localStorage.getItem("hwid");

// =============================
//     FETCH KEY FROM API
// =============================
async function fetchKeyInfo() {
    if (!hwid) {
        showNotification("Not Have HWID");
        return;
    }

    const url = `${API_URL}?type=read&hwid=${hwid}`;
    const res = await fetch(url);

    const data = await res.json();

    if (data.status !== "success") {
        document.getElementById("keyDisplay").textContent = "Key not found or expired";
        document.getElementById("countdown").textContent = "";
        return;
    }

    // HIỂN THỊ KEY
    document.getElementById("keyDisplay").textContent = data.key;

    // BẮT ĐẦU ĐẾM NGƯỢC
    if (data.left != null) {
        startCountdown(data.left);
    }

    showNotification("Thank you for getting the key :>, please wait 30-50s for the key to work!");
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
    navigator.clipboard.writeText(keyText)
        .then(() => alert("Key has been copied!"))
        .catch(err => console.error("Error copying key:", err));
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
fetchKeyInfo();
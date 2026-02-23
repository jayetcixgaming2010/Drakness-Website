const API_BASE = '/api';

// Helper function
async function callAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw { status: response.status, ...data };
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN');
}

// Hiển thị lỗi
function showError(message) {
    const errorBox = document.getElementById('error');
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    
    setTimeout(() => {
        errorBox.classList.add('hidden');
    }, 5000);
}

// Xử lý lấy key
async function handleGetKey() {
    const keyName = document.getElementById('keyNameInput').value.trim();
    const hwid = document.getElementById('hwidInput').value.trim();
    
    if (!keyName || !hwid) {
        showError('Vui lòng nhập cả tên key và HWID');
        return;
    }
    
    const btn = document.getElementById('getKeyBtn');
    const result = document.getElementById('result');
    const keyDisplay = document.getElementById('keyDisplay');
    const expiryDisplay = document.getElementById('expiryDisplay');
    const statusDisplay = document.getElementById('statusDisplay');
    
    try {
        btn.disabled = true;
        btn.textContent = 'Đang xử lý...';
        result.classList.add('hidden');
        
        // Gọi API với format /key/ten-key?hwid=YOUR_HWID
        const data = await callAPI(`/key/${encodeURIComponent(keyName)}?hwid=${encodeURIComponent(hwid)}`);
        
        if (data.success) {
            keyDisplay.textContent = data.key;
            expiryDisplay.textContent = `Hết hạn: ${formatDate(data.expiresAt)}`;
            statusDisplay.textContent = `Trạng thái: ${data.status === 'assigned' ? 'Đã gán' : 'Khả dụng'}`;
            
            result.classList.remove('hidden');
        }
    } catch (error) {
        if (error.code === 'ALREADY_ASSIGNED') {
            showError('Key này đã được gán cho HWID khác');
        } else if (error.code === 'KEY_NOT_FOUND') {
            showError('Key không tồn tại hoặc đã hết hạn');
        } else if (error.code === 'INVALID_HWID') {
            showError('HWID không hợp lệ. Chỉ dùng chữ, số, - _ và độ dài 8-50 ký tự');
        } else {
            showError(error.error || 'Có lỗi xảy ra');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Get Key';
    }
}

// Kiểm tra key
async function handleCheckKey() {
    const keyName = document.getElementById('checkKeyName').value.trim();
    
    if (!keyName) {
        alert('Vui lòng nhập tên key');
        return;
    }
    
    const btn = document.getElementById('checkKeyBtn');
    const result = document.getElementById('checkResult');
    
    try {
        btn.disabled = true;
        btn.textContent = 'Đang kiểm tra...';
        
        const data = await callAPI(`/check-key/${encodeURIComponent(keyName)}`);
        
        if (data.valid) {
            let statusHtml = '';
            if (data.isExpired) {
                statusHtml = '<p class="expired">Key đã hết hạn</p>';
            } else {
                statusHtml = `
                    <p><strong>Trạng thái:</strong> ${data.status === 'assigned' ? 'Đã gán cho HWID' : 'Chưa gán'}</p>
                    ${data.assignedTo ? `<p><strong>Gán cho HWID:</strong> ${data.assignedTo}</p>` : ''}
                    <p><strong>Ngày tạo:</strong> ${formatDate(data.createdAt)}</p>
                    <p><strong>Hết hạn:</strong> ${formatDate(data.expiresAt)}</p>
                `;
            }
            
            result.innerHTML = statusHtml;
            result.className = 'result-box valid';
        }
    } catch (error) {
        result.innerHTML = `<p class="error">Key không tồn tại</p>`;
        result.className = 'result-box invalid';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kiểm tra';
        result.classList.remove('hidden');
    }
}

// Event listeners
document.getElementById('getKeyBtn').addEventListener('click', handleGetKey);
document.getElementById('checkKeyBtn').addEventListener('click', handleCheckKey);

// Enter key support
document.getElementById('keyNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleGetKey();
});
document.getElementById('hwidInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleGetKey();
});
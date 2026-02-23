const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Hàm tạo key ngẫu nhiên
function generateKey() {
    return 'DARK-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

// Hàm lấy IP
function getClientIP(event) {
    return event.headers['x-forwarded-for'] || 
           event.headers['client-ip'] || 'unknown';
}

// Hàm validate HWID (chỉ cho phép chữ, số, - _)
function validateHWID(hwid) {
    return /^[a-zA-Z0-9\-_]+$/.test(hwid) && hwid.length >= 8 && hwid.length <= 50;
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        await client.connect();
        const db = client.db('drakness_db');
        const keysCollection = db.collection('keys');
        const logsCollection = db.collection('logs');

        const path = event.path.replace('/.netlify/functions/api', '');
        const method = event.httpMethod;
        const ip = getClientIP(event);

        // ===== API: GET /key/:keyName =====
        // Format: /key/ten-key?hwid=YOUR_HWID
        if (path.startsWith('/key/') && method === 'GET') {
            const keyName = path.replace('/key/', '');
            const hwid = event.queryStringParameters?.hwid;

            // Kiểm tra tham số
            if (!keyName || !hwid) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Thiếu thông tin key hoặc HWID',
                        code: 'MISSING_PARAMS'
                    })
                };
            }

            // Validate HWID
            if (!validateHWID(hwid)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'HWID không hợp lệ (chỉ chấp nhận chữ, số, - _ và độ dài 8-50 ký tự)',
                        code: 'INVALID_HWID'
                    })
                };
            }

            // Tìm key trong database
            const keyDoc = await keysCollection.findOne({ 
                name: keyName,
                expiresAt: { $gt: new Date() }
            });

            // Log truy cập
            await logsCollection.insertOne({
                type: 'access',
                keyName,
                hwid,
                ip,
                timestamp: new Date(),
                found: !!keyDoc
            });

            // Key không tồn tại hoặc đã hết hạn
            if (!keyDoc) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Key không tồn tại hoặc đã hết hạn',
                        code: 'KEY_NOT_FOUND'
                    })
                };
            }

            // Key đã được gán cho HWID khác
            if (keyDoc.assignedTo && keyDoc.assignedTo !== hwid) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Key này đã được gán cho HWID khác',
                        code: 'ALREADY_ASSIGNED'
                    })
                };
            }

            // Key chưa được gán - gán cho HWID này
            if (!keyDoc.assignedTo) {
                await keysCollection.updateOne(
                    { name: keyName },
                    { 
                        $set: { 
                            assignedTo: hwid,
                            assignedAt: new Date(),
                            status: 'assigned'
                        }
                    }
                );
                
                await logsCollection.insertOne({
                    type: 'assign',
                    keyName,
                    hwid,
                    ip,
                    timestamp: new Date()
                });
            }

            // Trả về key cho user
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    key: keyDoc.key,
                    name: keyDoc.name,
                    expiresAt: keyDoc.expiresAt,
                    status: 'assigned',
                    message: 'Key đã được gán thành công cho HWID của bạn'
                })
            };
        }

        // ===== API: POST /api/create-key =====
        if (path === '/create-key' && method === 'POST') {
            const { name, duration = 24 } = JSON.parse(event.body);
            
            if (!name || !/^[a-zA-Z0-9\-]+$/.test(name)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Tên key không hợp lệ (chỉ chấp nhận chữ, số và -)'
                    })
                };
            }

            // Kiểm tra key đã tồn tại
            const existing = await keysCollection.findOne({ name });
            if (existing) {
                return {
                    statusCode: 409,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Tên key đã tồn tại'
                    })
                };
            }

            // Tạo key mới
            const keyData = {
                name: name,
                key: generateKey(),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
                assignedTo: null,
                assignedAt: null,
                status: 'available'
            };

            await keysCollection.insertOne(keyData);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Key đã được tạo',
                    key: keyData
                })
            };
        }

        // ===== API: GET /api/check-key/:name =====
        if (path.startsWith('/check-key/') && method === 'GET') {
            const keyName = path.replace('/check-key/', '');
            
            const keyDoc = await keysCollection.findOne({ name: keyName });
            
            if (!keyDoc) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ 
                        valid: false,
                        error: 'Key không tồn tại'
                    })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    valid: true,
                    name: keyDoc.name,
                    status: keyDoc.status,
                    assignedTo: keyDoc.assignedTo,
                    createdAt: keyDoc.createdAt,
                    expiresAt: keyDoc.expiresAt,
                    isExpired: new Date() > keyDoc.expiresAt
                })
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'API không tồn tại' })
        };

    } catch (error) {
        console.error('Lỗi:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Lỗi server: ' + error.message 
            })
        };
    } finally {
        await client.close();
    }
};
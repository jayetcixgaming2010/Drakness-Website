const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

function generateKey() {
    return 'DARK-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function getClientIP(event) {
    return event.headers['x-forwarded-for'] || 
           event.headers['client-ip'] || 'unknown';
}

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
        const userStepsCollection = db.collection('user_steps');

        const path = event.path.replace('/.netlify/functions/api', '');
        const method = event.httpMethod;
        const ip = getClientIP(event);

        // GET /key/:keyName
        if (path.startsWith('/key/') && method === 'GET') {
            const keyName = path.replace('/key/', '');
            const hwid = event.queryStringParameters?.hwid;

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

            const keyDoc = await keysCollection.findOne({ 
                name: keyName,
                expiresAt: { $gt: new Date() }
            });

            await logsCollection.insertOne({
                type: 'access',
                keyName,
                hwid,
                ip,
                timestamp: new Date(),
                found: !!keyDoc
            });

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

        // POST /create-key
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

        // GET /check-key/:name
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

        // POST /step1
        if (path === '/step1' && method === 'POST') {
            const { hwid } = JSON.parse(event.body);
            
            if (!hwid) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'Thiếu HWID' 
                    })
                };
            }

            if (!validateHWID(hwid)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'HWID không hợp lệ'
                    })
                };
            }

            await userStepsCollection.updateOne(
                { hwid: hwid },
                { 
                    $set: { 
                        step1_completed: true, 
                        step1_time: new Date(),
                        last_update: new Date()
                    } 
                },
                { upsert: true }
            );

            await logsCollection.insertOne({
                type: 'step1_complete',
                hwid,
                ip,
                timestamp: new Date()
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Step 1 completed' 
                })
            };
        }

        // POST /step2
        if (path === '/step2' && method === 'POST') {
            const { hwid, hash } = JSON.parse(event.body);
            
            if (!hwid || !hash) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'Thiếu thông tin' 
                    })
                };
            }

            if (!validateHWID(hwid)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'HWID không hợp lệ'
                    })
                };
            }

            const userStep = await userStepsCollection.findOne({ hwid: hwid });
            
            if (!userStep || !userStep.step1_completed) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'step1_not_done',
                        message: 'Bạn chưa hoàn thành Step 1'
                    })
                };
            }

            const isValidHash = hash && hash.length > 10;

            if (!isValidHash) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'invalid_hash',
                        message: 'Hash không hợp lệ'
                    })
                };
            }

            await userStepsCollection.updateOne(
                { hwid: hwid },
                { 
                    $set: { 
                        step2_completed: true, 
                        step2_hash: hash, 
                        step2_time: new Date(),
                        last_update: new Date()
                    } 
                },
                { upsert: true }
            );

            await logsCollection.insertOne({
                type: 'step2_complete',
                hwid,
                hash,
                ip,
                timestamp: new Date()
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Step 2 completed' 
                })
            };
        }

        // POST /step3
        if (path === '/step3' && method === 'POST') {
            const { hwid, hash } = JSON.parse(event.body);
            
            if (!hwid || !hash) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'Thiếu thông tin' 
                    })
                };
            }

            if (!validateHWID(hwid)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'HWID không hợp lệ'
                    })
                };
            }

            const userStep = await userStepsCollection.findOne({ hwid: hwid });
            
            if (!userStep || !userStep.step1_completed || !userStep.step2_completed) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'bypass_detected',
                        message: 'Phát hiện bypass! Tiến trình đã bị reset.'
                    })
                };
            }

            if (userStep.step2_hash !== hash) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'invalid_hash',
                        message: 'Hash không hợp lệ'
                    })
                };
            }

            const existingKey = await keysCollection.findOne({ 
                assignedTo: hwid,
                expiresAt: { $gt: new Date() }
            });

            if (existingKey) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        key: existingKey.key,
                        expiresAt: existingKey.expiresAt,
                        message: 'Key đã tồn tại'
                    })
                };
            }

            const keyName = `user_${hwid.substring(0, 8)}_${Date.now().toString(36)}`;
            const newKey = {
                name: keyName,
                key: generateKey(),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                assignedTo: hwid,
                assignedAt: new Date(),
                status: 'assigned'
            };

            await keysCollection.insertOne(newKey);
            
            await userStepsCollection.updateOne(
                { hwid: hwid },
                { 
                    $set: { 
                        step3_completed: true, 
                        step3_time: new Date(),
                        key_name: keyName,
                        last_update: new Date()
                    } 
                }
            );

            await logsCollection.insertOne({
                type: 'key_created',
                hwid,
                keyName: keyName,
                keyValue: newKey.key,
                ip,
                timestamp: new Date()
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    key: newKey.key,
                    expiresAt: newKey.expiresAt,
                    message: 'Key created successfully' 
                })
            };
        }

        // GET /user-status/:hwid
        if (path.startsWith('/user-status/') && method === 'GET') {
            const hwid = path.replace('/user-status/', '');
            
            if (!hwid) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false,
                        error: 'Thiếu HWID' 
                    })
                };
            }

            const userStep = await userStepsCollection.findOne({ hwid: hwid });
            const userKey = await keysCollection.findOne({ 
                assignedTo: hwid,
                expiresAt: { $gt: new Date() }
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    steps: {
                        step1: userStep?.step1_completed || false,
                        step2: userStep?.step2_completed || false,
                        step3: userStep?.step3_completed || false
                    },
                    hasValidKey: !!userKey,
                    keyInfo: userKey ? {
                        key: userKey.key,
                        expiresAt: userKey.expiresAt
                    } : null
                })
            };
        }

        // POST /create-default-key
        if (path === '/create-default-key' && method === 'POST') {
            const { adminSecret } = JSON.parse(event.body);
            
            if (adminSecret !== "DRAKNESS_ADMIN_2026") {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'Unauthorized' 
                    })
                };
            }

            const existing = await keysCollection.findOne({ name: "drakness" });
            
            if (existing) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        message: 'Key drakness đã tồn tại',
                        key: existing
                    })
                };
            }

            const keyData = {
                name: "drakness",
                key: generateKey(),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
                    message: 'Key drakness đã được tạo',
                    key: keyData
                })
            };
        }

        // GET /admin/keys
        if (path === '/admin/keys' && method === 'GET') {
            const adminKey = event.queryStringParameters?.adminKey;
            
            if (adminKey !== "DRAKNESS_ADMIN_KEY_2026") {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'Unauthorized' 
                    })
                };
            }

            const allKeys = await keysCollection.find({}).toArray();
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    keys: allKeys
                })
            };
        }

        // GET /admin/stats
        if (path === '/admin/stats' && method === 'GET') {
            const adminKey = event.queryStringParameters?.adminKey;
            
            if (adminKey !== "DRAKNESS_ADMIN_KEY_2026") {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        error: 'Unauthorized' 
                    })
                };
            }

            const totalKeys = await keysCollection.countDocuments();
            const assignedKeys = await keysCollection.countDocuments({ status: 'assigned' });
            const availableKeys = await keysCollection.countDocuments({ status: 'available' });
            const expiredKeys = await keysCollection.countDocuments({ expiresAt: { $lt: new Date() } });
            const totalUsers = await userStepsCollection.countDocuments();
            const totalLogs = await logsCollection.countDocuments();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    stats: {
                        totalKeys,
                        assignedKeys,
                        availableKeys,
                        expiredKeys,
                        totalUsers,
                        totalLogs
                    }
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
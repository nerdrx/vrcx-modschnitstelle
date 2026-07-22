const fs = require('fs');
const https = require('https');
const path = require('path');

const token = process.env.GITHUB_TOKEN;
const repo = 'nerdrx/vrcx-modschnitstelle';
const tagName = 'v2026.07.18-mods.4';

const targetFile = process.argv[2];
if (!targetFile) {
    console.error('Please provide a file to upload!');
    process.exit(1);
}

async function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
        req.on('error', reject);
        if (postData) {
            if (Buffer.isBuffer(postData)) req.write(postData);
            else if (typeof postData !== 'string') req.write(JSON.stringify(postData));
            else req.write(postData);
        }
        req.end();
    });
}

async function uploadFile(uploadUrl, filePath, contentType) {
    const fileName = path.basename(filePath);
    const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
    console.log(`Uploading ${fileName}...`);
    
    const fileData = fs.readFileSync(filePath);
    const { hostname, pathname, search } = new URL(url);
    const res = await request({
        hostname,
        path: pathname + search,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': contentType,
            'Content-Length': fileData.length,
            'User-Agent': 'Node.js'
        }
    }, fileData);
    
    if (res.statusCode === 201) {
        console.log(`Uploaded ${fileName} successfully!`);
    } else {
        console.error(`Failed to upload ${fileName}: ${res.statusCode} ${res.data}`);
    }
}

async function main() {
    console.log('Fetching release...');
    const getRes = await request({
        hostname: 'api.github.com',
        path: `/repos/${repo}/releases/tags/${tagName}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Node.js'
        }
    });
    
    if (getRes.statusCode !== 200) {
        console.error('Failed to get release!', getRes.data);
        return;
    }
    const release = JSON.parse(getRes.data);
    
    const targetName = path.basename(targetFile);
    const targetAsset = release.assets.find(a => a.name === targetName);
    if (targetAsset) {
        console.log(`Deleting old asset: ${targetAsset.name} (ID: ${targetAsset.id})...`);
        const delRes = await request({
            hostname: 'api.github.com',
            path: `/repos/${repo}/releases/assets/${targetAsset.id}`,
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Node.js'
            }
        });
        if (delRes.statusCode === 204) {
            console.log('Deleted successfully!');
        } else {
            console.error('Failed to delete asset:', delRes.statusCode, delRes.data);
        }
    } else {
        console.log(`No existing asset found named ${targetName}.`);
    }

    const contentType = targetName.endsWith('.zip') ? 'application/zip' : 'application/x-executable';
    await uploadFile(release.upload_url, targetFile, contentType);
}

main().catch(console.error);

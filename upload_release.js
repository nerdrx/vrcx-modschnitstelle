const fs = require('fs');
const https = require('https');
const path = require('path');

const token = process.env.GITHUB_TOKEN;
const repo = 'nerdrx/vrcx-modschnitstelle';
const tagName = 'v2026.07.22-mods.1';

const exeFile = 'build/VRCX Setup 2026.7.18.exe';
const appImageFile = 'build/VRCX_2026.07.18_x64.AppImage';

async function request(options, postData) {
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
    console.log('Creating release...');
    const releaseRes = await request({
        hostname: 'api.github.com',
        path: `/repos/${repo}/releases`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Node.js',
            'Content-Type': 'application/json'
        }
    }, {
        tag_name: tagName,
        name: `VRCX with Mods (${tagName})`,
        body: 'Unofficial VRCX fork with a mod API, Playtime Dashboard, Profile Archiver, and World Hopper.',
        draft: false,
        prerelease: false
    });
    
    if (releaseRes.statusCode !== 201) {
        // If it already exists, fetch it
        console.log('Release might already exist. Fetching...');
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
        const release = JSON.parse(getRes.data);
        if (!release.upload_url) {
            console.error('Failed to get release!', release);
            return;
        }
        await uploadFile(release.upload_url, exeFile, 'application/vnd.microsoft.portable-executable');
        await uploadFile(release.upload_url, appImageFile, 'application/x-executable');
        return;
    }

    const release = JSON.parse(releaseRes.data);
    await uploadFile(release.upload_url, exeFile, 'application/vnd.microsoft.portable-executable');
    await uploadFile(release.upload_url, appImageFile, 'application/x-executable');
}

main().catch(console.error);

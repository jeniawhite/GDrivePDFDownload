const fs = require('fs');
const readline = require('readline');
const env = require('dotenv').config();

const {
    google
} = require('googleapis');

const {
    Semaphore,
} = require('async-mutex');

const SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
];

const TOKEN_PATH = 'token.json';

let drive;

const dl_semaphore = new Semaphore(process.env.DL_SEM);
const ls_semaphore = new Semaphore(process.env.LS_SEM);

async function init() {
    const load = new Promise((resolve, reject) => {
        fs.readFile('credentials.json', (err, content) => {
            if (err) reject(err);
            authorize(JSON.parse(content), resolve);
        });
    });
    const auth = await load;
    drive = google.drive({
        version: 'v3',
        auth
    });
}

function authorize(credentials, callback) {
    const {
        client_secret,
        client_id,
        redirect_uris
    } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

async function listFiles(params) {
    const [, release] = await ls_semaphore.acquire();
    try {
        const res = await _listFiles(params);
        return res
    } finally {
        release();
    }
}

async function _listFiles(params) {
    const {
        folder,
        recursive,
        match,
    } = params;
    const result = {
        PDF: [],
        FOLDER: [],
    };
    let nextPageToken;

    do {
        try {
            const res = await drive.files.list({
                pageSize: 1000,
                q: `'${folder}' in parents`,
                spaces: 'drive',
                fields: 'nextPageToken, files(id, name, mimeType)',
            });
            const files = res.data.files;
            if (files.length) {
                nextPageToken = res.data.nextPageToken;
                for (const file of files) {
                    if (match && !match.test(file.name)) continue;
                    if (file.mimeType.toLowerCase().includes('application/pdf')) result.PDF.push(file);
                    if (file.mimeType.toLowerCase().includes('application/vnd.google-apps.folder')) {
                        result.FOLDER.push(
                            recursive ? await listFiles({
                                folder: file.id
                            }) : file);
                    }
                }
            }
        } catch (error) {
            console.error('The API returned an error: ' + error);
        }
    } while (nextPageToken);

    return result;
}

async function _getFile(params) {
    const {
        id,
        path
    } = params;

    const res = await drive.files.get({
        fileId: id,
        alt: 'media'
    }, {
        responseType: 'stream'
    })

    return new Promise((resolve, reject) => {
        const dir = path.substring(0, path.lastIndexOf('/'));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        const dest = fs.createWriteStream(path);
        let progress = 0;

        res.data
            .on('end', () => {
                console.log('Done downloading file.', path);
                resolve();
            })
            .on('error', err => {
                console.error('Error downloading file.', path);
                reject(err);
            })
            .on('data', d => {
                progress += d.length;
                if (process.stdout.isTTY) {
                    process.stdout.clearLine();
                    process.stdout.cursorTo(0);
                    process.stdout.write(`Downloaded ${progress} bytes of ${path}`);
                }
            })
            .pipe(dest);
    });
}

async function getFile(params) {
    const [, release] = await dl_semaphore.acquire();
    try {
        const res = await _getFile(params);
        return res;
    } finally {
        release();
    }
}

module.exports = {
    listFiles,
    getFile,
    init,
};
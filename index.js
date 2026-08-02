const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const express = require('express');
const axios = require('axios');
const ytdl = require('ytdl-core');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let pairingCode = '';
let sock = null;

// ========== FUNGSI UTAMA ==========
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        getPairingCode: async (phoneNumber) => {
            const code = await sock.requestPairingCode(phoneNumber);
            pairingCode = code;
            console.log(`📱 KODE PAIRING: ${code}`);
            return code;
        },
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ BOT AKTIF!');
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot();
            }
        }
    });

    // ========== HANDLER PESAN ==========
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const sender = msg.key.participant || from;

        // ===== MENU =====
        if (text === '.menu') {
            const menu = `
╔═══════════════════════╗
║   🤖 BOT CONQUEROR    ║
╠═══════════════════════╣
║ 📁 DOWNLOADER         ║
║  • .ytmp3 <link>      ║
║  • .ytmp4 <link>      ║
║  • .ig <link>         ║
║  • .tiktok <link>     ║
║  • .fb <link>         ║
╠═══════════════════════╣
║ 🛠️ TOOLS              ║
║  • .sticker           ║
║  • .toimg             ║
║  • .tts <teks>        ║
║  • .qr <teks>         ║
╠═══════════════════════╣
║ 🌐 INFO               ║
║  • .cuaca <kota>      ║
║  • .ip                ║
║  • .ping              ║
╠═══════════════════════╣
║ 📊 ADMIN              ║
║  • .kick @user        ║
║  • .add @user         ║
║  • .promote @user     ║
╠═══════════════════════╣
║ 🔗 PAIRING CODE       ║
║ GET: /get-code        ║
╚═══════════════════════╝
`;
            await sock.sendMessage(from, { text: menu });
            return;
        }

        // ===== PING =====
        if (text === '.ping') {
            await sock.sendMessage(from, { text: '🏓 Pong!' });
            return;
        }

        // ===== STICKER =====
        if (text === '.sticker' && msg.message.imageMessage) {
            const media = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of media) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            const webp = await sharp(buffer).webp({ quality: 80 }).toBuffer();
            await sock.sendMessage(from, { sticker: webp });
            return;
        }

        // ===== QR CODE =====
        if (text.startsWith('.qr ')) {
            const qrText = text.replace('.qr ', '');
            const qr = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`, { responseType: 'arraybuffer' });
            await sock.sendMessage(from, { image: qr.data, caption: `QR: ${qrText}` });
            return;
        }

        // ===== YTMP3 =====
        if (text.startsWith('.ytmp3 ')) {
            const url = text.replace('.ytmp3 ', '');
            await sock.sendMessage(from, { text: '⏳ Mendownload audio...' });
            try {
                const info = await ytdl.getInfo(url);
                const audio = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
                const buffer = [];
                for await (const chunk of audio) buffer.push(chunk);
                await sock.sendMessage(from, { audio: Buffer.concat(buffer), mimetype: 'audio/mpeg', fileName: `${info.videoDetails.title}.mp3` });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal download.' });
            }
            return;
        }

        // ===== YTMP4 =====
        if (text.startsWith('.ytmp4 ')) {
            const url = text.replace('.ytmp4 ', '');
            await sock.sendMessage(from, { text: '⏳ Mendownload video...' });
            try {
                const info = await ytdl.getInfo(url);
                const video = ytdl(url, { filter: 'videoandaudio', quality: '18' });
                const buffer = [];
                for await (const chunk of video) buffer.push(chunk);
                await sock.sendMessage(from, { video: Buffer.concat(buffer), mimetype: 'video/mp4', fileName: `${info.videoDetails.title}.mp4` });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal download.' });
            }
            return;
        }

        // ===== CUACA =====
        if (text.startsWith('.cuaca ')) {
            const city = text.replace('.cuaca ', '');
            try {
                const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=YOUR_API_KEY&units=metric`);
                const data = res.data;
                await sock.sendMessage(from, {
                    text: `🌤️ Cuaca ${city}:\nSuhu: ${data.main.temp}°C\nKelembapan: ${data.main.humidity}%\nDeskripsi: ${data.weather[0].description}`
                });
            } catch {
                await sock.sendMessage(from, { text: '❌ Kota tidak ditemukan.' });
            }
            return;
        }

        // ===== IP =====
        if (text === '.ip') {
            const res = await axios.get('https://api.ipify.org?format=json');
            await sock.sendMessage(from, { text: `🌐 IP publik: ${res.data.ip}` });
            return;
        }

        // ===== TTS =====
        if (text.startsWith('.tts ')) {
            const ttsText = text.replace('.tts ', '');
            try {
                const res = await axios.get(`https://api.voicerss.org/?key=YOUR_API_KEY&hl=id-id&src=${encodeURIComponent(ttsText)}`, { responseType: 'arraybuffer' });
                await sock.sendMessage(from, { audio: res.data, mimetype: 'audio/mpeg' });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal TTS.' });
            }
            return;
        }
    });
}

// ========== ROUTE WEB ==========
app.get('/pair', (req, res) => {
    const phone = req.query.phone;
    if (!phone) {
        return res.send(`
            <h2>📱 Pairing Code</h2>
            <p>Gunakan: <code>/pair?phone=628xxxxxxxxx</code></p>
            <p>Contoh: <a href="/pair?phone=6281234567890">/pair?phone=6281234567890</a></p>
        `);
    }
    startBot();
    res.send(`
        <h2>📱 Kode pairing sedang dibuat...</h2>
        <p>Nomor: ${phone}</p>
        <p>Kode akan muncul di terminal dan di: <a href="/get-code">/get-code</a></p>
    `);
});

app.get('/get-code', (req, res) => {
    if (!pairingCode) return res.send('⏳ Belum ada kode. Akses /pair dulu.');
    res.send(`
        <h2>📱 Kode Pairing WhatsApp</h2>
        <h1 style="font-size:48px;letter-spacing:10px;">${pairingCode}</h1>
        <p>Masukkan kode ini di WhatsApp → Perangkat Tertaut → Tautkan dengan Kode</p>
    `);
});

// ========== JALANKAN ==========
app.listen(PORT, () => {
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🔗 Gunakan /pair?phone=628xxx untuk mulai pairing`);
});

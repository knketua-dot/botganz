const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const express = require('express');
const axios = require('axios');
const ytdl = require('ytdl-core');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ========== KONFIGURASI ==========
const config = {
    owner: ['628xxxxxxxxxx'], // Ganti dengan nomor owner
    botname: 'Conqueror Bot',
    author: 'Ganz',
    prefix: ['.', '!', '#'],
    pairing_code: true,
    number_bot: '628xxxxxxxxxx',
    limit: { free: 20, premium: 100 },
    money: { free: 10000, premium: 100000 }
};

// ========== SERVER WEB ==========
const app = express();
const PORT = process.env.PORT || 3000;
let pairingCode = '';
let sockGlobal = null;

// ========== FUNGSI UTAMA BOT ==========
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
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

    sockGlobal = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ BOT AKTIF!');
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Restarting bot...');
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

        // Cek prefix
        const prefix = config.prefix.find(p => text.startsWith(p));
        if (!prefix) return;

        const command = text.slice(prefix.length).trim().split(' ')[0].toLowerCase();
        const args = text.slice(prefix.length + command.length).trim();

        // =============================================
        // ========== SEMUA COMMAND DI SINI ==========
        // =============================================

        // ----- MENU -----
        if (command === 'menu' || command === 'help') {
            const menu = `
╔═══════════════════════════╗
║   ⚔️ CONQUEROR BOT ⚔️    ║
╠═══════════════════════════╣
║ 📁 DOWNLOADER             ║
║  .ytmp3 <link>            ║
║  .ytmp4 <link>            ║
║  .ig <link>               ║
║  .tiktok <link>           ║
║  .fb <link>               ║
╠═══════════════════════════╣
║ 🛠️ TOOLS                  ║
║  .sticker                 ║
║  .toimg                   ║
║  .qr <teks>               ║
║  .tts <teks>              ║
║  .url <link>              ║
╠═══════════════════════════╣
║ 🌐 INFO                   ║
║  .cuaca <kota>            ║
║  .ip                      ║
║  .ping                    ║
║  .runtime                 ║
║  .owner                   ║
╠═══════════════════════════╣
║ 👑 OWNER                  ║
║  .broadcast <pesan>       ║
║  .eval <kode>             ║
║  .setprefix <prefix>      ║
║  .setbotname <nama>       ║
╠═══════════════════════════╣
║ 🔗 PAIRING CODE           ║
║ GET: /get-code            ║
╚═══════════════════════════╝
`;
            await sock.sendMessage(from, { text: menu });
            return;
        }

        // ----- PING -----
        if (command === 'ping') {
            await sock.sendMessage(from, { text: '🏓 Pong!' });
            return;
        }

        // ----- RUNTIME -----
        if (command === 'runtime') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            await sock.sendMessage(from, { text: `⏱️ Runtime: ${hours}h ${minutes}m ${seconds}s` });
            return;
        }

        // ----- OWNER INFO -----
        if (command === 'owner') {
            await sock.sendMessage(from, { text: `👑 Owner: ${config.owner.join(', ')}` });
            return;
        }

        // ----- STICKER -----
        if (command === 'sticker') {
            const msgObj = msg.message;
            const image = msgObj.imageMessage || msgObj.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (!image) {
                await sock.sendMessage(from, { text: '⚠️ Kirim/reply gambar dengan caption .sticker' });
                return;
            }
            try {
                const media = await downloadContentFromMessage(image, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of media) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                const webp = await sharp(buffer).webp({ quality: 80 }).toBuffer();
                await sock.sendMessage(from, { sticker: webp });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal buat sticker.' });
            }
            return;
        }

        // ----- TOIMG (konversi sticker ke gambar) -----
        if (command === 'toimg') {
            const msgObj = msg.message;
            const sticker = msgObj.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
            if (!sticker) {
                await sock.sendMessage(from, { text: '⚠️ Reply sticker dengan .toimg' });
                return;
            }
            try {
                const media = await downloadContentFromMessage(sticker, 'sticker');
                let buffer = Buffer.from([]);
                for await (const chunk of media) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                const img = await sharp(buffer).png().toBuffer();
                await sock.sendMessage(from, { image: img });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal konversi.' });
            }
            return;
        }

        // ----- QR CODE -----
        if (command === 'qr' && args) {
            try {
                const qr = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(args)}`, { responseType: 'arraybuffer' });
                await sock.sendMessage(from, { image: qr.data, caption: `QR: ${args}` });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal buat QR.' });
            }
            return;
        }

        // ----- TTS (Text to Speech) -----
        if (command === 'tts' && args) {
            try {
                const res = await axios.get(`https://api.voicerss.org/?key=YOUR_API_KEY&hl=id-id&src=${encodeURIComponent(args)}`, { responseType: 'arraybuffer' });
                await sock.sendMessage(from, { audio: res.data, mimetype: 'audio/mpeg' });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal TTS.' });
            }
            return;
        }

        // ----- SHORT URL -----
        if (command === 'url' && args) {
            try {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args)}`);
                await sock.sendMessage(from, { text: `🔗 Short URL: ${res.data}` });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal short URL.' });
            }
            return;
        }

        // ----- YTMP3 -----
        if (command === 'ytmp3' && args) {
            await sock.sendMessage(from, { text: '⏳ Mendownload audio...' });
            try {
                const info = await ytdl.getInfo(args);
                const audio = ytdl(args, { filter: 'audioonly', quality: 'highestaudio' });
                const buffer = [];
                for await (const chunk of audio) buffer.push(chunk);
                await sock.sendMessage(from, { 
                    audio: Buffer.concat(buffer), 
                    mimetype: 'audio/mpeg', 
                    fileName: `${info.videoDetails.title}.mp3` 
                });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal download.' });
            }
            return;
        }

        // ----- YTMP4 -----
        if (command === 'ytmp4' && args) {
            await sock.sendMessage(from, { text: '⏳ Mendownload video...' });
            try {
                const info = await ytdl.getInfo(args);
                const video = ytdl(args, { filter: 'videoandaudio', quality: '18' });
                const buffer = [];
                for await (const chunk of video) buffer.push(chunk);
                await sock.sendMessage(from, { 
                    video: Buffer.concat(buffer), 
                    mimetype: 'video/mp4', 
                    fileName: `${info.videoDetails.title}.mp4` 
                });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal download.' });
            }
            return;
        }

        // ----- CUACA -----
        if (command === 'cuaca' && args) {
            try {
                const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${args}&appid=YOUR_API_KEY&units=metric`);
                const data = res.data;
                await sock.sendMessage(from, {
                    text: `🌤️ Cuaca ${args}:\nSuhu: ${data.main.temp}°C\nKelembapan: ${data.main.humidity}%\nDeskripsi: ${data.weather[0].description}`
                });
            } catch {
                await sock.sendMessage(from, { text: '❌ Kota tidak ditemukan.' });
            }
            return;
        }

        // ----- IP -----
        if (command === 'ip') {
            try {
                const res = await axios.get('https://api.ipify.org?format=json');
                await sock.sendMessage(from, { text: `🌐 IP publik: ${res.data.ip}` });
            } catch {
                await sock.sendMessage(from, { text: '❌ Gagal cek IP.' });
            }
            return;
        }

        // ----- BROADCAST (Owner only) -----
        if (command === 'broadcast' && args) {
            if (!config.owner.includes(sender.split('@')[0])) {
                await sock.sendMessage(from, { text: '❌ Khusus owner.' });
                return;
            }
            // Kirim ke semua chat (contoh sederhana)
            await sock.sendMessage(from, { text: `📢 Broadcast: ${args}` });
            return;
        }

        // ----- EVAL (Owner only) -----
        if (command === 'eval' && args) {
            if (!config.owner.includes(sender.split('@')[0])) {
                await sock.sendMessage(from, { text: '❌ Khusus owner.' });
                return;
            }
            try {
                const result = eval(args);
                await sock.sendMessage(from, { text: `📊 Hasil: ${JSON.stringify(result, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
            }
            return;
        }

        // ----- SETPREFIX (Owner only) -----
        if (command === 'setprefix' && args) {
            if (!config.owner.includes(sender.split('@')[0])) {
                await sock.sendMessage(from, { text: '❌ Khusus owner.' });
                return;
            }
            config.prefix = [args];
            await sock.sendMessage(from, { text: `✅ Prefix diubah menjadi: ${args}` });
            return;
        }

        // ----- SETBOTNAME (Owner only) -----
        if (command === 'setbotname' && args) {
            if (!config.owner.includes(sender.split('@')[0])) {
                await sock.sendMessage(from, { text: '❌ Khusus owner.' });
                return;
            }
            config.botname = args;
            await sock.sendMessage(from, { text: `✅ Nama bot diubah menjadi: ${args}` });
            return;
        }

        // ----- COMMAND TIDAK DIKENAL -----
        if (command) {
            await sock.sendMessage(from, { text: `❌ Command "${command}" tidak dikenal. Ketik .menu untuk melihat daftar.` });
        }
    });
}

// ========== ROUTE WEB ==========
app.get('/pair', (req, res) => {
    const phone = req.query.phone;
    if (!phone) {
        return res.send(`
            <h2>📱 Pairing Code - Conqueror Bot</h2>
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
        <h1 style="font-size:48px;letter-spacing:10px;font-family:monospace;">${pairingCode}</h1>
        <p>Masukkan kode ini di WhatsApp → Perangkat Tertaut → Tautkan dengan Kode</p>
        <hr>
        <p><small>Bot Conqueror - Created by Ganz</small></p>
    `);
});

// ========== JALANKAN SERVER ==========
app.listen(PORT, () => {
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🔗 Gunakan /pair?phone=628xxx untuk mulai pairing`);
    console.log(`📱 Bot akan jalan setelah pairing sukses`);
});

// Jalankan bot otomatis
console.log('🚀 Conqueror Bot siap...');

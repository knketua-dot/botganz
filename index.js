import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage
} from "@whiskeysockets/baileys"
import pino from "pino"
import chalk from "chalk"
import settings from "./settings.js"

const logger = pino({ level: "silent" })

async function startG4nzz() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: !settings.usePairingCode,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false
  })

  // ========== PAIRING CODE ==========
  if (settings.usePairingCode && !sock.authState.creds.registered) {
    const phoneNumber = settings.botNumber.replace(/[^0-9]/g, "")
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber)
        console.log(chalk.green.bold("\n┌────────────────────────────────────┐"))
        console.log(chalk.green.bold("│         G4nzz BOT PAIRING         │"))
        console.log(chalk.green.bold("└────────────────────────────────────┘"))
        console.log(chalk.yellow(`\nNomor Bot   : ${phoneNumber}`))
        console.log(chalk.cyan.bold(`Pairing Code: ${code}\n`))
        console.log(chalk.white("Cara pakai:"))
        console.log("1. Buka WhatsApp")
        console.log("2. Perangkat Tertaut → Tautkan perangkat")
        console.log("3. Pilih 'Tautkan dengan nomor telepon'")
        console.log("4. Masukkan kode di atas\n")
      } catch (e) {
        console.log(chalk.red("Gagal request pairing code:"), e.message)
      }
    }, 3000)
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log(chalk.red("Koneksi terputus..."), shouldReconnect ? "mencoba reconnect" : "logout")
      if (shouldReconnect) startG4nzz()
    } else if (connection === "open") {
      console.log(chalk.green.bold("\n✅ G4nzz Bot berhasil terhubung!\n"))
    }
  })

  // ========== MESSAGE HANDLER ==========
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return

    const from = m.key.remoteJid
    const isGroup = from.endsWith("@g.us")
    const sender = isGroup ? (m.key.participant || m.participant) : from
    const pushName = m.pushName || "User"

    const body =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      m.message.videoMessage?.caption ||
      ""

    const prefix = settings.prefix.find(p => body.startsWith(p)) || ""
    const command = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
    const args = body.slice(prefix.length + command.length).trim().split(/\s+/)
    const text = args.join(" ").trim()
    const q = m.message?.extendedTextMessage?.contextInfo?.quotedMessage

    const isOwner = settings.owner.map(n => n + "@s.whatsapp.net").includes(sender)

    const reply = async (teks) => {
      await sock.sendMessage(from, { text: teks }, { quoted: m })
    }

    try {
      switch (command) {

        case "menu":
        case "help":
        case "m":
          {
            const menu = `
╭─────────────────────────╮
│     ⚡ *G4NZZ BOT* ⚡     │
╰─────────────────────────╯

Halo *${pushName}* 👋
Prefix : ${settings.prefix.join(" / ")}

┌─「 *Main Menu* 」
│ • menu
│ • ping
│ • runtime
│ • info
│ • owner
└───────────────

┌─「 *Fun* 」
│ • rate <teks>
│ • jodoh <nama1>|<nama2>
│ • cek <sifat>
│ • kapankah <teks>
│ • bisakah <teks>
│ • apakah <teks>
└───────────────

┌─「 *Tools* 」
│ • sticker / s
│ • toimg
│ • tts <teks>
│ • translate <teks>
└───────────────

┌─「 *Group* 」
│ • hidetag <teks>
│ • tagall
└───────────────

┌─「 *Owner* 」
│ • broadcast <pesan>
└───────────────

╭─────────────────────────╮
│   Bot by *G4nzz* ❤️     │
╰─────────────────────────╯`
            await reply(menu)
          }
          break

        case "ping":
          {
            const start = Date.now()
            await reply("Pong!")
            const end = Date.now()
            await reply(`⚡ *${end - start} ms*`)
          }
          break

        case "runtime":
          {
            const uptime = process.uptime()
            const h = Math.floor(uptime / 3600)
            const mnt = Math.floor((uptime % 3600) / 60)
            const s = Math.floor(uptime % 60)
            await reply(`⏱️ *Runtime*\n${h} jam ${mnt} menit ${s} detik`)
          }
          break

        case "info":
          {
            await reply(`🤖 *G4nzz Bot*\nVersi: 1.1.0\nBase: Baileys\nOwner: ${settings.ownerName}\n\nBot ringan & custom dengan Pairing Code.`)
          }
          break

        case "owner":
          {
            const vcard = `BEGIN:VCARD
VERSION:3.0
N:;${settings.ownerName};;;
FN:${settings.ownerName}
TEL;type=CELL;type=VOICE;waid=\( {settings.owner[0]}:+ \){settings.owner[0]}
END:VCARD`
            await sock.sendMessage(from, {
              contacts: {
                displayName: settings.ownerName,
                contacts: [{ vcard }]
              }
            }, { quoted: m })
          }
          break

        case "rate":
          {
            if (!text) return reply(`Contoh: ${prefix}rate aku ganteng`)
            const rate = Math.floor(Math.random() * 101)
            await reply(`📊 Rating *\( {text}* adalah * \){rate}/100*`)
          }
          break

        case "jodoh":
          {
            if (!text.includes("|")) return reply(`Contoh: ${prefix}jodoh Budi|Siti`)
            const [n1, n2] = text.split("|")
            const percent = Math.floor(Math.random() * 101)
            await reply(`💘 Kecocokan *\( {n1.trim()}* & * \){n2.trim()}*\n\nHasil: *${percent}%*`)
          }
          break

        case "cek":
          {
            if (!text) return reply(`Contoh: ${prefix}cek tolol`)
            const hasil = Math.floor(Math.random() * 101)
            await reply(`🔍 Hasil cek *\( {text}* kamu adalah * \){hasil}%*`)
          }
          break

        case "kapankah":
          {
            if (!text) return reply(`Contoh: ${prefix}kapankah aku kaya`)
            const jawaban = ["Besok", "Lusa", "Minggu depan", "Bulan depan", "Tahun depan", "Tidak akan pernah", "Dalam waktu dekat", "Entah kapan"]
            const random = jawaban[Math.floor(Math.random() * jawaban.length)]
            await reply(`❓ *Kapankah \( {text}?*\n\nJawaban: * \){random}*`)
          }
          break

        case "bisakah":
          {
            if (!text) return reply(`Contoh: ${prefix}bisakah aku jadi sukses`)
            const jawaban = ["Bisa", "Tidak bisa", "Mungkin bisa", "Bisa banget", "Sulit", "Coba saja dulu", "Mustahil"]
            const random = jawaban[Math.floor(Math.random() * jawaban.length)]
            await reply(`❓ *Bisakah \( {text}?*\n\nJawaban: * \){random}*`)
          }
          break

        case "apakah":
          {
            if (!text) return reply(`Contoh: ${prefix}apakah aku ganteng`)
            const jawaban = ["Ya", "Tidak", "Mungkin", "Sangat mungkin", "Tidak mungkin", "Bisa jadi", "Rahasia"]
            const random = jawaban[Math.floor(Math.random() * jawaban.length)]
            await reply(`❓ *Apakah \( {text}?*\n\nJawaban: * \){random}*`)
          }
          break

        case "tts":
          {
            if (!text) return reply(`Contoh: ${prefix}tts Halo semua`)
            await reply(`🔊 TTS: *${text}*`)
          }
          break

        case "translate":
        case "tr":
          {
            if (!text) return reply(`Contoh: ${prefix}translate Hello`)
            await reply(`🌐 Translate:\n${text}`)
          }
          break

        case "sticker":
        case "s":
        case "stiker":
          {
            const isImage = m.message?.imageMessage || q?.imageMessage
            if (!isImage) return reply("Kirim gambar dengan caption *sticker* atau reply gambar")
            await reply(settings.mess.wait)
            try {
              const media = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage })
              await sock.sendMessage(from, { image: media, caption: "✅ Gambar diterima" }, { quoted: m })
            } catch {
              await reply("Gagal memproses gambar")
            }
          }
          break

        case "toimg":
          {
            if (!q?.stickerMessage) return reply("Reply sticker dengan perintah *toimg*")
            await reply(settings.mess.wait)
            try {
              const media = await downloadMediaMessage({ message: q }, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage })
              await sock.sendMessage(from, { image: media, caption: "✅ Convert sticker → image" }, { quoted: m })
            } catch {
              await reply("Gagal convert sticker")
            }
          }
          break

        case "hidetag":
        case "h":
          {
            if (!isGroup) return reply(settings.mess.group)
            if (!text) return reply(`Contoh: ${prefix}hidetag Halo semua`)
            const groupMeta = await sock.groupMetadata(from)
            await sock.sendMessage(from, {
              text: text,
              mentions: groupMeta.participants.map(p => p.id)
            })
          }
          break

        case "tagall":
          {
            if (!isGroup) return reply(settings.mess.group)
            const groupMeta = await sock.groupMetadata(from)
            let teks = `📢 *Tag All*\n\n`
            for (let mem of groupMeta.participants) {
              teks += `• @${mem.id.split("@")[0]}\n`
            }
            await sock.sendMessage(from, {
              text: teks,
              mentions: groupMeta.participants.map(p => p.id)
            }, { quoted: m })
          }
          break

        case "broadcast":
        case "bc":
          {
            if (!isOwner) return reply(settings.mess.owner)
            if (!text) return reply("Masukkan pesan broadcast!")
            await reply("✅ Fitur broadcast siap dikembangkan")
          }
          break

        default:
          break
      }
    } catch (err) {
      console.error(err)
      await reply(settings.mess.error)
    }
  })
}

startG4nzz()

const {default:makeWASocket,useMultiFileAuthState,DisconnectReason,fetchLatestBaileysVersion}=require("@whiskeysockets/baileys");
const P=require("pino");

async function start(){
 const {state,saveCreds}=await useMultiFileAuthState("auth_info");
 const {version}=await fetchLatestBaileysVersion();
 const sock=makeWASocket({version,auth:state,logger:P({level:"silent"}),printQRInTerminal:true});
 sock.ev.on("creds.update",saveCreds);
 sock.ev.on("connection.update",({connection,lastDisconnect})=>{
   if(connection==="open") console.log("Bot connected!");
   if(connection==="close"){
     const code=lastDisconnect?.error?.output?.statusCode;
     if(code!==DisconnectReason.loggedOut) start();
   }
 });
 sock.ev.on("messages.upsert", async ({messages})=>{
   const m=messages[0];
   if(!m.message||m.key.fromMe) return;
   const text=m.message.conversation||m.message.extendedTextMessage?.text||"";
   const jid=m.key.remoteJid;
   if(text===".ping") await sock.sendMessage(jid,{text:"Pong!"});
   if(text===".menu") await sock.sendMessage(jid,{text:"*Menu*\n.ping\n.menu\n.owner"});
   if(text===".owner") await sock.sendMessage(jid,{text:"Owner: Ganti sesuai kebutuhan."});
 });
}
start();

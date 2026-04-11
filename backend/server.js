const express = require('express');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "my_super_secret_iot_key"; // Güvenli ortamda env'den alınmalı

app.use(express.json());
app.use(cors()); // Tüm kaynaklara izin verildi, production'da spesifik originler açılmalı.

// Sistemdeki in-memory state (Gerçek uygulamada veritabanı kullanılır)
let latestSensorData = {
    voltage: 0.0,
    current: 0.0,
    power: 0.0,
    batteryPercentage: 0,
    timestamp: new Date().toISOString()
};

// Hedef röle durumu: "ON" => 1, "OFF" => 0
let relayTargetState = 0;
let actualRelayState = 0;

// Kullanıcı bilgileri (Geçici olarak bellekte)
let adminUser = {
    username: 'admin',
    password: '123456',
    fullName: 'Yönetici Adı',
    email: 'test@email.com' // Kendi mailinizi profil kısmından güncellemeyi unutmayın
};

// --- MAİL GÖNDERİM AYARLARI ---
// E-posta gönderim işlemi için Nodemailer konfigürasyonu (OUTLOOK / HOTMAIL)
// Şifre olarak hesabınızın "gerçek şifresini" yazabilirsiniz, ekstra Uygulama Şifresi vb. gerekmez. *(Bazen ekstra koruma varsa yine de Microsoft App Password gerekebilir, yoksa sorunsuz çalışır).*
//TODO: 

const SENDER_EMAIL = 'kendi_adresiniz@hotmail.com'; // Buraya kendi hotmail veya outlook adresinizi yazın
const SENDER_PASSWORD = 'kendi_sifreniz';           // Buraya o mailin gerçek şifresini yazın

const mailTransporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false, // TLS portu (587) için false
    auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASSWORD
    },
    tls: {
        ciphers: 'SSLv3'
    }
});
const CRITICAL_BATTERY_LEVEL = 20; // Yüzde 20'nin altında mail at
let lastEmailSentTime = 0; // Aşırı mail gönderimini önlemek (cooldown) için
const EMAIL_COOLDOWN_MS = 60 * 60 * 1000; // Aynı maili 1 saatte bir gönder


// --------------------------------------------------------------------------
// WEB ARAYÜZ ENDPOINTLERI (Frontend - Backend)
// --------------------------------------------------------------------------

// 1. Yetkilendirme (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Basit doğrulama
    if (username === adminUser.username && password === adminUser.password) {
        const token = jwt.sign({ username: adminUser.username }, SECRET_KEY, { expiresIn: '1h' });
        return res.json({ success: true, token });
    }

    return res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre!' });
});

// Middleware: Token Doğrulama
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// 2. Dashboard için Son Sensör Verisini Getir
app.get('/api/dashboard', authenticateToken, (req, res) => {
    res.json({
        ...latestSensorData,
        relayState: actualRelayState, // Beklenen değil, gerçek ölçülen durum eklenebilir. Şu an target state.
        relayTarget: relayTargetState
    });
});

// 3. Röle Durumunu Değiştir (Kullanıcı arayüzden tıklar)
app.post('/api/relay', authenticateToken, (req, res) => {
    const { state } = req.body; // state: 1 (Açık) veya 0 (Kapalı)
    if (state === 1 || state === 0) {
        relayTargetState = state;
        res.json({ success: true, newTargetState: relayTargetState });
    } else {
        res.status(400).json({ success: false, message: 'Bilinmeyen röle komutu' });
    }
});


// 4. Kullanıcı Bilgilerini Getir
app.get('/api/user', authenticateToken, (req, res) => {
    res.json({
        username: adminUser.username,
        fullName: adminUser.fullName,
        email: adminUser.email
    });
});


// 5. Kullanıcı Adı ve Şifre Değiştir
app.post('/api/profile', authenticateToken, (req, res) => {
    const { fullName, email, username, oldPassword, newPassword } = req.body;

    // Şifre değiştirilmek isteniyorsa kontrolleri yap
    if (newPassword && newPassword.trim() !== '') {
        if (oldPassword !== adminUser.password) {
            return res.json({ success: false, message: 'Mevcut şifreniz hatalı!' });
        }
        adminUser.password = newPassword.trim();
    }

    // Diğer bilgileri güncelle
    if (fullName && fullName.trim() !== '') adminUser.fullName = fullName.trim();
    if (email && email.trim() !== '') adminUser.email = email.trim();
    if (username && username.trim() !== '') adminUser.username = username.trim();

    res.json({ success: true, message: 'Profil başarıyla güncellendi!' });
});


// --------------------------------------------------------------------------
// ESP8266 / DONANIM ENDPOINTLERİ
// --------------------------------------------------------------------------

// 4. ESP8266 Sensör Verisi Ekler ve Röle Durumunu Alır
// Not: ESP8266 basit HTTP POST yapar, karmaşık authentication yerine statik api-key eklenebilir.
app.post('/api/esp/data', (req, res) => {
    const { voltage, current, batteryPercentage } = req.body;

    // Verileri güncelle
    latestSensorData.voltage = typeof voltage === 'number' ? voltage : parseFloat(voltage) || 0;
    latestSensorData.current = typeof current === 'number' ? current : parseFloat(current) || 0;
    latestSensorData.power = latestSensorData.voltage * latestSensorData.current;
    latestSensorData.batteryPercentage = typeof batteryPercentage === 'number' ? batteryPercentage : parseFloat(batteryPercentage) || 0;
    latestSensorData.timestamp = new Date().toISOString();

    // -- KRİTİK BATARYA KONTROLÜ VE MAİL GÖNDERİMİ --
    if (latestSensorData.batteryPercentage < CRITICAL_BATTERY_LEVEL) {
        const now = Date.now();
        // Eğer son mailin üzerinden 1 saat (EMAIL_COOLDOWN_MS) geçtiyse yeni bir mail gönder.
        if (now - lastEmailSentTime > EMAIL_COOLDOWN_MS && adminUser.email !== 'test@email.com') {
            lastEmailSentTime = now;

            const mailOptions = {
                from: SENDER_EMAIL, // Yukarıda tanımlanan gönderici
                to: adminUser.email,
                subject: '🚨 UYARI: Batarya Seviyesi Kritik Durumda!',
                html: `
                    <h2>Güneş Enerjisi Sistemi Uyarı Bildirimi</h2>
                    <p>Sayın <b>${adminUser.fullName}</b>,</p>
                    <p>Sisteminizdeki batarya doluluk oranı kritik seviyenin (%${CRITICAL_BATTERY_LEVEL}) altına düşmüştür!</p>
                    <hr/>
                    <ul>
                        <li><b>Mevcut Batarya Yüzdesi:</b> %${latestSensorData.batteryPercentage.toFixed(1)}</li>
                        <li><b>Sistem Voltajı:</b> ${latestSensorData.voltage.toFixed(2)} V</li>
                        <li><b>Anlık Tüketim (Güç):</b> ${latestSensorData.power.toFixed(2)} W</li>
                    </ul>
                    <hr/>
                    <p>Lütfen gereksiz yükleri (röleleri) kapatmayı veya sistemi kontrol etmeyi ihmal etmeyin.</p>
                `
            };

            // Gönderimi tetikle
            mailTransporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error("Kritik batarya uyarısı maili gönderilemedi:", error);
                } else {
                    console.log("Kritik batarya uyarısı başarıyla gönderildi: " + info.response);
                }
            });
        }
    }

    // ESP8266'ya yanıt olarak hedef röle durumu döndürülür: 1=Aç, 0=Kapa
    // Dönen yanıt düz metin veya JSON olabilir, ESP8266 JSON parse etmesi zorsa düz text daha kolaydır.
    // Biz modern JSON dönüyoruz. ESP8266 ArduinoJson kütüphanesiyle algılayacak.
    res.json({
        status: "OK",
        relay: relayTargetState
    });
});


// Statik dosyaları (frontend) sun (Eğer backend/frontend aynı yerden serve edilecekse)
app.use(express.static(path.join(__dirname, '../frontend')));

app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} portunda başarıyla başlatıldı.`);
    console.log(`📡 Donanımdan (ESP8266) gelecek gerçek veriler bekleniyor...`);
});

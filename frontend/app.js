// Güneş Enerjisi Dashboard & Login Uygulama Mantığı

const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') ? 'http://localhost:3000/api' : '/api';

// Sayfa Yönlendirmeleri
const path = window.location.pathname.split('/').pop();
const isLoginPage = path === 'index.html' || path === '';
const isProfilePage = path === 'profile.html';
const isDashboardPage = path === 'dashboard.html';

// --- ORTAK İŞLEMLER --- //

// Sayfa koruması
if (!isLoginPage) {
    const token = localStorage.getItem('iot_token');
    if (!token) {
        window.location.href = 'index.html';
    }
} else {
    // Zaten giriş yapmışsa Dashboarda yönlendir
    const token = localStorage.getItem('iot_token');
    if (token) {
        window.location.href = 'dashboard.html';
    }
}

// --- LOGİN SAYFASI JS --- //

if (isLoginPage) {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (data.success) {
                localStorage.setItem('iot_token', data.token);
                window.location.href = 'dashboard.html';
            } else {
                loginError.innerText = data.message || "Giriş başarısız.";
            }
        } catch (error) {
            console.error("Login hatası:", error);
            loginError.innerText = "Sunucuya bağlanılamadı.";
        }
    });
}

// --- DASHBOARD SAYFASI JS --- //

if (isDashboardPage) {
    // Yetkilendirme Tokeni
    const token = localStorage.getItem('iot_token');

    // Çıkış Yapma
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('iot_token');
        window.location.href = 'index.html';
    });

    // Chart.js Tanımlama
    const ctx = document.getElementById('powerChart').getContext('2d');

    // Gradient için
    let gradientFill = ctx.createLinearGradient(0, 0, 0, 400);
    gradientFill.addColorStop(0, "rgba(59, 130, 246, 0.5)"); // Mavi 500 opak
    gradientFill.addColorStop(1, "rgba(59, 130, 246, 0.0)");

    const powerChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Zaman etiketleri
            datasets: [{
                label: 'Güç (W)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: gradientFill,
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#3b82f6',
                pointBorderWidth: 2,
                pointRadius: 3,
                fill: true,
                tension: 0.4 // Yumuşak kıvrımlar
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)'
                }
            },
            scales: {
                x: {
                    grid: { display: false, color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' },
                    beginAtZero: true
                }
            },
            animation: {
                duration: 400 // Seri animasyonlar için süreyi azaltıyoruz
            }
        }
    });

    // Batarya Grafiği Tanımlama
    const batteryCtx = document.getElementById('batteryChart').getContext('2d');
    let batteryGradientFill = batteryCtx.createLinearGradient(0, 0, 0, 400);
    batteryGradientFill.addColorStop(0, "rgba(168, 85, 247, 0.5)"); // Mor opak
    batteryGradientFill.addColorStop(1, "rgba(168, 85, 247, 0.0)");

    const batteryChart = new Chart(batteryCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Doluluk (%)',
                data: [],
                borderColor: '#c084fc',
                backgroundColor: batteryGradientFill,
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#c084fc',
                pointBorderWidth: 2,
                pointRadius: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)'
                }
            },
            scales: {
                x: {
                    grid: { display: false, color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 100
                }
            },
            animation: {
                duration: 400
            }
        }
    });

    // Veri Güncelleme Mantığı
    let relayCurrentTarget = 0;
    
    let lastKnownDataTimestamp = null;
    let lastDataClientTime = Date.now();

    function setSystemStatus(isOffline) {
        const statusBadge = document.getElementById('connectionStatus');
        const chartIndicators = document.querySelectorAll('.status-indicator');
        
        if (isOffline) {
            if (statusBadge) {
                statusBadge.className = "status-badge offline";
                statusBadge.innerHTML = "❌ Veri Akışı Kesildi";
            }
            chartIndicators.forEach(el => {
                el.innerHTML = "● Bağlantı Bekleniyor";
                el.style.color = "var(--danger)";
            });
            document.querySelectorAll('.gauge-card').forEach(card => card.classList.add('offline-card'));
        } else {
            if (statusBadge) {
                statusBadge.className = "status-badge online";
                statusBadge.innerHTML = "● Canlı Bağlantı";
            }
            chartIndicators.forEach(el => {
                el.innerHTML = "● Canlı Veri";
                el.style.color = "var(--success)";
            });
            document.querySelectorAll('.gauge-card').forEach(card => card.classList.remove('offline-card'));
        }
    }

    async function fetchDashboardData() {
        try {
            const res = await fetch(`${API_BASE_URL}/dashboard`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.status === 401 || res.status === 403) {
                // Token süresi dolmuş
                localStorage.removeItem('iot_token');
                window.location.href = 'index.html';
                return;
            }

            const data = await res.json();
            
            // Çevrimdışı kontrolü: Gelen nesnedeki verinin timestamp değeri serverdan gelir.
            // Eğer yeni gelen veri eski verinin aynısıysa cihazın bağlantısı kopmuş demektir.
            if (data.timestamp !== lastKnownDataTimestamp) {
                lastKnownDataTimestamp = data.timestamp;
                lastDataClientTime = Date.now();
            }
            
            const timeSinceLastUpdate = (Date.now() - lastDataClientTime) / 1000;
            const isOffline = timeSinceLastUpdate > 15; // 15s yeni veri gelmezse offline mod
            
            setSystemStatus(isOffline);

            if (!isOffline) {
                document.getElementById('valVoltage').innerText = Number(data.voltage).toFixed(2);
                document.getElementById('valCurrent').innerText = Number(data.current).toFixed(2);
                document.getElementById('valPower').innerText = Number(data.power).toFixed(2);
                document.getElementById('valBattery').innerText = Number(data.batteryPercentage).toFixed(0);

                // Update Gauges
                updateGauge('gaugeVoltageDraw', data.voltage, 50);
                updateGauge('gaugeCurrentDraw', data.current, 20);
                updateGauge('gaugePowerDraw', data.power, 1000);

                // Update Battery Indicator
                updateBatteryIndicator(data.batteryPercentage);

                // Röle Durumunu Güncelle (DOM)
                updateRelayUI(data.relayTarget);

                // Grafikleri Güncelle
                updateChartData(data.power);
                updateBatteryChartData(data.batteryPercentage);
            } else {
                document.getElementById('valVoltage').innerText = "--";
                document.getElementById('valCurrent').innerText = "--";
                document.getElementById('valPower').innerText = "--";
                
                updateGauge('gaugeVoltageDraw', 0, 50);
                updateGauge('gaugeCurrentDraw', 0, 20);
                updateGauge('gaugePowerDraw', 0, 1000);
            }

        } catch (error) {
            console.error("Veri çekme hatası:", error);
        }
    }

    function updateChartData(newPower) {
        const timeNow = new Date().toLocaleTimeString('tr-TR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (powerChart.data.labels.length > 20) {
            // Son 20 veriyi göster
            powerChart.data.labels.shift();
            powerChart.data.datasets[0].data.shift();
        }

        powerChart.data.labels.push(timeNow);
        powerChart.data.datasets[0].data.push(newPower);
        powerChart.update('none'); // Update smoothly without full animation reload
    }

    function updateBatteryChartData(newPerc) {
        const timeNow = new Date().toLocaleTimeString('tr-TR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (batteryChart.data.labels.length > 20) {
            batteryChart.data.labels.shift();
            batteryChart.data.datasets[0].data.shift();
        }

        batteryChart.data.labels.push(timeNow);
        batteryChart.data.datasets[0].data.push(newPerc);
        batteryChart.update('none');
    }

    function updateGauge(elementId, value, maxVal) {
        const el = document.getElementById(elementId);
        if (el) {
            let pct = value / maxVal;
            if (pct > 1) pct = 1;
            if (pct < 0) pct = 0;
            const totalLength = 125.66;
            const offset = totalLength - (totalLength * pct);
            el.style.strokeDashoffset = offset;
        }
    }

    function updateBatteryIndicator(percentage) {
        const batteryLvlEl = document.getElementById('batteryLevelIndicator');
        if (batteryLvlEl) {
            let pct = Math.max(0, Math.min(100, percentage));
            batteryLvlEl.style.width = pct + '%';

            // Renk hesaplama (0% Kırmızı -> 100% Yeşil)
            // HSL'de 0 Kırmızı, 120 Yeşildir
            const hue = (pct * 1.2);
            const color = `hsl(${hue}, 100%, 45%)`;

            batteryLvlEl.style.backgroundColor = color;
            batteryLvlEl.style.boxShadow = `0 0 10px ${color}, 0 0 5px ${color} inset`;
        }
    }

    // Röle kontrol işlemleri
    const toggleRelayBtn = document.getElementById('toggleRelayBtn');

    // Röle Iconu için (Power Switch Icon)
    const powerIconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>`;
    document.getElementById('relayStatusIcon').innerHTML = powerIconSVG;

    toggleRelayBtn.addEventListener('click', async () => {
        // Hedefi tersine çevir
        const newTarget = relayCurrentTarget === 1 ? 0 : 1;

        try {
            const res = await fetch(`${API_BASE_URL}/relay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ state: newTarget })
            });

            const data = await res.json();
            if (data.success) {
                updateRelayUI(data.newTargetState);
            }
        } catch (e) {
            console.error("Röle kontrol hatası", e);
        }
    });

    function updateRelayUI(state) {
        relayCurrentTarget = state;
        const relayStatusElement = document.querySelector('.relay-status');
        const relayStatusText = document.getElementById('relayStatusText');
        const btnText = toggleRelayBtn.querySelector('.btn-text');

        if (state === 1) { // AÇIK
            relayStatusElement.classList.add('active');
            relayStatusText.innerText = "AÇIK";

            toggleRelayBtn.classList.remove('off');
            toggleRelayBtn.classList.add('on');
            btnText.innerText = "Röleyi KAPAT";
        } else { // KAPALI
            relayStatusElement.classList.remove('active');
            relayStatusText.innerText = "KAPALI";

            toggleRelayBtn.classList.remove('on');
            toggleRelayBtn.classList.add('off');
            btnText.innerText = "Röleyi AÇ";
        }
    }

    // Kullanıcı adını al
    fetch(`${API_BASE_URL}/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json()).then(data => {
        if (data.username) {
            const displayName = data.fullName && data.fullName.trim() !== '' ? data.fullName : data.username;
            document.getElementById('welcomeUser').innerText = `Hoşgeldin, ${displayName}`;
        }
    }).catch(console.error);

    // Başlangıç verisi çek ve Interval ayarla (Saniyede 1 kez)
    fetchDashboardData();
    setInterval(fetchDashboardData, 1000); // Gerçek zamanlı hissi için
}

// --- PROFİL SAYFASI JS --- //
if (isProfilePage) {
    const token = localStorage.getItem('iot_token');

    // Kullanıcı bilgilerini form girişlerine yazdır ve sol paneldeki görünümü güncelle
    fetch(`${API_BASE_URL}/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json()).then(data => {
        if (data.username) {
            document.getElementById('profileUsername').value = data.username;
            document.getElementById('fullName').value = data.fullName || '';
            document.getElementById('email').value = data.email || '';
            document.getElementById('displayFullName').innerText = data.fullName || 'İsimsiz Kullanıcı';
            document.getElementById('displayEmail').innerText = data.email || 'Belirtilmedi';
        }
    }).catch(console.error);

    // Formu gönder
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const username = document.getElementById('profileUsername').value;
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const newPasswordConfirm = document.getElementById('newPasswordConfirm').value;
        const resultMsg = document.getElementById('profileResult');

        // Şifre kontrolü - Eğer yeni şifre girilmişse, uyuştuğunu test et
        if (newPassword && newPassword !== newPasswordConfirm) {
            resultMsg.innerText = "Yeni şifreler birbirleriyle uyuşmuyor!";
            resultMsg.style.color = 'var(--danger)';
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ fullName, email, username, oldPassword, newPassword })
            });

            const data = await res.json();
            if (data.success) {
                resultMsg.innerText = data.message;
                resultMsg.style.color = 'var(--success)';

                // Görsel alanı güncelle
                document.getElementById('displayFullName').innerText = fullName;
                document.getElementById('displayEmail').innerText = email;

                // Güvenlik açısından şifre alanlarını temizle
                document.getElementById('oldPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('newPasswordConfirm').value = '';
            } else {
                resultMsg.innerText = data.message || "Bir hata oluştu.";
                resultMsg.style.color = 'var(--danger)';
            }
        } catch (err) {
            console.error(err);
            resultMsg.innerText = "Sunucuya ulaşılamıyor.";
            resultMsg.style.color = 'var(--danger)';
        }
    });

    // Çıkış Butonu
    document.getElementById('logoutBtnProfile').addEventListener('click', () => {
        localStorage.removeItem('iot_token');
        window.location.href = 'index.html';
    });
}

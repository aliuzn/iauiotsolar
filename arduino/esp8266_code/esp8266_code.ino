#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// --- WiFi Ayarları ---
const char* ssid = "Ali iPhone’u";
const char* password = "123456789";

// --- Sunucu Ayarları ---
const char* serverAddress = "https://iauiotsolar.onrender.com/api/esp/data";

// --- Zamanlama Değişkenleri ---
unsigned long previousMillis = 0;
const long httpInterval = 1000; // 1 saniyede bir veri gönderip, röle kontrolünü kontrol et.

// --- Sensör Verileri ---
float v = 0.0;
float i = 0.0;
int b = 0;

void setup() {
  // UNO ile haberleşme hızı. UNO tarafında da Serial.begin(9600) olmalı.
  Serial.begin(9600); 

  // WiFi Bağlantısı
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("WiFi Baglaniyor...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\nWiFi Baglandi!");
  Serial.print("IP Adresi: ");
  Serial.println(WiFi.localIP());
  
  // UNO'ya hazır olduğumuzu bildiriyoruz
  Serial.println("ESP_READY");
}

void loop() {
  // 1. Seri Porttan Veri Okuma (Arduino UNO'dan gelen)
  if (Serial.available()) {
    String incomingStr = Serial.readStringUntil('\n');
    incomingStr.trim(); // Boşlukları temizle

    if (incomingStr.startsWith("V:")) {
      parseArduinoData(incomingStr);
    }
  }

  // 2. HTTP POST İşlemi (Zaman ayarlı)
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= httpInterval) {
    previousMillis = currentMillis;

    if (WiFi.status() == WL_CONNECTED) {
      // Değişkenleri static yaparak TSL/TCP bağlantısının her döngüde yeniden kurulmasını (1-2 sn gecikme) engelliyoruz
      static WiFiClientSecure client;
      static bool clientInsecureSet = false;
      if (!clientInsecureSet) {
        client.setInsecure(); // Sadece ilk seferde ayarla
        clientInsecureSet = true;
      }
      
      static HTTPClient http;

      http.setReuse(true); // Keep-Alive bağlantıyı zorla (Render destekler)
      http.begin(client, serverAddress);
      http.addHeader("Content-Type", "application/json");

      // JSON Objesi Oluşturma
      StaticJsonDocument<200> docOut;
      docOut["voltage"] = v;
      docOut["current"] = i;
      docOut["batteryPercentage"] = b;

      String requestBody;
      serializeJson(docOut, requestBody);

      // Veriyi Gönder
      Serial.println("Sunucuya veri gonderiliyor...");
      int httpResponseCode = http.POST(requestBody);

      // Yanıtı Kontrol Et
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.print("Sunucu Yaniti (HTTP ");
        Serial.print(httpResponseCode);
        Serial.print("): ");
        Serial.println(response);

        // Sunucudan dönen JSON'u parse et (Arayüzden gelen röle komutunu okumak için)
        StaticJsonDocument<200> docIn;
        DeserializationError error = deserializeJson(docIn, response);
        if (!error) {
          if (docIn.containsKey("relay")) {
            int relayState = docIn["relay"]; // 1 = AÇ, 0 = KAPAT
            if (relayState == 1) {
              Serial.println("R1"); // UNO'ya bildir
            } else {
              Serial.println("R0"); // UNO'ya bildir
            }
          }
        }
      } else {
        Serial.print("HTTPS Baglanti Hatasi: ");
        Serial.println(http.errorToString(httpResponseCode).c_str());
      }
      
      http.end();
    } else {
      Serial.println("WiFi Baglantisi Kesildi!");
    }
  }
}

// --- Veri Parçalama Fonksiyonu ---
void parseArduinoData(String data) {
  // Beklenen format: "V:12.50;I:1.20;B:85;"
  
  int vIndex = data.indexOf("V:");
  int iIndex = data.indexOf(";I:");
  int bIndex = data.indexOf(";B:");
  int lastSemiColon = data.lastIndexOf(";");

  // Gerekli tüm belirteçler mevcut mu kontrol et
  if (vIndex != -1 && iIndex != -1 && bIndex != -1) {
    
    // Voltaj değerini ayıkla (V: ile ;I: arası)
    String vStr = data.substring(vIndex + 2, iIndex);
    
    // Akım değerini ayıkla (;I: ile ;B: arası)
    String iStr = data.substring(iIndex + 3, bIndex);

    // Batarya değerini ayıkla (;B: ile sondaki ; arası)
    String bStr = "";
    if (lastSemiColon > bIndex + 3) {
      bStr = data.substring(bIndex + 3, lastSemiColon);
    } else {
      bStr = data.substring(bIndex + 3);
    }

    v = vStr.toFloat();
    i = iStr.toFloat();
    b = bStr.toInt();

    // Debug: Gelen veriyi ESP'nin bağlı olduğu bilgisayardan görmek isterseniz:
    /*
    Serial.print("Parsed -> V: ");
    Serial.print(v);
    Serial.print(" I: ");
    Serial.print(i);
    Serial.print(" B: ");
    Serial.println(b);
    */
  }
}

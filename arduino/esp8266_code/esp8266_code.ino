#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// --- WiFi Ayarları ---
const char* ssid = "pixel";
const char* password = "12312312";

// --- Sunucu Ayarları ---
const char* serverAddress = "https://iauiotsolar.onrender.com/api/esp/data";

// --- Zamanlama Değişkenleri ---
unsigned long previousMillis = 0;
const long httpInterval = 3000; // 3 saniyede bir veri gönder

// --- Sensör Verileri ---
float v = 0.0;
float i = 0.0;

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
      WiFiClient client;
      HTTPClient http;

      http.begin(client, serverAddress);
      http.addHeader("Content-Type", "application/json");

      // JSON Objesi Oluşturma
      StaticJsonDocument<200> docOut;
      docOut["voltage"] = v;
      docOut["current"] = i;

      String requestBody;
      serializeJson(docOut, requestBody);

      // Veriyi Gönder
      int httpResponseCode = http.POST(requestBody);

      // Yanıtı Kontrol Et
      if (httpResponseCode > 0) {
        String response = http.getString();
        // Gerekirse sunucu yanıtını burada işleyebilirsiniz
      } else {
        Serial.print("Hata Kodu: ");
        Serial.println(httpResponseCode);
      }
      
      http.end();
    } else {
      Serial.println("WiFi Baglantisi Kesildi!");
    }
  }
}

// --- Veri Parçalama Fonksiyonu ---
void parseArduinoData(String data) {
  // Beklenen format: "V:12.50;I:1.20;"
  
  int vIndex = data.indexOf("V:");
  int iIndex = data.indexOf(";I:");
  int lastSemiColon = data.lastIndexOf(";");

  // Gerekli tüm belirteçler mevcut mu kontrol et
  if (vIndex != -1 && iIndex != -1) {
    
    // Voltaj değerini ayıkla (V: ile ;I: arası)
    String vStr = data.substring(vIndex + 2, iIndex);
    
    // Akım değerini ayıkla (;I: ile sondaki ; arası)
    String iStr = "";
    if (lastSemiColon > iIndex + 3) {
      iStr = data.substring(iIndex + 3, lastSemiColon);
    } else {
      iStr = data.substring(iIndex + 3);
    }

    v = vStr.toFloat();
    i = iStr.toFloat();

    // Debug: Gelen veriyi ESP'nin bağlı olduğu bilgisayardan görmek isterseniz:
    /*
    Serial.print("Parsed -> V: ");
    Serial.print(v);
    Serial.print(" I: ");
    Serial.println(i);
    */
  }
}
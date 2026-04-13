#include <Wire.h> 
#include <LiquidCrystal_I2C.h>
#include <SoftwareSerial.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
SoftwareSerial espSerial(10, 11); 
const long interval = 2000; 
unsigned long previousMillis = 0;

// -------- PINLER --------
const int PanelPin = A0;
const int Panel_Voltage_sensorPin = A1;
const int Battery_Voltage_sensorPin = A2; // Batarya voltajı (0-25V)
const int relayPin = 4; // Role pini eklendi

// -------- SABİTLER --------
const float Vref = 5.0;
const float sensitivity = 0.1; // ACS712 (20A için 0.1)

// -------- DEĞİŞKENLER --------
float offsetVoltage = 0;
float Panel_voltage = 0;
float current = 0;
float Panel_Power = 0;
float Battery_voltage = 0; // Akü Voltajı
int batteryPerc = 0; // Akü Yüzdesi

// -------- SETUP --------
void setup() {
  Serial.begin(9600);
  espSerial.begin(9600); 
  lcd.begin();
  lcd.backlight();

  lcd.setCursor(4,0);
  lcd.print("IoT Solar");
  lcd.setCursor(5,1);
  lcd.print("Monitor");
  delay(2000);

  lcd.clear();
  lcd.setCursor(2,0);
  lcd.print("Calibration");
  delay(2000);

  Serial.println("Calibration...");
  delay(2000);

  offsetVoltage = calibrate();

  Serial.print("Offset: ");
  Serial.println(offsetVoltage, 3);

  lcd.clear();

  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW); // Role baslangicta KAPALI
}

// -------- GERİLİM OKUMA --------
void voltage_Panel(){
  int value_Panel = analogRead(Panel_Voltage_sensorPin);
  Panel_voltage = value_Panel * (25.0 / 1023.0); // 0-25V

  Serial.print("Panel Gerilimi: ");
  Serial.print(Panel_voltage);
  Serial.println(" V");
}

void voltage_Battery(){
  int value_Battery = analogRead(Battery_Voltage_sensorPin);
  Battery_voltage = value_Battery * (25.0 / 1023.0); // 0-25V modül

  // Basit Pil Yüzdesi Hesabı (12V Kurşun-Asit: 10.5V ile 12.6V arası)
  float perc = ((Battery_voltage - 10.5) / (12.6 - 10.5)) * 100.0;
  if (perc > 100) perc = 100;
  if (perc < 0) perc = 0;
  batteryPerc = (int)perc;

  Serial.print("Akü Gerilimi: ");
  Serial.print(Battery_voltage);
  Serial.print(" V (Doluluk: %");
  Serial.print(batteryPerc);
  Serial.println(")");
}

// -------- AKIM OKUMA --------
void Current_Panel(){
  current = readCurrentFiltered();

  Serial.print("Akım: ");
  Serial.print(current, 2);
  Serial.println(" A");
}

// -------- GÜÇ HESABI --------
void Power(){
  Panel_Power = Panel_voltage * current;

  Serial.print("Guc: ");
  Serial.print(Panel_Power);
  Serial.println(" W");
}

// -------- LCD GÖSTERİM --------
void displayLCD(){
  lcd.clear();

  lcd.setCursor(0,0);
  lcd.print("V:");
  lcd.print(Panel_voltage,1);
  lcd.print("V");

  lcd.setCursor(9,0);
  lcd.print("I:");
  lcd.print(current,1);
  lcd.print("A");

  lcd.setCursor(0,1);
  lcd.print("P:");
  lcd.print(Panel_Power,1);
  lcd.print("W");
}

// -------- KALİBRASYON --------
float calibrate() {
  long sum = 0;
  int N = 1000;

  for (int i = 0; i < N; i++) {
    sum += analogRead(PanelPin);
    delay(1);
  }

  float avg = sum / (float)N;
  return avg * (Vref / 1023.0);
}

// -------- FİLTRELİ AKIM --------
float readCurrentFiltered() {
  long sum = 0;
  int N = 200;

  for (int i = 0; i < N; i++) {
    sum += analogRead(PanelPin);
  }

  float avg = sum / (float)N;
  float voltage = avg * (Vref / 1023.0);

  float currentValue = (voltage - offsetVoltage) / sensitivity;

  // Gürültü temizleme
  if (abs(currentValue) < 0.05) currentValue = 0;

  return currentValue;
}

// -------- LOOP --------
void loop() {
  unsigned long currentMillis = millis();

  // 1. Sensörleri Okuma ve Gönderme (2 saniyede bir)
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    voltage_Panel();
    voltage_Battery(); // Batarya voltajını da okuyoruz
    Current_Panel();
    Power();
    displayLCD();
    
    // ESP'ye gönderilecek veriye ;B: parametresini ekliyoruz
    String dataString = "V:" + String(Panel_voltage, 2) + ";I:" + String(current, 2) + ";B:" + String(batteryPerc) + ";\n";
    espSerial.print(dataString);
    
    Serial.print("Gonderilen: ");
    Serial.println(dataString);
  }

  // 2. ESP8266'dan Gelen Komutları Dinleme
  if (espSerial.available()) {
    String inData = espSerial.readStringUntil('\n');
    inData.trim();
    
    if (inData == "R1") {
      digitalWrite(relayPin, LOW); // Roleyi AC (Aktif Yüksek)
      Serial.println("Komut Alindi: Role ACIK");
    } 
    else if (inData == "R0") {
      digitalWrite(relayPin, HIGH);  // Roleyi KAPAT (Aktif Düşük)
      Serial.println("Komut Alindi: Role KAPALI");
    }
  }
}

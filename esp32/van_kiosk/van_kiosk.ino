// van_kiosk.ino — ESP32 booking kiosk for one stop on the Costanera corridor.
//
// It uses the SAME Supabase database as the website, through the same two
// database functions:
//   get_slots  -> the departures, seats booked and status (never riders' names)
//   book_seat  -> books one seat; the database decides, so the kiosk and the
//                 website can never sell the same last seat twice
//
// Hardware (change the pins below if yours differ):
//   - 16x2 LCD with I2C backpack (SDA 21, SCL 22, address 0x27)
//   - potentiometer on GPIO 34: turn it to choose a departure
//   - the knob's built-in push switch on GPIO 13 to GND: press to book (press twice to confirm)
//
// Libraries (Arduino Library Manager): ArduinoJson (v7), LiquidCrystal_I2C.
// Board: "ESP32 Dev Module" (ESP32 core by Espressif).
//
// Put your Wi-Fi name/password and the Supabase details in secrets.h
// (copy secrets.example.h). Never commit secrets.h: it has the Wi-Fi password.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include "secrets.h"   // WIFI_SSID, WIFI_PASSWORD, SUPABASE_URL, SUPABASE_KEY

// ---------- Settings for THIS kiosk ----------
const char* KIOSK_STOP = "Sichez";          // the stop where this kiosk stands (exactly as in the stops table)
const char* KIOSK_NAME = "Kiosko Sichez";   // the "first name" drivers see for kiosk bookings
const int   LIMA_OFFSET_S = -5 * 3600;      // Peru is UTC-5 all year (no summer time)
const unsigned long REFRESH_MS = 60000;     // reload departures every 60 s

// ---------- Pins ----------
const int POT_PIN = 34;      // input-only ADC pin, fine for a potentiometer
const int BUTTON_PIN = 13;   // the knob's push switch, between this pin and GND

LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------- Departures, as the kiosk shows them ----------
struct Trip {
  long id;
  time_t pickup;        // when the van reaches THIS stop (UTC epoch), delay included
  bool toTalara;
  int seatsLeft;
  bool bookable;        // false if full, leaving or cancelled
  int delayMin;
};

const int MAX_TRIPS = 20;
Trip trips[MAX_TRIPS];
int tripCount = 0;
bool online = false;    // did the last refresh work?
unsigned long lastRefresh = 0;

// minutes from Talara of this stop and of the far end (Lobitos), from get_stops
int stopMinutes = -1;
int maxMinutes = -1;

// ---------- Small helpers ----------
void show(const String& line1, const String& line2) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1); lcd.print(line2.substring(0, 16));
}

// days since 1970-01-01 for a calendar date (works without the time zone)
long daysFromCivil(int y, int m, int d) {
  y -= m <= 2;
  long era = (y >= 0 ? y : y - 399) / 400;
  long yoe = y - era * 400;
  long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

// "2026-11-23T12:00:00+00:00" -> UTC epoch seconds
time_t parseUtc(const char* iso) {
  int y, mo, d, h, mi, s = 0;
  if (sscanf(iso, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &s) < 5) return 0;
  return (time_t)(daysFromCivil(y, mo, d) * 86400L + h * 3600L + mi * 60L + s);
}

// a random request id, so a retried booking is never booked twice
String newRequestId() {
  char buf[37];
  uint32_t r[4] = { esp_random(), esp_random(), esp_random(), esp_random() };
  r[1] = (r[1] & 0xFFFF0FFF) | 0x00004000;   // version 4
  r[2] = (r[2] & 0x3FFFFFFF) | 0x80000000;   // variant
  snprintf(buf, sizeof(buf), "%08x-%04x-%04x-%04x-%04x%08x",
           r[0], r[1] >> 16, r[1] & 0xFFFF, r[2] >> 16, r[2] & 0xFFFF, r[3]);
  return String(buf);
}

// Call a Supabase database function (the same calls the website makes).
// Returns the HTTP status, and the reply in `reply`.
int callRpc(const char* name, const String& body, String& reply) {
  WiFiClientSecure client;
  client.setInsecure();   // prototype only: skips the certificate check. For a real launch, add Supabase's root certificate.
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/" + name;
  if (!http.begin(client, url)) return -1;
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  int code = http.POST(body);
  reply = code > 0 ? http.getString() : "";
  http.end();
  return code;
}

// ---------- Loading departures ----------
bool loadStops() {
  String reply;
  if (callRpc("get_stops", "{}", reply) != 200) return false;
  JsonDocument doc;
  if (deserializeJson(doc, reply)) return false;
  maxMinutes = 0;
  for (JsonObject s : doc.as<JsonArray>()) {
    int m = s["minutes_from_talara"] | 0;
    if (m > maxMinutes) maxMinutes = m;
    if (strcmp(s["name"] | "", KIOSK_STOP) == 0) stopMinutes = m;
  }
  return stopMinutes >= 0;
}

bool loadTrips() {
  if (stopMinutes < 0 && !loadStops()) return false;

  String reply;
  if (callRpc("get_slots", "{}", reply) != 200) return false;
  JsonDocument doc;
  if (deserializeJson(doc, reply)) return false;

  time_t now = time(nullptr);
  tripCount = 0;
  for (JsonObject t : doc.as<JsonArray>()) {
    if (tripCount >= MAX_TRIPS) break;
    if (strcmp(t["vehicle"] | "van", "van") != 0) continue;

    const char* status = t["status"] | "scheduled";
    if (strcmp(status, "cancelled") == 0) continue;   // cancelled trips aren't shown

    bool toTalara = strcmp(t["direction"] | "to_talara", "to_talara") == 0;
    int delay = strcmp(status, "delayed") == 0 ? (t["delay_minutes"] | 0) : 0;

    // When the van reaches this stop: to Talara it starts at Lobitos (the far end),
    // back to Lobitos it starts at Talara.
    int offsetMin = toTalara ? (maxMinutes - stopMinutes) : stopMinutes;
    if (toTalara && stopMinutes == 0) continue;           // Talara is the end of that trip
    if (!toTalara && stopMinutes == maxMinutes) continue; // Lobitos is the end of that trip

    const char* departs = t["departs_at"].as<const char*>();
    if (!departs) continue;
    time_t pickup = parseUtc(departs) + (offsetMin + delay) * 60;
    if (pickup <= now) continue;                          // already gone

    int seatsLeft = (t["capacity"] | 0) - (t["booked"] | 0);
    Trip& x = trips[tripCount++];
    x.id = t["trip_id"] | 0L;
    x.pickup = pickup;
    x.toTalara = toTalara;
    x.seatsLeft = seatsLeft;
    x.delayMin = delay;
    x.bookable = seatsLeft > 0 && strcmp(status, "full") != 0 && strcmp(status, "leaving") != 0;
  }
  return true;
}

void refresh() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  online = WiFi.status() == WL_CONNECTED && loadTrips();
  lastRefresh = millis();
}

// ---------- Showing one departure ----------
void showTrip(int i) {
  if (tripCount == 0) {
    show(online ? "No hay salidas" : "Sin conexion", online ? "por ahora" : "Reintentando...");
    return;
  }
  Trip& t = trips[i];
  time_t local = t.pickup + LIMA_OFFSET_S;
  time_t today = time(nullptr) + LIMA_OFFSET_S;
  struct tm lt;
  gmtime_r(&local, &lt);

  long dayDiff = (long)(local / 86400) - (long)(today / 86400);
  char day[4];
  if (dayDiff == 0) strcpy(day, "Hoy");
  else if (dayDiff == 1) strcpy(day, "Man");   // "Manana" (no n-tilde on most LCDs)
  else snprintf(day, sizeof(day), "%02d", lt.tm_mday);

  // Line 1: time at this stop and where the van goes, e.g. "12:22 a Lobitos"
  // Line 2: the day, then the seats, e.g. "Man Libres:7 OK" (16 characters max)
  char line1[17], line2[17];
  snprintf(line1, sizeof(line1), "%02d:%02d a %s", lt.tm_hour, lt.tm_min, t.toTalara ? "Talara" : "Lobitos");
  if (!online) snprintf(line2, sizeof(line2), "%-3s Sin conexion", day);
  else if (!t.bookable) snprintf(line2, sizeof(line2), "%-3s LLENA", day);
  else if (t.delayMin > 0) snprintf(line2, sizeof(line2), "%-3s +%dm Libre:%d", day, t.delayMin, t.seatsLeft);
  else snprintf(line2, sizeof(line2), "%-3s Libres:%d OK", day, t.seatsLeft);
  show(line1, line2);
}

// ---------- Booking ----------
void book(Trip& t) {
  show("Reservando...", "");
  JsonDocument body;
  body["p_trip_id"] = t.id;
  body["p_first_name"] = KIOSK_NAME;
  body["p_boarding_stop"] = KIOSK_STOP;
  body["p_dropoff_stop"] = nullptr;          // null = to the end of the line
  body["p_request_id"] = newRequestId();
  String json;
  serializeJson(body, json);

  String reply;
  int code = callRpc("book_seat", json, reply);
  JsonDocument doc;
  if (code != 200 || deserializeJson(doc, reply)) {
    show("Sin conexion", "No se reservo");
    delay(4000);
    return;
  }
  const char* status = doc[0]["status"] | "";
  if (strcmp(status, "booked") == 0) {
    show(String("Codigo:") + (const char*)(doc[0]["code"] | ""), "Muestralo chofer");
    delay(20000);                          // time to note the code
  } else if (strcmp(status, "full") == 0) {
    show("Van llena", "Elige otra");
    delay(4000);
  } else {
    show("No disponible", status);
    delay(4000);
  }
  refresh();
}

// ---------- Setup and loop ----------
void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  lcd.init();
  lcd.backlight();
  show("Van Lobitos", "Conectando...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);

  configTime(0, 0, "pool.ntp.org", "time.google.com");   // the clock, in UTC
  for (int i = 0; i < 40 && time(nullptr) < 1700000000; i++) delay(250);

  refresh();
}

void loop() {
  static int current = -1;
  static bool confirming = false;
  static unsigned long confirmUntil = 0;

  if (millis() - lastRefresh > REFRESH_MS) { refresh(); current = -1; }

  // The potentiometer picks a departure
  int index = tripCount > 0 ? map(analogRead(POT_PIN), 0, 4095, 0, tripCount - 1) : 0;
  if (index != current) {
    current = index;
    confirming = false;
    showTrip(current);
  }

  // The button: first press asks to confirm, second press books
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(40);                                   // debounce
    if (digitalRead(BUTTON_PIN) == LOW && tripCount > 0 && online && trips[current].bookable) {
      if (!confirming) {
        confirming = true;
        confirmUntil = millis() + 5000;
        show("Reservar asiento", "Pulsa otra vez");
      } else {
        confirming = false;
        book(trips[current]);
        current = -1;                            // redraw
      }
    }
    while (digitalRead(BUTTON_PIN) == LOW) delay(10);   // wait for release
  }
  if (confirming && millis() > confirmUntil) { confirming = false; current = -1; }

  delay(50);
}
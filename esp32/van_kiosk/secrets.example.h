// Copy this file to secrets.h and fill it in.
// secrets.h is listed in .gitignore: never commit it, because it holds the Wi-Fi password.

#pragma once

#define WIFI_SSID      "your-wifi-name"
#define WIFI_PASSWORD  "your-wifi-password"

// The same two values as the website's stage1/config.js.
// The publishable key is designed to be public; the database rules protect the data.
#define SUPABASE_URL   "https://YOUR-PROJECT-ID.supabase.co"
#define SUPABASE_KEY   "sb_publishable_..."
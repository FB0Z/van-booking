-- ========================================================
-- TRANSPORT SYSTEM DATABASE SCHEMA
-- ========================================================

-- 1. VANS TABLE: Stores fleet details
CREATE TABLE IF NOT EXISTS vans (
    van_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    number TEXT NOT NULL UNIQUE
);

-- 2. DRIVERS TABLE: Stores driver info linked to a van
CREATE TABLE IF NOT EXISTS drivers (
    driver_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    van_id INTEGER REFERENCES vans(van_id)
);

-- 3. TRIPS TABLE: Scheduled rides linked to a driver
CREATE TABLE IF NOT EXISTS trips (
    trip_id SERIAL PRIMARY KEY,
    destination TEXT NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    max_capacity INTEGER NOT NULL,
    driver_id INTEGER REFERENCES drivers(driver_id),
    status TEXT DEFAULT 'upcoming'
);

-- 4. CUSTOMERS TABLE: Stores passenger profiles
CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    number TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BOOKINGS TABLE: Connects customers to trips
CREATE TABLE IF NOT EXISTS bookings (
    booking_id SERIAL PRIMARY KEY,
    trip_id INTEGER REFERENCES trips(trip_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    number_of_passengers INTEGER NOT NULL,
    booking_method TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed',
    booked_at TIMESTAMPTZ DEFAULT NOW()
);

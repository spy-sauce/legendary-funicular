CREATE TABLE profiles (id uuid PRIMARY KEY, name text);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE bookings (id uuid PRIMARY KEY, talent_id uuid);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE TABLE profiles (id uuid PRIMARY KEY, name text);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Forgot RLS on bookings
CREATE TABLE bookings (id uuid PRIMARY KEY, talent_id uuid);

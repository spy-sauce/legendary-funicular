CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,    -- @pii email
  phone text,             -- @pii phone
  legal_name text         -- @pii name
);

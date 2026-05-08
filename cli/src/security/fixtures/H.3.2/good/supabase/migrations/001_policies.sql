CREATE POLICY "anon read public profiles" ON profiles
  FOR SELECT TO anon
  USING (is_public = true);

GRANT SELECT (id, display_name) ON profiles TO anon;

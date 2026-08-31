
-- Feature flag
INSERT INTO public.features (key, name, description, category, enabled_globally)
VALUES ('digital_signage', 'Digital Signage', 'In-store TV/monitor advertisement displays with playlists and scheduling.', 'Marketing', true)
ON CONFLICT (key) DO NOTHING;

-- Advertisements
CREATE TABLE public.signage_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  ad_type text NOT NULL DEFAULT 'image',
  title text,
  description text,
  media_url text,
  media_path text,
  media_mime text,
  media_size bigint,
  thumbnail_url text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  use_live_data boolean NOT NULL DEFAULT true,
  offer_text text,
  qr_url text,
  show_qr boolean NOT NULL DEFAULT false,
  duration_seconds integer NOT NULL DEFAULT 10,
  use_full_video boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  days_of_week integer[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  display_count integer NOT NULL DEFAULT 0,
  last_displayed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signage_ads_type_chk CHECK (ad_type IN ('image','video','text','product','promotion')),
  CONSTRAINT signage_ads_status_chk CHECK (status IN ('draft','active','inactive')),
  CONSTRAINT signage_ads_duration_chk CHECK (duration_seconds BETWEEN 1 AND 3600)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signage_ads TO authenticated;
GRANT ALL ON public.signage_ads TO service_role;
ALTER TABLE public.signage_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff manage own ads" ON public.signage_ads FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

-- Playlists
CREATE TABLE public.signage_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signage_playlists TO authenticated;
GRANT ALL ON public.signage_playlists TO service_role;
ALTER TABLE public.signage_playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff manage own playlists" ON public.signage_playlists FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

CREATE TABLE public.signage_playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  playlist_id uuid NOT NULL REFERENCES public.signage_playlists(id) ON DELETE CASCADE,
  ad_id uuid NOT NULL REFERENCES public.signage_ads(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, ad_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signage_playlist_items TO authenticated;
GRANT ALL ON public.signage_playlist_items TO service_role;
ALTER TABLE public.signage_playlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff manage own playlist items" ON public.signage_playlist_items FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

-- Displays
CREATE TABLE public.signage_displays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  playlist_id uuid REFERENCES public.signage_playlists(id) ON DELETE SET NULL,
  pair_code text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  paired_at timestamptz,
  orientation text NOT NULL DEFAULT 'landscape',
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signage_displays_status_chk CHECK (status IN ('active','revoked')),
  CONSTRAINT signage_displays_orient_chk CHECK (orientation IN ('landscape','portrait','auto'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signage_displays TO authenticated;
GRANT ALL ON public.signage_displays TO service_role;
ALTER TABLE public.signage_displays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff manage own displays" ON public.signage_displays FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));
CREATE POLICY "Super admin monitors displays" ON public.signage_displays FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Per-business display settings
CREATE TABLE public.signage_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  default_playlist_id uuid REFERENCES public.signage_playlists(id) ON DELETE SET NULL,
  transition text NOT NULL DEFAULT 'fade',
  default_duration integer NOT NULL DEFAULT 10,
  video_autoplay boolean NOT NULL DEFAULT true,
  video_muted boolean NOT NULL DEFAULT true,
  loop_playlist boolean NOT NULL DEFAULT true,
  orientation text NOT NULL DEFAULT 'landscape',
  show_clock boolean NOT NULL DEFAULT true,
  show_business_name boolean NOT NULL DEFAULT true,
  show_logo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signage_settings_transition_chk CHECK (transition IN ('fade','slide','none')),
  CONSTRAINT signage_settings_orient_chk CHECK (orientation IN ('landscape','portrait','auto'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signage_settings TO authenticated;
GRANT ALL ON public.signage_settings TO service_role;
ALTER TABLE public.signage_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff manage own signage settings" ON public.signage_settings FOR ALL TO authenticated
  USING (public.can_access_business(business_id)) WITH CHECK (public.can_access_business(business_id));

CREATE TRIGGER trg_signage_ads_updated BEFORE UPDATE ON public.signage_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_signage_playlists_updated BEFORE UPDATE ON public.signage_playlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_signage_displays_updated BEFORE UPDATE ON public.signage_displays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_signage_settings_updated BEFORE UPDATE ON public.signage_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX signage_ads_business_idx ON public.signage_ads(business_id);
CREATE INDEX signage_items_playlist_idx ON public.signage_playlist_items(playlist_id, sort_order);
CREATE INDEX signage_displays_business_idx ON public.signage_displays(business_id);

-- Pair code generator (business scoped, staff only)
CREATE OR REPLACE FUNCTION public.signage_new_pair_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  LOOP
    c := upper(substr(encode(gen_random_bytes(6),'hex'), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.signage_displays WHERE pair_code = c);
  END LOOP;
  RETURN c;
END; $$;
REVOKE EXECUTE ON FUNCTION public.signage_new_pair_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signage_new_pair_code() TO authenticated;

-- Display pairing: exchange a short code for a long-lived token
CREATE OR REPLACE FUNCTION public.signage_pair_display(p_code text)
RETURNS TABLE(token text, display_name text, business_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.signage_displays%ROWTYPE; b public.businesses%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.signage_displays
    WHERE pair_code = upper(btrim(p_code)) AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or revoked display code'; END IF;
  SELECT * INTO b FROM public.businesses WHERE id = d.business_id;
  IF b.status <> 'active' OR NOT public.is_feature_enabled(d.business_id, 'digital_signage') THEN
    RAISE EXCEPTION 'Digital signage is not available for this business';
  END IF;
  UPDATE public.signage_displays SET paired_at = now(), last_seen_at = now() WHERE id = d.id;
  RETURN QUERY SELECT d.token, d.name, b.name;
END; $$;
REVOKE EXECUTE ON FUNCTION public.signage_pair_display(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signage_pair_display(text) TO anon, authenticated;

-- Display content: only what a TV needs
CREATE OR REPLACE FUNCTION public.signage_display_content(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.signage_displays%ROWTYPE; b public.businesses%ROWTYPE;
  s public.signage_settings%ROWTYPE; v_playlist uuid; v_items jsonb;
BEGIN
  SELECT * INTO d FROM public.signage_displays WHERE token = p_token AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Display not registered'; END IF;
  SELECT * INTO b FROM public.businesses WHERE id = d.business_id;
  IF b.status <> 'active' OR NOT public.is_feature_enabled(d.business_id, 'digital_signage') THEN
    RAISE EXCEPTION 'Digital signage is disabled';
  END IF;
  SELECT * INTO s FROM public.signage_settings WHERE business_id = d.business_id;
  v_playlist := COALESCE(d.playlist_id, s.default_playlist_id,
    (SELECT id FROM public.signage_playlists WHERE business_id = d.business_id AND is_default AND is_active LIMIT 1),
    (SELECT id FROM public.signage_playlists WHERE business_id = d.business_id AND is_active ORDER BY created_at LIMIT 1));

  UPDATE public.signage_displays SET last_seen_at = now() WHERE id = d.id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'sort'), '[]'::jsonb) INTO v_items FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'sort', lpad(i.sort_order::text, 6, '0'),
      'type', a.ad_type,
      'name', a.name,
      'title', a.title,
      'description', a.description,
      'media_url', a.media_url,
      'thumbnail_url', a.thumbnail_url,
      'offer_text', a.offer_text,
      'duration', a.duration_seconds,
      'use_full_video', a.use_full_video,
      'show_qr', a.show_qr,
      'qr_url', a.qr_url,
      'start_time', a.start_time,
      'end_time', a.end_time,
      'days_of_week', a.days_of_week,
      'product', CASE WHEN a.product_id IS NOT NULL AND a.use_live_data THEN
        (SELECT jsonb_build_object('name', p.name, 'description', p.description, 'mrp', p.mrp,
                'price', p.selling_price, 'discount', p.discount, 'unit', p.unit,
                'image', p.image_lg, 'in_stock', p.current_stock > 0)
         FROM public.products p WHERE p.id = a.product_id AND p.business_id = a.business_id) END,
      'promotion', CASE WHEN a.promotion_id IS NOT NULL THEN
        (SELECT jsonb_build_object('title', pr.title, 'description', pr.description,
                'discount_type', pr.discount_type, 'discount_value', pr.discount_value)
         FROM public.promotions pr WHERE pr.id = a.promotion_id AND pr.business_id = a.business_id) END
    ) AS x
    FROM public.signage_playlist_items i
    JOIN public.signage_ads a ON a.id = i.ad_id AND a.business_id = d.business_id
    WHERE i.playlist_id = v_playlist AND i.enabled
      AND a.status = 'active'
      AND (a.start_date IS NULL OR a.start_date <= CURRENT_DATE)
      AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
  ) t;

  RETURN jsonb_build_object(
    'display', jsonb_build_object('id', d.id, 'name', d.name, 'orientation', d.orientation),
    'business', jsonb_build_object('name', b.name, 'subdomain', b.subdomain, 'logo_url', b.logo_url),
    'settings', jsonb_build_object(
      'transition', COALESCE(s.transition, 'fade'),
      'default_duration', COALESCE(s.default_duration, 10),
      'video_muted', COALESCE(s.video_muted, true),
      'video_autoplay', COALESCE(s.video_autoplay, true),
      'loop_playlist', COALESCE(s.loop_playlist, true),
      'orientation', COALESCE(NULLIF(d.orientation,'auto'), s.orientation, 'landscape'),
      'show_clock', COALESCE(s.show_clock, true),
      'show_business_name', COALESCE(s.show_business_name, true),
      'show_logo', COALESCE(s.show_logo, false)
    ),
    'items', v_items
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.signage_display_content(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signage_display_content(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.signage_heartbeat(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.signage_displays SET last_seen_at = now() WHERE token = p_token AND status = 'active';
$$;
REVOKE EXECUTE ON FUNCTION public.signage_heartbeat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signage_heartbeat(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.signage_log_play(p_token text, p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bid uuid;
BEGIN
  SELECT business_id INTO v_bid FROM public.signage_displays WHERE token = p_token AND status = 'active';
  IF v_bid IS NULL THEN RETURN; END IF;
  UPDATE public.signage_ads SET display_count = display_count + 1, last_displayed_at = now()
    WHERE id = p_ad_id AND business_id = v_bid;
  UPDATE public.signage_displays SET last_seen_at = now() WHERE token = p_token;
END; $$;
REVOKE EXECUTE ON FUNCTION public.signage_log_play(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signage_log_play(text, uuid) TO anon, authenticated;

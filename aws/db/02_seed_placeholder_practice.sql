-- Placeholder for production state the later migrations assume already exists.
-- 20260927210232_tenant_security_hardening.sql seeds a Greyfinch integration for
-- 'miller-ortho' and bootstraps platform admins from its active admins, so the practice row
-- must exist first. Synthetic only: no patient or staff data.
-- Not needed on AWS when loading a real production dump, which already contains this row.
INSERT INTO auth.users(id, email, email_confirmed_at)
VALUES ('00000000-0000-0000-0000-00000000a001', 'placeholder-owner@invalid.test', now())
ON CONFLICT DO NOTHING;
INSERT INTO public.practices(id, name) VALUES ('miller-ortho', 'Placeholder Practice')
ON CONFLICT DO NOTHING;
INSERT INTO public.tc_users(auth_user_id, name, email, role, status, practice_id)
VALUES ('00000000-0000-0000-0000-00000000a001', 'Placeholder Owner', 'placeholder-owner@invalid.test', 'admin', 'active', 'miller-ortho');
